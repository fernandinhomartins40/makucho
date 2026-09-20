import {
  uploadRequestSchema,
  transcriptionResultSchema,
  validarMidia,
  temProblemaBloqueante,
  dimensoesDoProxy,
  silenciosEntreFalas,
  SILENCIO_MINIMO_MS,
  MAX_UPLOAD_BYTES,
} from '../src/index';
import type { MediaProbe } from '../src/index';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ============================================================
// Sessão de upload
// ============================================================

const upload = {
  filename: 'gravacao.mp4',
  sizeBytes: 120 * 1024 * 1024,
  mimeType: 'video/mp4' as const,
  durationMs: 480_000,
};

t('aceita pedido de upload valido', uploadRequestSchema.safeParse(upload).success);

// Recusa ANTES de o arquivo subir: descobrir depois de 500 MB
// transferidos gasta banda e paciencia.
t('rejeita arquivo acima do limite do piloto',
  !uploadRequestSchema.safeParse({ ...upload, sizeBytes: MAX_UPLOAD_BYTES + 1 }).success);

t('rejeita duracao acima de 15 min',
  !uploadRequestSchema.safeParse({ ...upload, durationMs: 20 * 60 * 1000 }).success);

t('rejeita container nao suportado',
  !uploadRequestSchema.safeParse({ ...upload, mimeType: 'video/x-msvideo' }).success);

t('rejeita chave extra no pedido',
  !uploadRequestSchema.safeParse({ ...upload, storageKey: '../../etc/passwd' }).success);

// ============================================================
// Validação do ffprobe
// ============================================================

const probeOk: MediaProbe = {
  durationMs: 480_000,
  widthPx: 1080,
  heightPx: 1920,
  fps: 30,
  videoCodec: 'h264',
  audioCodec: 'aac',
  sizeBytes: 120 * 1024 * 1024,
};

t('midia valida nao gera problema', validarMidia(probeOk).length === 0);

// Sem audio nao ha o que transcrever, e sem transcricao o produto
// perde o proposito: toda decisao editorial parte da fala.
const semAudio = validarMidia({ ...probeOk, audioCodec: null });
t('detecta video sem audio', semAudio.some((p) => p.code === 'sem_audio'));
t('video sem audio bloqueia', temProblemaBloqueante(semAudio));

const longo = validarMidia({ ...probeOk, durationMs: 20 * 60 * 1000 });
t('detecta duracao excedida', longo.some((p) => p.code === 'duracao_excedida'));
t('duracao excedida bloqueia', temProblemaBloqueante(longo));

// Resolucao baixa avisa, mas nao impede: o usuario decide se aceita o
// upscale.
const baixa = validarMidia({ ...probeOk, widthPx: 480, heightPx: 640 });
t('detecta resolucao baixa', baixa.some((p) => p.code === 'resolucao_baixa'));
t('resolucao baixa avisa sem bloquear', !temProblemaBloqueante(baixa));

// Fora da faixa, o calculo de frame por timestamp erra e o corte cai
// no frame vizinho.
t('fps fora da faixa bloqueia',
  temProblemaBloqueante(validarMidia({ ...probeOk, fps: 5 })));

// ============================================================
// Proxy
// ============================================================

// H.264 recusa largura impar.
const p1 = dimensoesDoProxy(1080, 1920);
t('proxy 9:16 tem altura 720', p1.height === 720);
t('proxy preserva a proporcao', p1.width === 406 || p1.width === 404);
t('largura do proxy e par', p1.width % 2 === 0);

const p2 = dimensoesDoProxy(3840, 2160);
t('proxy de 4K cabe em 720p', p2.height === 720 && p2.width === 1280);

// Ampliar gasta CPU e piora a imagem.
const p3 = dimensoesDoProxy(640, 480);
t('video menor que o alvo nao e ampliado', p3.height === 480);

const p4 = dimensoesDoProxy(1921, 1081);
t('largura impar vira par', p4.width % 2 === 0);

// ============================================================
// Silêncios
// ============================================================

// Bloco de fala em 2000-5000 e 8000-10000, num video de 12s.
const falas = [
  { startMs: 2_000, endMs: 5_000 },
  { startMs: 8_000, endMs: 10_000 },
];
const silencios = silenciosEntreFalas(falas, 12_000);

t('encontra os 3 silencios', silencios.length === 3);

// O "deixa eu ajeitar a camera" que abre toda gravacao.
t('detecta o silencio inicial',
  silencios[0]?.startMs === 0 && silencios[0]?.endMs === 2_000);

t('detecta o silencio entre falas',
  silencios[1]?.startMs === 5_000 && silencios[1]?.endMs === 8_000);

t('detecta o silencio final',
  silencios[2]?.startMs === 10_000 && silencios[2]?.endMs === 12_000);

// Pausas de respiracao dao ritmo: cortar todas acelera o video e
// deixa a fala desconfortavel.
const curto = silenciosEntreFalas(
  [{ startMs: 0, endMs: 5_000 }, { startMs: 5_200, endMs: 10_000 }],
  10_000,
);
t('ignora pausa menor que o minimo', curto.length === 0);

t('o minimo preserva a respiracao', SILENCIO_MINIMO_MS === 400);

// Video sem nenhuma fala detectada e silencio do inicio ao fim.
t('video mudo vira um silencio unico',
  silenciosEntreFalas([], 8_000).length === 1);

// Ordem de entrada nao deve importar.
const desordenado = silenciosEntreFalas(
  [{ startMs: 8_000, endMs: 10_000 }, { startMs: 2_000, endMs: 5_000 }],
  12_000,
);
t('ordena as regioes antes de calcular', desordenado.length === 3);

// ============================================================
// Transcrição
// ============================================================

const transcricao = {
  language: 'pt',
  model: 'small',
  segments: [
    {
      startMs: 138_200,
      endMs: 144_900,
      text: 'O maior erro que eu vejo e a demora no atendimento',
      position: 0,
      words: [
        { word: 'O', startMs: 138_200, endMs: 138_300, confidence: 0.99 },
        { word: 'maior', startMs: 138_300, endMs: 138_700, confidence: 0.98 },
      ],
    },
  ],
};

t('aceita transcricao valida', transcriptionResultSchema.safeParse(transcricao).success);

t('rejeita segmento com fim antes do inicio',
  !transcriptionResultSchema.safeParse({
    ...transcricao,
    segments: [{ ...transcricao.segments[0], endMs: 138_000 }],
  }).success);

t('rejeita transcricao sem segmentos',
  !transcriptionResultSchema.safeParse({ ...transcricao, segments: [] }).success);

// Confianca fora de 0-1 indica erro de conversao no worker.
t('rejeita confianca invalida',
  !transcriptionResultSchema.safeParse({
    ...transcricao,
    segments: [{
      ...transcricao.segments[0],
      words: [{ word: 'x', startMs: 0, endMs: 10, confidence: 1.5 }],
    }],
  }).success);

// Timestamp por palavra e o que torna o corte preciso.
t('aceita segmento sem palavras',
  transcriptionResultSchema.safeParse({
    ...transcricao,
    segments: [{ startMs: 0, endMs: 1000, text: 'fala', position: 0, words: [] }],
  }).success);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
