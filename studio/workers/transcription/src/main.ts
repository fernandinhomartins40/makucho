// ============================================================
// Worker de transcrição (Fase 4).
//
// Consome a fila que o worker de mídia enche quando o áudio está
// pronto, roda o faster-whisper e grava a transcrição segmentada.
//
// Por que este worker importa mais do que parece: a integridade
// editorial do produto depende dele. Todo clipe que a IA propõe
// aponta para `transcriptSegmentIds` — sem transcrição, não há origem
// verificável para corte nenhum, e a promessa de "a IA nunca inventa
// fala" fica sem como ser conferida.
//
// O whisper roda em Python, num processo filho. A razão está no
// script; aqui basta saber que uma morte por falta de memória chega
// como código de saída, e não derruba a fila.
// ============================================================

import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@makucho/studio-database';
import {
  FILA_ANALISE,
  FILA_TRANSCRICAO,
  JOB_DE_DITADO,
  PREFIXO_DAS_FILAS,
  SILENCIO_MINIMO_MS,
  classificarAudio,
  ehAlucinacaoDoWhisper,
  transcriptionResultSchema,
} from '@makucho/studio-contracts';
import { comLockGlobal, publicarProgresso } from '@makucho/studio-worker-core';
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

const RAIZ_DO_STORAGE = resolve(process.env.STORAGE_DISK_PATH ?? '/app/storage/media');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** O Python do venv da imagem; em desenvolvimento, o do PATH. */
const PYTHON = process.env.PYTHON_BIN ?? 'python3';

/** Pasta onde o Dockerfile deixa o script. */
const SCRIPT = resolve(
  process.env.WHISPER_SCRIPT ?? join(__dirname, '..', 'python', 'transcrever.py'),
);

/**
 * Teto de tempo de uma transcrição.
 *
 * O produto aceita vídeo de até 15 minutos (`MAX_VIDEO_DURATION_MS`).
 * No `small` int8 com 2 threads, a transcrição roda perto do tempo
 * real, então 40 minutos cobre o pior caso com folga. Sem teto, um
 * processo preso seguraria o lock global e pararia todos os workers.
 */
const TIMEOUT_MS = 40 * 60 * 1000;

interface DadosDoJob {
  projectId: string;
  mediaSourceId: string;
}

const prisma = new PrismaClient();
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// A análise é consumida pela API (é lá que vivem a credencial de IA e
// o teto de gasto). O jobId é o projeto e o job some ao terminar, para
// não bloquear uma análise futura do mesmo projeto.
const filaDeAnalise = new Queue(FILA_ANALISE, { connection: redis, prefix: PREFIXO_DAS_FILAS });

function caminhoDe(chave: string): string {
  const completo = resolve(RAIZ_DO_STORAGE, chave);
  if (completo !== RAIZ_DO_STORAGE && !completo.startsWith(RAIZ_DO_STORAGE + sep)) {
    throw new Error(`chave de storage fora da raiz: ${chave}`);
  }
  return completo;
}

/** Erro que descreve algo que o usuário pode entender e agir. */
class ErroDoUsuario extends Error {
  constructor(readonly publico: string) {
    super(publico);
  }
}

/**
 * Roda o script Python e devolve o JSON que ele escreveu.
 *
 * stdout é só do JSON, stderr é do log: a separação está no script, e
 * é o que permite que um aviso do faster-whisper não quebre o parse.
 */
