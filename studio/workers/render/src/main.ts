// ============================================================
// Worker de render (Fase 7).
//
// A última etapa: lê o EditPlan ativo e produz o arquivo que o
// cliente publica. É o que separa "ferramenta que organiza vídeo" de
// "editor que entrega".
//
// Toca o ORIGINAL, não o proxy. O proxy é 720p com preset ultrafast —
// serve para assistir e escolher o corte, não para publicar.
//
// As duas contenções do ADR 0003 valem aqui mais do que nos outros
// workers: o render é o job mais pesado do pipeline, e é o que mais
// tempo segura o lock global numa VPS compartilhada com outras cinco
// aplicações.
// ============================================================

import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@makucho/studio-database';
import { FILA_RENDER, PREFIXO_DAS_FILAS, editPlanV1Schema } from '@makucho/studio-contracts';
import {
  comEspacoDeTrabalho,
  comLockGlobal,
  duracaoDoResultado,
  lerMetadados,
  renderizar,
  verificarLimite,
} from '@makucho/studio-worker-core';
import { copyFile, mkdir, rename, stat } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

const RAIZ_DO_STORAGE = resolve(process.env.STORAGE_DISK_PATH ?? '/app/storage/media');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

interface DadosDoJob {
  projectId: string;
  editPlanId: string;
  renderId: string;
  /** Trechos que o usuário desligou; continuam no plano, fora do vídeo. */
  clipsDesligados?: string[];
}

const prisma = new PrismaClient();
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

function caminhoDe(chave: string): string {
  const completo = resolve(RAIZ_DO_STORAGE, chave);
  if (completo !== RAIZ_DO_STORAGE && !completo.startsWith(RAIZ_DO_STORAGE + sep)) {
    throw new Error(`chave de storage fora da raiz: ${chave}`);
  }
  return completo;
}

async function processar(job: Job<DadosDoJob>): Promise<void> {
  const { projectId, editPlanId, renderId } = job.data;

  const registro = await prisma.render.findUnique({ where: { id: renderId } });
  if (!registro) throw new Error(`render ${renderId} não existe`);

  const versao = await prisma.editPlan.findUnique({ where: { id: editPlanId } });
  if (!versao) throw new Error(`plano ${editPlanId} não existe`);

  // O plano vem do banco como JSON e passa pelo schema de novo. Não é
  // desconfiança do próprio banco: é que o render é a última chance
  // de barrar um plano inválido antes de gastar minutos de CPU
  // produzindo um arquivo errado.
  const conferido = editPlanV1Schema.safeParse(versao.document);
  if (!conferido.success) {
    throw new Error(`o plano ${editPlanId} não passou na validação: ${conferido.error.issues[0]?.message}`);
  }
  const plano = conferido.data;

  const original = await prisma.mediaSource.findFirst({
    where: { projectId, kind: 'ORIGINAL' },
    orderBy: { createdAt: 'desc' },
  });
  if (!original) throw new Error(`projeto ${projectId} não tem vídeo original`);

  await prisma.render.update({
    where: { id: renderId },
    data: { startedAt: new Date() },
  });

  const entrada = caminhoDe(original.storageKey);
  const prefixo = dirname(original.storageKey);
  const chaveDaSaida = `${prefixo}/render-${registro.id}.mp4`;

  await comLockGlobal(redis, async (renovar) => {
    await comEspacoDeTrabalho(async (espaco) => {
      const saidaTmp = espaco.arquivo('render.mp4');

      await renderizar({
        entrada,
        saida: saidaTmp,
        plano,
        clipsDesligados: job.data.clipsDesligados ?? [],
        aoProgredir: (fracao) => {
          // Renova o lock a cada avanço: um render de dez minutos não
          // pode perder o lock no meio e ver outro job pesado começar.
          void renovar();
          bater();
          void job.updateProgress(Math.round(fracao * 90));
        },
      });

      await verificarLimite(espaco);
      await publicar(saidaTmp, chaveDaSaida);
    });
  });

  // Confere o que saiu, em vez de confiar no código de saída: o
  // FFmpeg pode terminar em zero e produzir um arquivo truncado se o
  // disco encher no último bloco.
  const destino = caminhoDe(chaveDaSaida);
  const info = await stat(destino);
  const medido = await lerMetadados(destino);

  const esperadoMs = duracaoDoResultado(plano, job.data.clipsDesligados ?? []);
  // Um segundo de tolerância: o FFmpeg fecha o arquivo no keyframe
  // seguinte, e a diferença é normal.
  const divergencia = Math.abs(medido.durationMs - esperadoMs);

  await prisma.render.update({
    where: { id: renderId },
    data: {
      storageKey: chaveDaSaida,
      sizeBytes: BigInt(info.size),
      durationMs: medido.durationMs,
      widthPx: medido.widthPx,
      heightPx: medido.heightPx,
      finishedAt: new Date(),
      qualityCheck: {
        duracaoEsperadaMs: esperadoMs,
        duracaoMedidaMs: medido.durationMs,
        divergenciaMs: divergencia,
        temAudio: medido.audioCodec !== null,
        ok: divergencia <= 1000 && medido.audioCodec !== null,
      },
    },
  });

  if (divergencia > 1000) {
    // Não falha o job — o arquivo existe e pode estar bom. Mas fica
    // registrado, porque uma divergência grande costuma indicar corte
    // em trecho que o original não tem.
    console.warn(
      `[render] projeto ${projectId}: esperado ${esperadoMs}ms, medido ${medido.durationMs}ms`,
    );
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { state: 'COMPLETED', publicError: null },
  });

  await job.updateProgress(100);
  console.log(`[render] projeto ${projectId} concluído: ${(info.size / 1024 / 1024).toFixed(1)} MB`);
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

// ============================================================

const worker = new Worker<DadosDoJob>(FILA_RENDER, processar, {
  connection: redis,
  prefix: PREFIXO_DAS_FILAS,
  concurrency: 1,
});

worker.on('failed', (job, erro) => {
  const dados = job?.data;
  console.error(`[render] job ${job?.id} falhou:`, erro.message);

  if (!dados?.projectId) return;

  void prisma.project
    .update({
      where: { id: dados.projectId },
      data: {
        state: 'FAILED_RETRYABLE',
        publicError: 'Não foi possível exportar o vídeo. Tente de novo em alguns minutos.',
      },
    })
    .catch(() => undefined);

  // O registro do render fica com finishedAt nulo e sem storageKey:
  // é o que distingue "falhou" de "ainda rodando" numa consulta.
  if (dados.renderId) {
    void prisma.render
      .update({ where: { id: dados.renderId }, data: { qualityCheck: { erro: erro.message } } })
      .catch(() => undefined);
  }
});

worker.on('completed', (job) => {
  console.log(`[render] job ${job.id} concluído (projeto ${job.data.projectId})`);
});

// ---------- Heartbeat ----------
const HEARTBEAT = '/tmp/studio/heartbeat';

function bater() {
  try {
    writeFileSync(HEARTBEAT, String(Date.now()));
  } catch {
    // Em desenvolvimento o diretório pode não existir.
  }
}

bater();
const pulso = setInterval(bater, 30_000);
worker.on('active', bater);
worker.on('progress', bater);

console.log(`[render] ouvindo a fila ${FILA_RENDER}`);

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sinal, () => {
    console.log(`[render] ${sinal} recebido, encerrando`);
    clearInterval(pulso);
    void worker
      .close()
      .then(() => prisma.$disconnect())
      .then(() => redis.quit())
      .then(() => process.exit(0));
  });
}
