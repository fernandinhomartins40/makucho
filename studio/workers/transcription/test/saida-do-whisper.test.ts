// ============================================================
// O contrato entre o Python e o Node.
//
// Este é o acoplamento mais frágil do worker: o script Python monta
// um JSON à mão e o Node o valida com Zod. Um campo renomeado de um
// lado não quebra build nem typecheck — quebra em produção, depois do
// vídeo já ter sido enviado e do usuário estar esperando.
//
// Os casos abaixo são os formatos que o script pode produzir,
// conferidos contra o schema que o worker usa.
// ============================================================

import { transcriptionResultSchema, SILENCIO_MINIMO_MS } from '@makucho/studio-contracts';

let ok = 0;
let fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ============================================================
// Formato que o transcrever.py produz
// ============================================================

const saidaTipica = {
  language: 'pt',
  model: 'small',
  confidence: 0.82,
  segments: [
    {
      startMs: 0,
      endMs: 2400,
      text: 'Bom dia, hoje eu quero falar sobre atendimento.',
      confidence: 0.88,
      position: 0,
      words: [
        { word: 'Bom', startMs: 0, endMs: 300, confidence: 0.95 },
        { word: 'dia,', startMs: 300, endMs: 700, confidence: 0.91 },
      ],
    },
    {
      startMs: 2400,
      endMs: 5100,
      text: 'A maioria das empresas perde cliente por demora.',
      confidence: 0.76,
      position: 1,
      words: [],
    },
  ],
};

t('a saída típica do script passa no contrato', transcriptionResultSchema.safeParse(saidaTipica).success);

// `confidence` é opcional no segmento: o script a omite quando o
// whisper não devolve avg_logprob, em vez de inventar um número.
const semConfianca = {
  language: 'pt',
  model: 'small',
  segments: [{ startMs: 0, endMs: 1000, text: 'olá', position: 0, words: [] }],
};
t('segmento sem confiança é aceito', transcriptionResultSchema.safeParse(semConfianca).success);

// ============================================================
// O que o contrato precisa RECUSAR
//
// Cada caso aqui é um defeito que chegaria à timeline se passasse.
// ============================================================

const duracaoNegativa = {
  language: 'pt',
  model: 'small',
  segments: [{ startMs: 5000, endMs: 2000, text: 'invertido', position: 0, words: [] }],
};
t(
  'segmento com fim antes do início é recusado',
  !transcriptionResultSchema.safeParse(duracaoNegativa).success,
);

const semSegmento = { language: 'pt', model: 'small', segments: [] };
t(
  'transcrição sem nenhum segmento é recusada',
  !transcriptionResultSchema.safeParse(semSegmento).success,
);

const textoVazio = {
  language: 'pt',
  model: 'small',
  segments: [{ startMs: 0, endMs: 1000, text: '', position: 0, words: [] }],
};
t('segmento de texto vazio é recusado', !transcriptionResultSchema.safeParse(textoVazio).success);

const confianciaForaDaFaixa = {
  language: 'pt',
  model: 'small',
  segments: [
    {
      startMs: 0,
      endMs: 1000,
      text: 'olá',
      position: 0,
      words: [{ word: 'olá', startMs: 0, endMs: 500, confidence: 1.4 }],
    },
  ],
};
t(
  'confiança de palavra acima de 1 é recusada',
  !transcriptionResultSchema.safeParse(confianciaForaDaFaixa).success,
);

// ============================================================
// Filtro de silêncios
//
// O worker só grava como região o silêncio que vale remover: pausa de
// respiração dá ritmo à fala, e cortar todas produz vídeo acelerado
// (ADR 0010).
// ============================================================

const silencios = [
  { inicioMs: 1000, fimMs: 1200 }, // 200ms — respiração, fica
  { inicioMs: 3000, fimMs: 3400 }, // 400ms — exatamente o limite
  { inicioMs: 6000, fimMs: 8000 }, // 2s — hesitação, sai
];

const relevantes = silencios.filter((s) => s.fimMs - s.inicioMs >= SILENCIO_MINIMO_MS);

t('silêncio de 200ms não vira região', !relevantes.some((s) => s.inicioMs === 1000));
t('silêncio no limite exato de 400ms vira região', relevantes.some((s) => s.inicioMs === 3000));
t('silêncio de 2s vira região', relevantes.some((s) => s.inicioMs === 6000));

// ============================================================

console.log(`\n${ok} ok, ${fail} falhas`);
if (fail > 0) process.exit(1);