function rodarWhisper(
  audio: string,
  aoVivo: () => void,
  aoProgredir?: (fracao: number, frase: string) => void,
): Promise<unknown> {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(PYTHON, [SCRIPT, audio], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const pedacos: Buffer[] = [];
    let encerrado = false;

    const limite = setTimeout(() => {
      encerrado = true;
      filho.kill('SIGKILL');
      rejeitar(new Error(`transcrição passou de ${TIMEOUT_MS / 60000} minutos`));
    }, TIMEOUT_MS);

    filho.stdout.on('data', (d: Buffer) => pedacos.push(d));

    filho.stderr.on('data', (d: Buffer) => {
      // As linhas "@@progresso <fração> <frase>" são o progresso ao
      // vivo (quanto do áudio foi ouvido e a frase que acabou de sair);
      // o resto é log de diagnóstico.
      const outras: string[] = [];
      for (const linha of d.toString('utf8').split(/\r?\n/)) {
        const m = /^@@progresso (\d+(?:\.\d+)?) ?(.*)$/.exec(linha.trim());
        if (m) aoProgredir?.(Number(m[1]), m[2] ?? '');
        else if (linha.trim()) outras.push(linha.trim());
      }
      const texto = outras.join('\n');
      if (texto) console.log(`[whisper] ${texto}`);
      // Cada linha de log é prova de vida: renova o lock e o
      // heartbeat, para que um áudio longo não seja confundido com um
      // processo travado.
      aoVivo();
    });

    filho.on('error', (e) => {
      clearTimeout(limite);
      rejeitar(new Error(`não foi possível executar o python: ${e.message}`));
    });

    filho.on('close', (codigo) => {
      clearTimeout(limite);
      if (encerrado) return;

      // 3 é o código combinado com o script para "áudio sem fala".
      // Não é erro: vídeo de produto, vitrine, promoção com música. O
      // projeto segue para a montagem pelas cenas (montagem-visual.ts).
      if (codigo === 3) {
        resolver({ semFala: true });
        return;
      }

      if (codigo !== 0) {
        rejeitar(new Error(`o whisper saiu com código ${codigo}`));
        return;
      }

      try {
        resolver(JSON.parse(Buffer.concat(pedacos).toString('utf8')));
      } catch (e) {
        rejeitar(new Error(`saída do whisper não é JSON: ${(e as Error).message}`));
      }
    });
  });
}

