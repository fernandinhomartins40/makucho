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

import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@makucho/studio-database';
import { FILA_MIDIA, FILA_TRANSCRICAO, PREFIXO_DAS_FILAS } from '@makucho/studio-contracts';
import {
  comEspacoDeTrabalho,
  comLockGlobal,
  detectarSilencios,
  extrairAudio,
  gerarProxy,
  gerarThumbnail,
  juntarVideos,
  lerMetadados,
  listaDeConcat,
  verificarLimite,
} from '@makucho/studio-worker-core';
import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

const RAIZ_DO_STORAGE = resolve(process.env.STORAGE_DISK_PATH ?? '/app/storage/media');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Altura do proxy: 720p, leve para assistir e nítido o bastante para
 * escolher um corte.
 *
 * Só a ALTURA. A largura sai da proporção do original, calculada pelo
 * FFmpeg — fixá-la em 405 distorcia todo vídeo fora de 9:16 e, pior,
 * 405 é ímpar: o libx264 recusa dimensão ímpar, então nenhum vídeo
 * chegava a gerar proxy.
 */
const PROXY_ALTURA = 720;

interface DadosDoJob {
  projectId: string;
  /** Ausente quando o job é de junção: o original ainda não existe. */
  mediaSourceId?: string;
  /** Juntar as partes (PART) do projeto num original antes do preparo. */
  juntar?: boolean;
}

/** O mesmo teto do envio: o vídeo final vem de até 30 min de gravação. */
const DURACAO_MAXIMA_MS = 30 * 60 * 1000;

/**
 * Junta as partes do projeto num ORIGINAL e devolve o id dele.
 *
 * Depois de publicado o original, as partes saem do banco e do disco:
 * guardar os dois dobraria o espaço de um projeto na VPS. Numa
 * retentativa em que as partes já foram juntadas, devolve o original
 * que ficou.
 */
async function juntarPartes(job: Job<DadosDoJob>): Promise<string> {
  const { projectId } = job.data;
  const partes = await prisma.mediaSource.findMany({
    where: { projectId, kind: 'PART' },
    orderBy: { position: 'asc' },
  });

  if (partes.length === 0) {
    const original = await prisma.mediaSource.findFirst({
      where: { projectId, kind: 'ORIGINAL' },
      orderBy: { createdAt: 'desc' },
    });
    if (!original) throw new Error(`projeto ${projectId} não tem partes nem original`);
    return original.id;
  }

  const prefixo = dirname(dirname(partes[0]!.storageKey));
  const chave = `${prefixo}/original-${Date.now().toString(36)}.mp4`;
  let original: { id: string } | null = null;

  await comLockGlobal(redis, async (renovar) => {
    await comEspacoDeTrabalho(async (espaco) => {
      const lidas = [];
      for (const parte of partes) {
        const caminho = caminhoDe(parte.storageKey);
        lidas.push({ caminho, probe: await lerMetadados(caminho) });
      }

      const total = lidas.reduce((t, l) => t + (l.probe.durationMs || 0), 0);
      if (total > DURACAO_MAXIMA_MS) {
        throw new ErroParaAPessoa(
          `Os vídeos somam ${Math.round(total / 60_000)} min, e o limite é 30 min. Remova alguma parte.`,
        );
      }

      const lista = espaco.arquivo('partes.txt');
      await writeFile(lista, listaDeConcat(lidas), 'utf8');
      const saidaTmp = espaco.arquivo('original.mp4');

      console.log(`[midia] juntando ${partes.length} partes do projeto ${projectId}`);
      await juntarVideos({
        partes: lidas,
        saida: saidaTmp,
        lista,
        aoProgredir: (fracao) => {
          void job.updateProgress(Math.round(fracao * 30));
          void renovar();
        },
      });

      await verificarLimite(espaco);
      await publicar(saidaTmp, chave);
    }, `juntar-${projectId}`);
  });

  original = await prisma.$transaction(async (tx) => {
    const criado = await tx.mediaSource.create({
      data: {
        projectId,
        kind: 'ORIGINAL',
        storageKey: chave,
        mimeType: 'video/mp4',
        sizeBytes: BigInt(await tamanhoDe(chave)),
      },
    });
    await tx.mediaSource.deleteMany({ where: { projectId, kind: 'PART' } });
    return criado;
  });

  for (const parte of partes) {
    await rm(caminhoDe(parte.storageKey), { force: true }).catch(() => undefined);
  }

  return original.id;
}

/** Erro cuja mensagem pode ir para a tela, sem caminho nem stack. */
class ErroParaAPessoa extends Error {}

const prisma = new PrismaClient();

