// ============================================================
// Worker de mídia (ADR 0010, Fase 4a).
//
// Consome a fila que a API enche ao concluir um upload e produz o
// que o editor precisa: proxy 720p, thumbnail, áudio 16 kHz para a
// transcrição e o mapa de silêncios.
//
// As duas contenções do ADR 0003 estão aqui, e não são detalhe:
//
//   - LOCK GLOBAL: a VPS é compartilhada com outras cinco aplicações.
//     Dois FFmpeg simultâneos derrubam os vizinhos, então um job
//     pesado por vez, com fila de espera;
//   - ESPAÇO TEMPORÁRIO: cada job trabalha num diretório próprio que
//     se apaga no `finally`. Um worker que morre no meio não deixa
//     50 GB de intermediários no disco de 10 GB.
// ============================================================

import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@makucho/studio-database';
import {
  comEspacoDeTrabalho,
  comLockGlobal,
  detectarSilencios,
  extrairAudio,
  gerarProxy,
  gerarThumbnail,
  lerMetadados,
  verificarLimite,
} from '@makucho/studio-worker-core';
import { copyFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

const FILA = 'studio:media';

const RAIZ_DO_STORAGE = resolve(process.env.STORAGE_DISK_PATH ?? '/app/storage/media');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** 720p de altura no formato vertical: leve para assistir, nítido o
    bastante para escolher um corte. */
const PROXY_LARGURA = 405;
const PROXY_ALTURA = 720;

interface DadosDoJob {
  projectId: string;
  mediaSourceId: string;
}

const prisma = new PrismaClient();

// `maxRetriesPerRequest: null` é exigência do BullMQ para o consumidor
// bloqueante: sem isso o ioredis aborta a espera e o worker fica
// surdo para a fila.
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

/** Caminho absoluto de uma chave, conferido contra a raiz. */
function caminhoDe(chave: string): string {
  const completo = resolve(RAIZ_DO_STORAGE, chave);
  if (completo !== RAIZ_DO_STORAGE && !completo.startsWith(RAIZ_DO_STORAGE + sep)) {
    throw new Error(`chave de storage fora da raiz: ${chave}`);
  }
  return completo;
}

async function processar(job: Job<DadosDoJob>): Promise<void> {
  const { projectId, mediaSourceId } = job.data;

  const original = await prisma.mediaSource.findUnique({ where: { id: mediaSourceId } });
  if (!original) throw new Error(`mídia ${mediaSourceId} não existe`);

  const projeto = await prisma.project.findUnique({ where: { id: projectId } });
  if (!projeto) throw new Error(`projeto ${projectId} não existe`);

  const entrada = caminhoDe(original.storageKey);
  const prefixoNoStorage = dirname(original.storageKey);

  // O lock serializa o trabalho pesado; o espaço temporário garante a
  // limpeza. Nesta ordem: esperar o lock com um diretório já criado
  // deixaria disco ocupado por um job que ainda não começou.
  await comLockGlobal(redis, async (renovar) => {
    await comEspacoDeTrabalho(async (espaco) => {
      // ---------- Metadados ----------
      const probe = await lerMetadados(entrada);
      await job.updateProgress(5);

      await prisma.mediaSource.update({
        where: { id: mediaSourceId },
        data: {
          durationMs: probe.durationMs,
          widthPx: probe.widthPx,
          heightPx: probe.heightPx,
          fps: probe.fps,
          videoCodec: probe.videoCodec ?? null,
          audioCodec: probe.audioCodec ?? null,
        },
      });

      // ---------- Proxy ----------
      const proxyTmp = espaco.arquivo('proxy.mp4');
      await gerarProxy({
        entrada,
        saida: proxyTmp,
        larguraPx: PROXY_LARGURA,
        alturaPx: PROXY_ALTURA,
        duracaoTotalMs: probe.durationMs,
        aoProgredir: (fracao) => {
          // O progresso do FFmpeg vira progresso do job: a tela mostra
          // uma barra que anda, não um spinner indefinido.
          void job.updateProgress(5 + Math.round(fracao * 50));
          void renovar();
        },
      });

      await verificarLimite(espaco);
      await publicar(proxyTmp, `${prefixoNoStorage}/proxy.mp4`);

      await prisma.mediaSource.create({
        data: {
          projectId,
          kind: 'PROXY',
          storageKey: `${prefixoNoStorage}/proxy.mp4`,
          mimeType: 'video/mp4',
          sizeBytes: BigInt(await tamanhoDe(`${prefixoNoStorage}/proxy.mp4`)),
          durationMs: probe.durationMs,
          widthPx: PROXY_LARGURA,
          heightPx: PROXY_ALTURA,
        },
      });

      await job.updateProgress(60);

      // ---------- Thumbnail ----------
      //
      // Um terço do vídeo, não o primeiro quadro: o começo costuma ser
      // a pessoa se ajeitando na cadeira.
      const thumbTmp = espaco.arquivo('thumb.jpg');
      await gerarThumbnail(entrada, thumbTmp, Math.round(probe.durationMs / 3));
      await publicar(thumbTmp, `${prefixoNoStorage}/thumb.jpg`);

      await prisma.mediaSource.create({
        data: {
          projectId,
          kind: 'THUMBNAIL',
          storageKey: `${prefixoNoStorage}/thumb.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: BigInt(await tamanhoDe(`${prefixoNoStorage}/thumb.jpg`)),
        },
      });

      await job.updateProgress(70);

      // ---------- Áudio para transcrição ----------
      const audioTmp = espaco.arquivo('audio.wav');
      await extrairAudio(entrada, audioTmp);
      await verificarLimite(espaco);
      await publicar(audioTmp, `${prefixoNoStorage}/audio.wav`);

      await prisma.mediaSource.create({
        data: {
          projectId,
          kind: 'AUDIO',
          storageKey: `${prefixoNoStorage}/audio.wav`,
          mimeType: 'audio/wav',
          sizeBytes: BigInt(await tamanhoDe(`${prefixoNoStorage}/audio.wav`)),
          durationMs: probe.durationMs,
        },
      });

      await job.updateProgress(85);

      // ---------- Silêncios ----------
      //
      // Determinístico e barato: é o que a Fase 5 usa para remover
      // pausas sem precisar de IA (ADR 0010).
      //
      // Eles ficam num arquivo ao lado do áudio, e não em
      // DetectedRegion: aquela tabela pende de uma Transcription que
      // ainda não existe neste ponto do pipeline. O worker de
      // transcrição lê este arquivo e cria as regiões quando tiver a
      // transcrição para pendurá-las.
      const silencios = await detectarSilencios(audioTmp);

      const mapa = espaco.arquivo('silencios.json');
      await writeFile(mapa, JSON.stringify(silencios), 'utf8');
      await publicar(mapa, `${prefixoNoStorage}/silencios.json`);

      console.log(`[midia] ${silencios.length} silêncios no projeto ${projectId}`);
      await job.updateProgress(95);
    }, `midia-${projectId}`);
  });

  // TRANSCRIBING é o próximo passo; o worker de transcrição pega daqui.
  await prisma.project.update({
    where: { id: projectId },
    data: { state: 'TRANSCRIBING', publicError: null },
  });

  await job.updateProgress(100);
}

/** Move o arquivo do temporário para o storage, com fallback de cópia. */
async function publicar(origem: string, chave: string): Promise<void> {
  const destino = caminhoDe(chave);
  await mkdir(dirname(destino), { recursive: true });

  try {
    await rename(origem, destino);
  } catch (e) {
    // EXDEV: temporário e storage em sistemas de arquivos diferentes,
    // que é o caso normal quando o storage é um volume montado.
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await copyFile(origem, destino);
  }
}

async function tamanhoDe(chave: string): Promise<number> {
  const { stat } = await import('node:fs/promises');
  return (await stat(caminhoDe(chave))).size;
}

// ============================================================

const worker = new Worker<DadosDoJob>(FILA, processar, {
  connection: redis,
  // UM job por vez. O lock global já serializa, mas a concorrência 1
  // evita que um segundo job fique segurando conexão e memória
  // enquanto espera um lock que não vai soltar tão cedo.
  concurrency: 1,
});

worker.on('failed', (job, erro) => {
  const dados = job?.data;
  console.error(`[midia] job ${job?.id} falhou:`, erro.message);

  if (!dados?.projectId) return;

  // A mensagem que chega ao usuário não carrega stack, caminho de
  // arquivo nem nome de container: ele não tem o que fazer com isso,
  // e vazar caminho interno é risco sem contrapartida.
  void prisma.project
    .update({
      where: { id: dados.projectId },
      data: {
        state: 'FAILED_RETRYABLE',
        publicError: 'Não foi possível preparar o vídeo. Tente enviar de novo.',
      },
    })
    .catch(() => undefined);
});

worker.on('completed', (job) => {
  console.log(`[midia] job ${job.id} concluído (projeto ${job.data.projectId})`);
});

// ---------- Heartbeat ----------
//
// O worker não serve HTTP, então o healthcheck do container observa
// este arquivo. Um job travado para de atualizá-lo e o Docker
// reinicia o container — sem isso, um FFmpeg pendurado deixaria a
// fila parada em silêncio.
const HEARTBEAT = '/tmp/studio/heartbeat';

function bater() {
  try {
    writeFileSync(HEARTBEAT, String(Date.now()));
  } catch {
    // Em desenvolvimento o diretório pode não existir. O heartbeat é
    // para o container; sua ausência não deve derrubar o worker.
  }
}

bater();
const pulso = setInterval(bater, 30_000);

// Bate também a cada evento: um job longo mantém o processo vivo
// mesmo que o intervalo caia em cima de uma operação bloqueante.
worker.on('active', bater);
worker.on('progress', bater);

console.log(`[midia] ouvindo a fila ${FILA}`);

// Encerramento limpo: o BullMQ devolve o job em andamento para a fila
// em vez de deixá-lo travado até o TTL expirar.
for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sinal, () => {
    console.log(`[midia] ${sinal} recebido, encerrando`);
    clearInterval(pulso);
    void worker
      .close()
      .then(() => prisma.$disconnect())
      .then(() => redis.quit())
      .then(() => process.exit(0));
  });
}