async function processar(job: Job<DadosDoJob>): Promise<void> {
  const { projectId } = job.data;

  const projeto = await prisma.project.findUnique({ where: { id: projectId } });
  if (!projeto) throw new Error(`projeto ${projectId} não existe`);

  // O worker de mídia grava o áudio como um MediaSource próprio, de
  // kind AUDIO. É dele que se transcreve — o original pode estar em
  // codec que o whisper leria mais devagar, e o proxy tem vídeo junto.
  const audio = await prisma.mediaSource.findFirst({
    where: { projectId, kind: 'AUDIO' },
    orderBy: { createdAt: 'desc' },
  });
  if (!audio) throw new Error(`projeto ${projectId} não tem áudio extraído`);

  // Reprocessar é legítimo (retentativa, troca de modelo), mas a
  // transcrição é 1-para-1 com o projeto no schema. Apagar a anterior
  // leva junto segmentos, palavras e regiões, em cascata.
  await prisma.transcription.deleteMany({ where: { projectId } });

  await job.updateProgress(5);
  await publicarProgresso(redis, projectId, 'transcrevendo', 0);

  // As três últimas frases ouvidas vão para a tela: é o que transforma
  // "transcrevendo…" em "a IA está ouvindo você".
  const ouvidas: string[] = [];
  const bruto = await comLockGlobal(redis, async (renovar) => {
    return rodarWhisper(
      caminhoDe(audio.storageKey),
      () => {
        void renovar();
        bater();
      },
      (fracao, frase) => {
        if (frase) {
          ouvidas.push(frase);
          if (ouvidas.length > 3) ouvidas.shift();
        }
        void job.updateProgress(5 + Math.round(fracao * 65));
        void publicarProgresso(redis, projectId, 'transcrevendo', Math.min(99, fracao * 100), [...ouvidas]);
      },
    );
  });
  await publicarProgresso(redis, projectId, 'transcrevendo', 100, ouvidas);

  await job.updateProgress(70);

  // O Zod aqui não é cerimônia: o que vem do modelo é dado externo, e
  // um segmento com `endMs` menor que `startMs` viraria um clipe de
  // duração negativa na timeline três telas adiante.
  const semFala = (bruto as { semFala?: boolean } | null)?.semFala === true;
  let resultado: { language: string; model: string; confidence?: number; segments: Array<{ startMs: number; endMs: number; text: string; confidence?: number; position: number; words: Array<{ word: string; startMs: number; endMs: number; confidence: number }> }> };
  if (semFala) {
    resultado = { language: 'pt', model: process.env.WHISPER_MODEL ?? 'small', segments: [] };
  } else {
    const conferido = transcriptionResultSchema.safeParse(bruto);
    if (!conferido.success) {
      throw new Error(`transcrição fora do contrato: ${conferido.error.issues[0]?.message}`);
    }
    resultado = conferido.data;
  }

  // ---------- Que áudio é este? ----------
  //
  // As frases típicas que o Whisper inventa em música ("Legendas pela
  // comunidade Amara.org") saem; o que sobra, com os silêncios, diz se o
  // vídeo é narrado, tem fala em parte, só música/ambiente ou é mudo.
  // Sem narração, frases soltas (rádio, letra de música) também saem:
  // não podem guiar o corte nem virar legenda.
  const silencios = await lerSilencios(dirname(audio.storageKey));
  const comFala = resultado.segments.filter((s) => !ehAlucinacaoDoWhisper(s.text));
  const descartados = resultado.segments.length - comFala.length + Number((bruto as { discarded?: number } | null)?.discarded ?? 0);
  const original = await prisma.mediaSource.findFirst({ where: { projectId, kind: 'ORIGINAL' }, orderBy: { createdAt: 'desc' } });
  const duracaoMs = original?.durationMs ?? audio.durationMs ?? Math.max(1, ...resultado.segments.map((s) => s.endMs));
  const perfil = classificarAudio({ duracaoMs, segmentos: comFala, silencios, descartados });
  const segmentosFinais = (perfil.tipo === 'fala' || perfil.tipo === 'fala_parcial' ? comFala : []).map((s, i) => ({ ...s, position: i }));
  console.log(`[transcricao] projeto ${projectId}: áudio "${perfil.tipo}" (fala em ${Math.round(perfil.coberturaDeFala * 100)}% do vídeo, ${descartados} descartados)`);
  const cenas = await lerCenas(dirname(audio.storageKey));

  // ---------- Silêncios e cenas ----------
  //
  // O worker de mídia os detectou e deixou em arquivos, porque
  // `DetectedRegion` pende de uma `Transcription` que não existia
  // naquele momento. Agora existe, e as regiões podem ser gravadas.
  await prisma.$transaction(async (tx) => {
    const transcricao = await tx.transcription.create({
      data: {
        projectId,
        language: resultado.language,
        model: resultado.model,
        confidence: resultado.confidence ?? null,
      },
    });

    for (const seg of segmentosFinais) {
      const criado = await tx.transcriptSegment.create({
        data: {
          transcriptionId: transcricao.id,
          startMs: seg.startMs,
          endMs: seg.endMs,
          text: seg.text,
          confidence: seg.confidence ?? null,
          position: seg.position,
        },
      });

      if (seg.words.length > 0) {
        await tx.transcriptWord.createMany({
          data: seg.words.map((p) => ({
            segmentId: criado.id,
            word: p.word,
            startMs: p.startMs,
            endMs: p.endMs,
            confidence: p.confidence,
          })),
        });
      }
    }

    // Só os silêncios que valem remover: pausa de respiração dá ritmo
    // à fala, e cortar todas produz vídeo acelerado (ADR 0010).
    const relevantes = silencios.filter((s) => s.fimMs - s.inicioMs >= SILENCIO_MINIMO_MS);

    if (relevantes.length > 0) {
      await tx.detectedRegion.createMany({
        data: relevantes.map((s) => ({
          transcriptionId: transcricao.id,
          kind: 'silence',
          startMs: s.inicioMs,
          endMs: s.fimMs,
        })),
      });
    }

    if (cenas.length > 0) {
      await tx.detectedRegion.createMany({
        data: cenas.map((c) => ({
          transcriptionId: transcricao.id,
          kind: 'scene',
          startMs: c.inicioMs,
          endMs: c.fimMs,
          metadata: { quadro: c.quadro },
        })),
      });
    }

    // ANALYZING é o próximo estado; a Fase 5b pega daqui. O perfil do
    // áudio decide o caminho da montagem: pela fala ou pelas cenas.
    await tx.project.update({
      where: { id: projectId },
      data: { state: 'ANALYZING', publicError: null, audioProfile: perfil },
    });
  });

  try {
    await filaDeAnalise.add(
      'analisar',
      { projectId },
      { jobId: `analise-${projectId}`, attempts: 2, removeOnComplete: true, removeOnFail: true },
    );
  } catch (e) {
    // Sem Redis agora, a varredura da API encontra o projeto parado em
    // "analisando" e enfileira de novo: não é preciso falhar aqui.
    console.error(`[transcricao] falha ao enfileirar a análise do projeto ${projectId}:`, e);
  }

  console.log(
    `[transcricao] projeto ${projectId}: ${segmentosFinais.length} segmentos, ${cenas.length} cenas, ` +
      `${silencios.length} silêncios, idioma ${resultado.language}`,
  );

  await job.updateProgress(100);
}

/**
 * Ditado: o áudio de alguém falando o pedido do roteiro vira texto.
 *
 * Nada vai para o banco e não há projeto: o texto volta como resultado
 * do job, e a API o entrega a quem ditou. O arquivo é apagado ao fim,
 * tenha dado certo ou não -- é a voz da pessoa, não fica guardada.
 *
 * Sem o lock global dos processamentos pesados: são no máximo dois
 * minutos de áudio, e esperar um render de vídeo terminar deixaria quem
 * ditou olhando para a tela por minutos.
 */
