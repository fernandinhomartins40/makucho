// ============================================================
// Vídeo falado e vídeos de apoio: o papel de cada parte, a fala que
// fica na linha principal e onde o apoio entra (mudo, por cima da fala).
// ============================================================

import {
  COMECO_SEM_APOIO_MS,
  aplicarOperacao,
  colocacaoSemIa,
  lerColocacoesDosApoios,
  operacoesDosApoios,
  papeisDasPartes,
  segmentosSoDaFala,
} from '../src';
import type { ApoioParaColocar, EditPlanV1 } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ---------- Papéis ----------
// 0-30 s: a pessoa falando; 30-38 s: a loja (som ambiente); 38-60 s: falando de novo.
const partes = [
  { inicioMs: 0, fimMs: 30_000 },
  { inicioMs: 30_000, fimMs: 38_000 },
  { inicioMs: 38_000, fimMs: 60_000 },
];
const fala = [
  ...Array.from({ length: 6 }, (_, i) => ({ startMs: i * 5000, endMs: i * 5000 + 4200, confidence: 0.8 })),
  // Uma frase solta que o whisper ouviu no fundo da loja.
  { startMs: 33_000, endMs: 33_800, confidence: 0.4 },
  ...Array.from({ length: 4 }, (_, i) => ({ startMs: 38_000 + i * 5000, endMs: 38_000 + i * 5000 + 4200, confidence: 0.8 })),
];
const papeis = papeisDasPartes(partes, fala, []);
t('a parte falada é fala', papeis[0]!.papel === 'fala' && papeis[2]!.papel === 'fala');
t('a parte com som ambiente é apoio', papeis[1]!.papel === 'apoio');
t('só imagens (nenhuma parte falada): tudo segue como fala', papeisDasPartes(partes, [], []).every((p) => p.papel === 'fala'));
t('duas tomadas faladas continuam fala', papeisDasPartes([partes[0]!, partes[2]!], fala, []).every((p) => p.papel === 'fala'));

const comPapel = partes.map((p, i) => ({ ...p, papel: papeis[i]!.papel }));
const soFala = segmentosSoDaFala(fala, comPapel);
t('a frase do fundo da loja sai da linha principal', soFala.length === fala.length - 1 && !soFala.some((s) => s.startMs === 33_000));
t('sem apoio, a fala fica inteira', segmentosSoDaFala(fala, partes.map((p) => ({ ...p, papel: 'fala' as const }))).length === fala.length);

// ---------- Onde entra ----------
const apoios: ApoioParaColocar[] = [
  { assetId: 'apoio1', nome: 'loja.mov', duracaoMs: 8000, cenas: [{ inicioMs: 0, fimMs: 8000, mostra: 'vitrine de loja' }] },
  { assetId: 'apoio2', nome: 'produto.mov', duracaoMs: 1000, cenas: [] },
];
const lidas = lerColocacoesDosApoios(
  JSON.stringify({
    entradas: [
      { apoio: 1, inicio: 0.2, fim: 4, trecho: 6, motivo: 'quando fala da loja' },
      { apoio: 1, inicio: 3, fim: 5, trecho: 0 },
      { apoio: 1, inicio: 20, fim: 40, trecho: 0 },
      { apoio: 2, inicio: 30, fim: 33 },
      { apoio: 9, inicio: 40, fim: 43 },
    ],
  }),
  apoios,
  60_000,
);
t('resposta lida', lidas.ok);
if (lidas.ok) {
  const [a, b] = lidas.colocacoes;
  t('o gancho fica com o rosto (entrada empurrada para depois)', a!.timelineStartMs === COMECO_SEM_APOIO_MS);
  t('o trecho cabe no apoio', a!.sourceStartMs + a!.durationMs <= 8000);
  t('entrada por cima de outra sai', lidas.colocacoes.filter((c) => c.timelineStartMs < 5000).length === 1);
  t('entrada longa é cortada em 6 s', b!.timelineStartMs === 20_000 && b!.durationMs === 6000);
  t('apoio curto demais e apoio inexistente saem', lidas.colocacoes.length === 2);
}
t('resposta inválida é recusada', !lerColocacoesDosApoios('não sei', apoios, 60_000).ok);

const semIa = colocacaoSemIa(apoios, 60_000);
t('sem IA: o apoio usável entra uma vez, depois do gancho', semIa.length === 1 && semIa[0]!.timelineStartMs >= COMECO_SEM_APOIO_MS);
t('sem IA: respeita os instantes ocupados', colocacaoSemIa(apoios, 60_000, [{ inicioMs: 0, fimMs: 60_000 }]).length === 0);

// ---------- Operações ----------
const plano: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 60_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 60_000,
  framework: 'authority_education',
  clips: [{ id: 'c1', sourceStartMs: 0, sourceEndMs: 60_000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'a' }],
  captions: { enabled: true, styleId: 'st1', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
};
let atual = plano;
let aplicou = true;
for (const op of operacoesDosApoios(semIa)) {
  const r = aplicarOperacao(atual, op);
  if (!r.ok || !r.plan) {
    aplicou = false;
    console.log('  recusa:', r.erro);
  } else atual = r.plan;
}
const camada = atual.mediaLayers?.[0];
t('a operação entra no plano', aplicou && !!camada);
t('o apoio entra mudo, em tela cheia, no trecho escolhido', camada?.kind === 'video' && camada.layout === 'tela_cheia' && camada.volume === 0 && camada.sourceStartMs === semIa[0]?.sourceStartMs);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
