// ============================================================
// Agenda (transições sem congelar, áudio em peças), tirar pausas e as
// operações de áudio.
// ============================================================

import { agendaDoPlano, aplicarOperacao, editPlanV1Schema, tirarPausas, volumeDaPeca } from '../src';
import type { EditPlanV1 } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const base: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p',
  sourceMediaId: 'm',
  sourceDurationMs: 60_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 9000,
  framework: 'authority_education',
  clips: [
    { id: 'a', sourceStartMs: 1000, sourceEndMs: 5000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'x' },
    { id: 'b', sourceStartMs: 20_000, sourceEndMs: 25_000, timelineStartMs: 4000, role: 'payoff', transcriptSegmentIds: ['s2'], semanticRisk: 'low', reason: 'x' },
  ],
  captions: { enabled: false, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [{ id: 'o1', component: 'HookTitle', text: 'Oi', timelineStartMs: 4500, durationMs: 1000 }],
  soundEffects: [{ id: 'e1', assetId: 'sfx-pop', timelineStartMs: 4200, gainDb: -8 }],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
} as EditPlanV1;

// ---------- Corte seco ----------
const seco = agendaDoPlano(base);
t('dois trechos, 9 s', seco.trechos.length === 2 && seco.duracaoMs === 9000);
t('corte seco não tem janela de transição', seco.transicoes.length === 0);
const [pa, pb] = seco.audio;
t('a peça de A continua 30 ms depois do corte', pa!.duracaoMs === 4030 && pa!.fadeOutMs === 60);
t('a peça de B começa 30 ms antes do corte', pb!.inicioMs === 3970 && pb!.sourceInicioMs === 19_970 && pb!.fadeInMs === 60);
t('no corte, os dois volumes somam ~1 (cruzamento)', Math.abs(volumeDaPeca(pa!, 4000) + volumeDaPeca(pb!, 4000) - 1) < 0.02);

// ---------- Transição ----------
const comTr = { ...base, transitions: [{ id: 't', type: 'fade' as const, beforeClipIndex: 1, durationMs: 400 }] };
const ag = agendaDoPlano(comTr);
const j = ag.transicoes[0]!;
t('a transição fica centrada no corte (6 + 6 quadros)', j.antes === 6 && j.depois === 6 && j.inicioMs === 3800 && j.fimMs === 4200);
t('a duração total não muda', ag.duracaoMs === 9000);
t('A cede 6 quadros no fim, B 6 no começo', ag.trechos[0]!.consumidoNoFim === 6 && ag.trechos[1]!.consumidoNoInicio === 6);
t('o áudio cruza pela janela inteira', ag.audio[0]!.fadeOutMs === 400 && ag.audio[1]!.fadeInMs === 400 && ag.audio[1]!.inicioMs === 3800);

// Sem sobra antes de B (começa no zero do original): A cobre a janela.
const semSobra = agendaDoPlano({
  ...comTr,
  clips: [base.clips[0]!, { ...base.clips[1]!, sourceStartMs: 0, sourceEndMs: 5000 }],
});
t('sem sobra antes de B, a janela vai toda para depois do corte', semSobra.transicoes[0]!.antes === 0 && semSobra.transicoes[0]!.depois === 12);

// ---------- Áudio do trecho ----------
const mudo = aplicarOperacao(base, { op: 'ajustar_audio_do_clipe', clipId: 'a', muted: true });
t('mudo: a peça de A some', mudo.ok && agendaDoPlano(mudo.plan!).audio.every((p) => p.clipId !== 'a'));
const jcut = aplicarOperacao(base, { op: 'ajustar_audio_do_clipe', clipId: 'b', leadMs: 800, gainDb: 4 });
const pj = agendaDoPlano(jcut.plan!).audio.find((p) => p.clipId === 'b')!;
t('J-cut: o som de B entra 800 ms antes da imagem', pj.inicioMs === 3200 && pj.sourceInicioMs === 19_200 && pj.ganhoDb === 4);
const lcut = aplicarOperacao(base, { op: 'ajustar_audio_do_clipe', clipId: 'a', tailMs: 700, fadeOutMs: 500 });
const pl = agendaDoPlano(lcut.plan!).audio.find((p) => p.clipId === 'a')!;
t('L-cut: o som de A continua 700 ms depois', pl.duracaoMs === 4700 && pl.fadeOutMs === 500);
const volta = aplicarOperacao(lcut.plan!, { op: 'ajustar_audio_do_clipe', clipId: 'a', tailMs: null, fadeOutMs: null });
t('null volta ao padrão (e limpa o campo)', volta.ok && volta.plan!.clips[0]!.audio === undefined);
t('o plano com áudio por trecho é válido', editPlanV1Schema.safeParse(jcut.plan).success);