async function ditar(job: Job<{ storageKey: string }>): Promise<string> {
  const arquivo = caminhoDe(job.data.storageKey);
  try {
    const bruto = await rodarWhisper(arquivo, bater);
    if ((bruto as { semFala?: boolean } | null)?.semFala === true) return '';
    const conferido = transcriptionResultSchema.safeParse(bruto);
    if (!conferido.success) throw new Error(`ditado fora do contrato: ${conferido.error.issues[0]?.message}`);
    return conferido.data.segments
      .filter((s) => !ehAlucinacaoDoWhisper(s.text))
      .map((s) => s.text.trim())
      .filter(Boolean)
      .join(' ');
  } finally {
    await rm(arquivo, { force: true }).catch(() => undefined);
  }
}

/** Lê as cenas que o worker de mídia deixou ao lado do áudio. */
async function lerCenas(prefixo: string): Promise<Array<{ inicioMs: number; fimMs: number; quadro: string }>> {
  try {
    const lido: unknown = JSON.parse(await readFile(caminhoDe(`${prefixo}/cenas.json`), 'utf8'));
    if (!Array.isArray(lido)) return [];
    return lido.filter(
      (c): c is { inicioMs: number; fimMs: number; quadro: string } =>
        typeof c?.inicioMs === 'number' && typeof c?.fimMs === 'number' && c.fimMs > c.inicioMs && typeof c?.quadro === 'string',
    );
  } catch {
    // Sem cenas, a montagem pelas cenas usa janelas fixas do vídeo.
    return [];
  }
}

/** Lê o mapa que o worker de mídia deixou ao lado do áudio. */
async function lerSilencios(prefixo: string): Promise<Array<{ inicioMs: number; fimMs: number }>> {
  try {
    const bruto = await readFile(caminhoDe(`${prefixo}/silencios.json`), 'utf8');
    const lido: unknown = JSON.parse(bruto);
    if (!Array.isArray(lido)) return [];
    return lido.filter(
      (s): s is { inicioMs: number; fimMs: number } =>
        typeof (s as { inicioMs?: unknown })?.inicioMs === 'number' &&
        typeof (s as { fimMs?: unknown })?.fimMs === 'number' &&
        (s as { fimMs: number }).fimMs > (s as { inicioMs: number }).inicioMs,
    );
  } catch {
    // A ausência do arquivo não impede transcrever: os silêncios são
    // melhoria de edição, a transcrição é o que destrava o produto.
    console.log('[transcricao] sem mapa de silêncios; seguindo sem ele');
    return [];
  }
}

// ============================================================

const worker = new Worker<DadosDoJob>(
  FILA_TRANSCRICAO,
  (job) => (job.name === JOB_DE_DITADO ? ditar(job as unknown as Job<{ storageKey: string }>) : processar(job)),
  {
    connection: redis,
    prefix: PREFIXO_DAS_FILAS,
    concurrency: 1,
  },
);

worker.on('failed', (job, erro) => {
  const dados = job?.data;
  console.error(`[transcricao] job ${job?.id} falhou:`, erro.message);

  if (!dados?.projectId) return;

  // Um ErroDoUsuario descreve algo acionável e vai inteiro para a
  // tela; qualquer outro vira mensagem genérica, porque caminho de
  // arquivo e stack não ajudam quem grava vídeo.
  const publico =
    erro instanceof ErroDoUsuario
      ? erro.publico
      : 'Não foi possível transcrever o áudio. Tente novamente em alguns minutos.';

  void prisma.project
    .update({
      where: { id: dados.projectId },
      data: { state: 'FAILED_RETRYABLE', publicError: publico },
    })
    .catch(() => undefined);
});

worker.on('completed', (job) => {
  console.log(`[transcricao] job ${job.id} concluído (${job.name === JOB_DE_DITADO ? 'ditado' : `projeto ${job.data.projectId}`})`);
});

// ---------- Heartbeat ----------
//
// O worker não serve HTTP, então o healthcheck do container observa
// este arquivo. Um job travado para de atualizá-lo e o Docker
// reinicia o container.
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
worker.on('active', bater);
worker.on('progress', bater);

console.log(`[transcricao] ouvindo a fila ${FILA_TRANSCRICAO}`);

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sinal, () => {
    console.log(`[transcricao] ${sinal} recebido, encerrando`);
    clearInterval(pulso);
    void worker
      .close()
      .then(() => filaDeAnalise.close())
      .then(() => prisma.$disconnect())
      .then(() => redis.quit())
      .then(() => process.exit(0));
  });
}
