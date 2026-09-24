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
import {
  CORES_PADRAO_DA_MARCA,
  FILA_RENDER,
  PREFIXO_DAS_FILAS,
  brandColorsSchema,
  editPlanV1Schema,
  ehEfeitoSonoroEmbutido,
  gerarAss,
  planoPrecisaDeAss,
  presetDaLegenda,
  resolverEstiloDaLegenda,
} from '@makucho/studio-contracts';
import type { CaptionStyleInput, EditPlanV1, MarcaDoVideo } from '@makucho/studio-contracts';
import {
  comEspacoDeTrabalho,
  comLockGlobal,
  duracaoDoResultado,
  lerMetadados,
  renderizar,
  verificarLimite,
} from '@makucho/studio-worker-core';
import { copyFile, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

const RAIZ_DO_STORAGE = resolve(process.env.STORAGE_DISK_PATH ?? '/app/storage/media');

/**
 * Fontes do video (OFL), copiadas para a imagem de render. Sem a
 * pasta, o libass cai nas fontes do sistema e a legenda sai com uma
 * tipografia que ninguem escolheu -- por isso o aviso no log.
 */
const PASTA_DE_FONTES = resolve(process.env.STUDIO_FONTS_DIR ?? '/app/fonts');
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

      const workspaceId = await workspaceDo(projectId);
      const marca = await marcaDo(workspaceId);

      // O .ass vive no espaço de trabalho: é temporário e vai embora
      // com ele. Guardá-lo no storage encheria o disco com um arquivo
      // que só serve durante o render.
      const legendas = await prepararAss(
        espaco,
        plano,
        projectId,
        workspaceId,
        marca,
        job.data.clipsDesligados ?? [],
      );

      const arquivos = await arquivosDoPlano(plano, workspaceId);

      await renderizar({
        entrada,
        saida: saidaTmp,
        plano,
        legendas,
        pastaDeFontes: existsSync(PASTA_DE_FONTES) ? PASTA_DE_FONTES : undefined,
        imagens: arquivos.imagens,
        musica: arquivos.musica,
        sons: arquivos.sons,
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

/**
 * Gera o .ass: legendas e textos de tela.
 *
 * Devolve `undefined` em vez de lançar quando algo falta. A legenda é
 * acabamento: um render sem ela é um vídeo publicável, e derrubar o
 * job por causa dela trocaria um resultado bom por nenhum resultado.
 * O que NÃO acontece é gerar legenda inventada — sem as palavras da
 * transcrição, não há legenda, ponto. Os textos de tela (título,
 * chamada) continuam, porque não dependem da fala.
 */
async function prepararAss(
  espaco: { arquivo(nome: string): string },
  plano: EditPlanV1,
  projectId: string,
  workspaceId: string | null,
  marca: MarcaDoVideo,
  clipsDesligados: readonly string[],
): Promise<string | undefined> {
  if (!planoPrecisaDeAss(plano)) return undefined;

  if (!existsSync(PASTA_DE_FONTES)) {
    console.warn(`[render] pasta de fontes ${PASTA_DE_FONTES} ausente: o libass usará as do sistema`);
  }

  // As palavras vêm da transcrição, com os timestamps que o whisper
  // mediu. É a única origem possível para a legenda.
  const palavras = plano.captions.enabled ? await palavrasDo(projectId) : [];

  if (plano.captions.enabled && palavras.length === 0) {
    console.warn(`[render] projeto ${projectId} sem palavras transcritas: render sem legenda`);
  }

  const estilo = resolverEstiloDaLegenda(plano.captions.styleId, {
    marca,
    personalizado: await estiloPersonalizado(workspaceId, plano.captions.styleId),
    escala: plano.captions.sizeScale ?? 1,
  });

  const conteudo = gerarAss({ plano, estilo, palavras, clipsDesligados, marca });
  const caminho = espaco.arquivo('legendas.ass');

  // UTF-8 explícito: um acento na codificação errada sai QUEIMADO no
  // vídeo, sem como corrigir depois.
  await writeFile(caminho, conteudo, 'utf8');

  console.log(`[render] .ass: ${palavras.length} palavras, estilo ${estilo.nome}, ${plano.overlays.length} elementos`);
  return caminho;
}

async function palavrasDo(projectId: string) {
  const transcricao = await prisma.transcription.findFirst({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: {
      segments: {
        orderBy: { startMs: 'asc' },
        include: { words: { orderBy: { startMs: 'asc' } } },
      },
    },
  });

  // O `id` vai junto: é a âncora das correções manuais. Sem ele, a
  // palavra corrigida sairia como o whisper ouviu.
  return (transcricao?.segments ?? []).flatMap((s) =>
    s.words.map((w) => ({ id: w.id, startMs: w.startMs, endMs: w.endMs, word: w.word })),
  );
}

async function workspaceDo(projectId: string): Promise<string | null> {
  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  return projeto?.workspaceId ?? null;
}

/**
 * Cores e fontes do Kit de marca ativo.
 *
 * Sem kit salvo, as cores padrão — a legenda sai com a identidade
 * MAKUCHO em vez de falhar.
 */
async function marcaDo(workspaceId: string | null): Promise<MarcaDoVideo> {
  if (!workspaceId) return { cores: CORES_PADRAO_DA_MARCA };

  const perfil = await prisma.brandProfile.findFirst({
    where: { workspaceId, isActive: true },
    orderBy: { version: 'desc' },
    select: { colors: true, fontPrimary: true, fontSecond: true },
  });

  const cores = brandColorsSchema.safeParse(perfil?.colors);
  return {
    cores: cores.success ? cores.data : CORES_PADRAO_DA_MARCA,
    fonteTitulo: perfil?.fontPrimary ?? null,
    fonteCorpo: perfil?.fontSecond ?? null,
  };
}

/**
 * Um estilo personalizado do banco, quando o `styleId` não é preset.
 *
 * Consultado dentro do workspace do projeto, nunca isolado: um id de
 * outro workspace aplicaria a marca de um cliente no vídeo de outro.
 */
async function estiloPersonalizado(
  workspaceId: string | null,
  styleId: string,
): Promise<CaptionStyleInput | null> {
  if (!workspaceId || presetDaLegenda(styleId)) return null;

  const salvo = await prisma.captionStyle.findFirst({
    where: { id: styleId, brandProfile: { workspaceId } },
  });
  if (!salvo) return null;

  return {
    name: salvo.name,
    fontFamily: salvo.fontFamily,
    fontSizePx: salvo.fontSizePx,
    color: salvo.color,
    strokeColor: salvo.strokeColor ?? undefined,
    strokeWidthPx: salvo.strokeWidthPx,
    highlightColor: salvo.highlightColor ?? undefined,
    wordsPerBlock: salvo.wordsPerBlock,
    position: salvo.position as CaptionStyleInput['position'],
  };
}

/**
 * Os arquivos que o plano referencia: logo, imagens, trilha, sons.
 *
 * Sempre dentro do workspace do projeto — um assetId de outro cliente
 * não vira arquivo aqui. Um asset desativado (logo substituído) ainda
 * vale: o plano antigo o escolheu, e o arquivo continua guardado. Um
 * que sumiu do disco é pulado com aviso: o vídeo sai sem ele, mas sai.
 */
async function arquivosDoPlano(plano: EditPlanV1, workspaceId: string | null) {
  const imagens: Record<string, string> = {};
  const sons: Record<string, string> = {};
  let musica: string | undefined;

  if (!workspaceId) return { imagens, sons, musica };

  const ids = new Set<string>();
  for (const o of plano.overlays) if (o.assetId) ids.add(o.assetId);
  for (const e of plano.soundEffects) if (!ehEfeitoSonoroEmbutido(e.assetId)) ids.add(e.assetId);
  if (plano.music) ids.add(plano.music.assetId);
  if (ids.size === 0) return { imagens, sons, musica };

  const assets = await prisma.asset.findMany({
    where: { id: { in: [...ids] }, workspaceId },
    select: { id: true, storageKey: true, kind: true },
  });

  for (const a of assets) {
    let caminho: string;
    try {
      caminho = caminhoDe(a.storageKey);
    } catch {
      continue;
    }
    if (!existsSync(caminho)) {
      console.warn(`[render] asset ${a.id} sem arquivo no storage: fica de fora`);
      continue;
    }
    if (a.kind === 'MUSIC' && plano.music?.assetId === a.id) musica = caminho;
    else if (a.kind === 'SOUND_EFFECT') sons[a.id] = caminho;
    else imagens[a.id] = caminho;
  }

  return { imagens, sons, musica };
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