// ---------- Trilha e efeitos ----------
t('configurar trilha sem trilha é recusado', !aplicarOperacao(base, { op: 'configurar_musica', gainDb: -10 }).ok);
const comTrilha = aplicarOperacao(base, { op: 'trocar_musica', assetId: 'mus1' });
const trilha = aplicarOperacao(comTrilha.plan!, { op: 'configurar_musica', gainDb: -12, fadeInMs: 2000, duckUnderVoice: false });
t('a trilha muda volume, fade e ducking', trilha.ok && trilha.plan!.music!.gainDb === -12 && trilha.plan!.music!.fadeInMs === 2000 && trilha.plan!.music!.duckUnderVoice === false);
const movido = aplicarOperacao(base, { op: 'editar_efeito_sonoro', soundEffectId: 'e1', timelineStartMs: 6000, gainDb: -2 });
t('efeito sonoro move e muda o volume', movido.ok && movido.plan!.soundEffects[0]!.timelineStartMs === 6000 && movido.plan!.soundEffects[0]!.gainDb === -2);
t('os novos efeitos embutidos são aceitos', aplicarOperacao(base, { op: 'adicionar_efeito_sonoro', assetId: 'sfx-impacto', timelineStartMs: 100 }).ok);

// ---------- Tirar pausas ----------
const palavras = [
  { id: 'w1', startMs: 1600, endMs: 2000, word: 'Olá' },
  { id: 'w2', startMs: 2100, endMs: 2500, word: 'pessoal' },
  // pausa de 1,5 s no meio de A
  { id: 'w3', startMs: 4000, endMs: 4400, word: 'hoje' },
  { id: 'w4', startMs: 20_900, endMs: 21_300, word: 'então' },
  { id: 'w5', startMs: 21_400, endMs: 24_000, word: 'responda' },
];
const apertado = tirarPausas(base, palavras);
const [ca, cb] = apertado.plano.clips;
t('as bordas encostam na fala (80 ms antes, 160 depois)', ca!.sourceStartMs === 1520 && ca!.sourceEndMs === 4560 && cb!.sourceStartMs === 20_820 && cb!.sourceEndMs === 24_160);
t('o vídeo encurta o que era silêncio', apertado.removidoMs === 9000 - (3040 + 3340));
t('o plano apertado é válido', editPlanV1Schema.safeParse(apertado.plano).success);
t('o título acompanha a fala (4,5 s no original 20,5 s → começo de B)', apertado.plano.overlays[0]!.timelineStartMs === 3040);
const dividido = tirarPausas(base, palavras, { pausaMinimaMs: 1000 });
t('pausa longa no meio vira corte', dividido.divisoes === 1 && dividido.plano.clips.length === 3);
t('o pedaço novo tem id próprio', new Set(dividido.plano.clips.map((c) => c.id)).size === 3);
t('rodar de novo não repete id', new Set(tirarPausas(dividido.plano, palavras, { pausaMinimaMs: 1000 }).plano.clips.map((c) => c.id)).size === 3);
t('o plano dividido é válido', editPlanV1Schema.safeParse(dividido.plano).success);
const comTransicao = tirarPausas({ ...comTr }, palavras, { pausaMinimaMs: 1000 });
t('a transição segue o trecho dela (índice remapeado)', comTransicao.plano.transitions[0]!.beforeClipIndex === 2);
const comJ = aplicarOperacao(base, { op: 'ajustar_audio_do_clipe', clipId: 'a', leadMs: 300, tailMs: 400, gainDb: 3 }).plan!;
const jDividido = tirarPausas(comJ, palavras, { pausaMinimaMs: 1000 }).plano.clips.filter((c) => c.id === 'a' || c.id.startsWith('a-p'));
t(
  'dividir guarda o J só no primeiro pedaço e o L só no último',
  jDividido[0]!.audio?.leadMs === 300 && !jDividido[0]!.audio?.tailMs && jDividido[1]!.audio?.tailMs === 400 && !jDividido[1]!.audio?.leadMs,
);
t('o volume vale para todos os pedaços', jDividido.every((c) => c.audio?.gainDb === 3));

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