// `maxRetriesPerRequest: null` é exigência do BullMQ para o consumidor
// bloqueante: sem isso o ioredis aborta a espera e o worker fica
// surdo para a fila.
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Este worker também PRODUZ: ao terminar, passa o bastão para a
// transcrição. O prefixo tem de ser o mesmo da API e do consumidor —
// divergir aqui manda o job para uma fila que ninguém escuta.
const filaDeTranscricao = new Queue(FILA_TRANSCRICAO, {
  connection: redis,
  prefix: PREFIXO_DAS_FILAS,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

/** Caminho absoluto de uma chave, conferido contra a raiz. */
function caminhoDe(chave: string): string {
  const completo = resolve(RAIZ_DO_STORAGE, chave);
  if (completo !== RAIZ_DO_STORAGE && !completo.startsWith(RAIZ_DO_STORAGE + sep)) {
    throw new Error(`chave de storage fora da raiz: ${chave}`);
  }
  return completo;
}

/**
 * A largura que o `scale=-2:altura` vai produzir.
 *
 * Refaz a conta do FFmpeg para gravar no banco a dimensão REAL do
 * arquivo: proporção do original, arredondada para o par mais
 * próximo. O editor usa esses números para montar o palco, e um
 * valor que o arquivo não tem desalinharia o preview.
 *
 * Sem metadados do original — um arquivo que o ffprobe não leu —
 * devolve `null`: um palpite gravado como fato é pior que a ausência,
 * que a tela já sabe tratar.
 */
function larguraDoProxy(
  larguraOriginal: number | null | undefined,
  alturaOriginal: number | null | undefined,
  alturaDoProxy: number,
): number | null {
  if (!larguraOriginal || !alturaOriginal) return null;

  const proporcional = (larguraOriginal / alturaOriginal) * alturaDoProxy;
  // `round(x / 2) * 2` é o mesmo arredondamento do `-2` do FFmpeg.
  return Math.max(2, Math.round(proporcional / 2) * 2);
}

async function processar(job: Job<DadosDoJob>): Promise<void> {
  const { projectId } = job.data;
  const mediaSourceId = job.data.juntar ? await juntarPartes(job) : job.data.mediaSourceId;
  if (!mediaSourceId) throw new Error(`job ${job.id} sem mídia`);

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
      // Uma tentativa anterior que falhou no meio pode ter deixado
      // proxy ou thumbnail registrados: a retentativa recomeça limpa,
      // senão o editor tocaria o arquivo velho.
      await prisma.mediaSource.deleteMany({
        where: { projectId, kind: { in: ['PROXY', 'THUMBNAIL', 'AUDIO'] } },
      });

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

      // Gravação do navegador chega sem duração no cabeçalho. O proxy
      // sai do FFmpeg com a duração real: é dele que ela vem, e sem
      // ela a análise recusa o vídeo como "não encontrado".
      if (!probe.durationMs) {
        const medido = await lerMetadados(proxyTmp);
        probe.durationMs = medido.durationMs;
        await prisma.mediaSource.update({
          where: { id: mediaSourceId },
          data: { durationMs: probe.durationMs || null },
        });
      }
      if (!probe.durationMs) {
        throw new Error('não foi possível medir a duração do vídeo');
      }

      await publicar(proxyTmp, `${prefixoNoStorage}/proxy.mp4`);

      await prisma.mediaSource.create({
        data: {
          projectId,
          kind: 'PROXY',
          storageKey: `${prefixoNoStorage}/proxy.mp4`,
          mimeType: 'video/mp4',
          sizeBytes: BigInt(await tamanhoDe(`${prefixoNoStorage}/proxy.mp4`)),
          durationMs: probe.durationMs,
          // A MESMA conta que o `scale=-2` faz: altura fixa,
          // largura pela proporção, arredondada para par. Gravar um
          // valor fixo aqui registraria uma dimensão que o arquivo
          // não tem, e o editor usa isto para montar o palco.
          widthPx: larguraDoProxy(probe.widthPx, probe.heightPx, PROXY_ALTURA),
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

  // Enfileirar aqui, e não na API, porque só neste ponto o áudio
  // existe no storage. Enquanto este passo não existiu, todo projeto
  // ficava preso em TRANSCRIBING para sempre: o estado dizia que a
  // transcrição tinha começado e nada a havia pedido.
  //
  // Uma falha ao enfileirar NÃO invalida o trabalho já feito — proxy,
  // thumbnail e áudio estão no disco. Vira estado recuperável, com
  // mensagem que diz o que fazer.
  try {
    await filaDeTranscricao.add(
      'transcrever',
      { projectId, mediaSourceId },
      // O mesmo jobId da API: uma retentativa do job de mídia não
      // produz duas transcrições do mesmo áudio disputando o lock.
      { jobId: `transcricao-${mediaSourceId}` },
    );
  } catch (e) {
    console.error(`[midia] falha ao enfileirar transcrição do projeto ${projectId}:`, e);
    await prisma.project.update({
      where: { id: projectId },
      data: {
        state: 'FAILED_RETRYABLE',
        publicError: 'O vídeo foi preparado, mas a transcrição não pôde começar. Tente novamente.',
      },
    });
  }

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

const worker = new Worker<DadosDoJob>(FILA_MIDIA, processar, {
  connection: redis,
  // O mesmo prefixo da API: sem ele o worker escuta outro lugar.
  prefix: PREFIXO_DAS_FILAS,
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
        publicError:
          erro instanceof ErroParaAPessoa ? erro.message : 'Não foi possível preparar o vídeo. Tente enviar de novo.',
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

console.log(`[midia] ouvindo a fila ${FILA_MIDIA}`);

// Encerramento limpo: o BullMQ devolve o job em andamento para a fila
// em vez de deixá-lo travado até o TTL expirar.
for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sinal, () => {
    console.log(`[midia] ${sinal} recebido, encerrando`);
    clearInterval(pulso);
    void worker
      .close()
      .then(() => filaDeTranscricao.close())
      .then(() => prisma.$disconnect())
      .then(() => redis.quit())
      .then(() => process.exit(0));
  });
}
