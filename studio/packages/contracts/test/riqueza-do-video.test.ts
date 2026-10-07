// ============================================================
// O vídeo rico sem IA: efeitos de tela, sons, transições e zoom
// amarrados às cenas -- só acrescenta, nunca duplica, nada a mais.
// ============================================================

import { aplicarComando, intervalosDaFala, operacoesDeRiqueza, type CenaNoVideo, type EditPlanV1 } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  if (!cond) console.log(`FALHA ${nome}`);
};

const clips = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, sourceStartMs: i * 5000, sourceEndMs: i * 5000 + 5000, timelineStartMs: i * 5000, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'x', origin: 'fala' }));
const plano = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 30_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 30_000,
  framework: 'authority_education',
  clips,
  captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
} as unknown as EditPlanV1;

const cenas: CenaNoVideo[] = [
  { preset: 'cartaz', inicioMs: 2000, fimMs: 6000, layout: 'cartao' },
  { preset: 'numero_gigante', inicioMs: 8000, fimMs: 12000, layout: 'cartao' },
  { preset: 'mosaico', inicioMs: 14000, fimMs: 18000, layout: 'cartao' },
  { preset: 'hud', inicioMs: 20000, fimMs: 24000, layout: 'cartao' },
  { preset: 'lista', inicioMs: 25000, fimMs: 29000, layout: 'tela_cheia' },
];
const fala = intervalosDaFala(Array.from({ length: 60 }, (_, i) => ({ s: i * 0.5 })));
const ops = operacoesDeRiqueza(plano, { cenas, fala, energia: 'alta', comRosto: true });
const r = aplicarComando(plano, ops, {});
const efeitos = r.plan.screenEffects ?? [];
const tipoEm = (ms: number) => efeitos.filter((e) => e.timelineStartMs <= ms && e.timelineStartMs + e.durationMs > ms).map((e) => e.type);

t('todas as operações passam', r.aplicadas === ops.length && r.ignoradas.length === 0);
t('abertura com flash', efeitos.some((e) => e.type === 'flash' && e.timelineStartMs === 0));
t('flash na batida da palavra grande', efeitos.some((e) => e.type === 'flash' && Math.abs(e.timelineStartMs - 2120) < 5));
t('vinheta durante o número gigante', tipoEm(10_000).includes('vinheta'));
t('fundo escuro atrás dos cards em volta', tipoEm(16_000).includes('fundo_escuro'));
t('contorno de luz nas linhas de perspectiva', tipoEm(22_000).includes('contorno_luz'));
t('tela cheia esconde o vídeo: sem efeito nela', tipoEm(27_000).length === 0);
t('transições: uma sim, uma não', r.plan.transitions.filter((x) => x.type !== 'cut').length === 3);
t('zoom alternado nos trechos à mostra', r.plan.clips.filter((c) => c.effect === 'punch_in').length >= 2);
t('o trecho sob a tela cheia fica sem zoom', !r.plan.clips[5]!.effect);
const sons = r.plan.soundEffects;
t('um som na entrada das cenas (ding no número, pop nos cards)', sons.some((s) => s.assetId === 'sfx-ding' && Math.abs(s.timelineStartMs - 8000) < 10) && sons.some((s) => s.assetId === 'sfx-pop'));
t('sons espaçados (700 ms)', sons.every((s, i) => sons.every((o, j) => i === j || Math.abs(o.timelineStartMs - s.timelineStartMs) >= 300)));
t('por cima da fala, o som fica mais baixo', sons.filter((s) => s.assetId === 'sfx-ding').every((s) => s.gainDb <= -12));

// Aplicar de novo não duplica nada.
const denovo = operacoesDeRiqueza(r.plan, { cenas, fala, energia: 'alta', comRosto: true });
t('aplicar duas vezes não duplica efeitos nem transições', denovo.filter((o) => o.op === 'adicionar_efeito_de_tela' || o.op === 'definir_transicao' || o.op === 'definir_efeito').length === 0);

// O que já existe fica: transição escolhida, zoom já posto.
{
  const escolhido = aplicarComando(plano, [{ op: 'definir_transicao', clipId: 'c2', type: 'fade', durationMs: 400 }, { op: 'definir_efeito', clipId: 'c0', effect: 'zoom_lento' }, { op: 'definir_efeito', clipId: 'c2', effect: 'zoom_lento' }, { op: 'definir_efeito', clipId: 'c4', effect: 'zoom_lento' }], {}).plan;
  const o2 = operacoesDeRiqueza(escolhido, { cenas, fala, energia: 'alta', comRosto: true });
  t('com transição escolhida, não mexe nas transições', !o2.some((o) => o.op === 'definir_transicao'));
  t('com zoom suficiente, não mexe no zoom', !o2.some((o) => o.op === 'definir_efeito'));
}

// Energia baixa e vídeo calmo; sem rosto.
{
  const calmo = operacoesDeRiqueza(plano, { cenas, fala, energia: 'baixa', comRosto: true, calmo: true });
  t('calmo: abre e fecha em íris, passagens pelo preto, sem flash', calmo.some((o) => o.op === 'adicionar_efeito_de_tela' && o.type === 'iris_abrir') && calmo.some((o) => o.op === 'adicionar_efeito_de_tela' && o.type === 'iris_fechar') && calmo.some((o) => o.op === 'definir_transicao' && o.type === 'fadeblack') && !calmo.some((o) => o.op === 'adicionar_efeito_de_tela' && o.type === 'flash'));
  const semRosto = operacoesDeRiqueza(plano, { cenas, fala, energia: 'media', comRosto: false });
  t('sem rosto: nada que precise da pessoa (fundo escuro, contorno)', !semRosto.some((o) => o.op === 'adicionar_efeito_de_tela' && ['fundo_escuro', 'contorno_luz'].includes(o.type)));
}

t('a fala em intervalos: palavras próximas juntas', intervalosDaFala([{ s: 0 }, { s: 0.3 }, { s: 2 }]).length === 2);

console.log(`${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
