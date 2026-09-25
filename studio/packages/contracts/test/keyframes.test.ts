// ============================================================
// Animação livre (keyframes), animações novas de texto e a entrada de
// cada bloco de legenda.
// ============================================================

import {
  CORES_PADRAO_DA_MARCA,
  comKeyframe,
  editPlanV1Schema,
  estadoDoTexto,
  eventosDoTextoDeTela,
  gerarAss,
  resolverEstiloDaLegenda,
  semKeyframe,
} from '../src';
import type { EditPlanV1 } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};
const perto = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

const base: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p',
  sourceMediaId: 'm',
  sourceDurationMs: 10_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 10_000,
  framework: 'authority_education',
  clips: [{ id: 'c1', sourceStartMs: 0, sourceEndMs: 10_000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'x' }],
  captions: { enabled: false, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
} as EditPlanV1;
const marca = { cores: CORES_PADRAO_DA_MARCA };

// ---------- Interpolação ----------
const texto = {
  id: 'o1',
  component: 'Destaque' as const,
  text: 'Olha isso',
  timelineStartMs: 1000,
  durationMs: 2000,
  style: {
    x: 0.5,
    y: 0.3,
    keyframes: [
      { t: 0, x: 0.2, scale: 1, ease: 'linear' as const },
      { t: 1000, x: 0.8, scale: 2, rotation: 30 },
      { t: 2000, opacity: 0 },
    ],
  },
};
t('antes do primeiro ponto, o valor do primeiro', perto(estadoDoTexto(texto, 0).x, 0.2));
t('no meio, linear quando o ponto de saída é linear', perto(estadoDoTexto(texto, 500).x, 0.5) && perto(estadoDoTexto(texto, 500).scale, 1.5));
t('depois do último ponto de x, fica parado', perto(estadoDoTexto(texto, 1800).x, 0.8));
t('propriedade sem ponto segue o estilo (y)', perto(estadoDoTexto(texto, 700).y, 0.3));
t('um ponto só de giro vale o tempo todo', perto(estadoDoTexto(texto, 100).rotation, 30));
t('opacidade: 1 do estilo até o ponto que a define, que vale para trás', perto(estadoDoTexto(texto, 2000).opacity, 0) && perto(estadoDoTexto(texto, 0).opacity, 0));
const suave = { ...texto, style: { ...texto.style, keyframes: [{ t: 0, x: 0 }, { t: 1000, x: 1 }] } };
t('curva padrão é suave (devagar nas pontas)', estadoDoTexto(suave, 100).x < 0.1 && perto(estadoDoTexto(suave, 500).x, 0.5));

// ---------- Pôr e tirar pontos ----------
const semPontos = { component: 'Destaque' as const, style: { x: 0.4, y: 0.6 } };
const um = comKeyframe(semPontos, 512, { x: 0.9 }, marca);
t('ponto novo alinha ao quadro e nasce com o estado do instante', um.length === 1 && um[0]!.t === 500 && um[0]!.x === 0.9 && um[0]!.y === 0.6 && um[0]!.scale === 1);
const dois = comKeyframe({ ...semPontos, style: { ...semPontos.style, keyframes: um } }, 505, { scale: 1.4 }, marca);
t('ponto no mesmo quadro é atualizado, não duplicado', dois.length === 1 && dois[0]!.scale === 1.4 && dois[0]!.x === 0.9);
t('tirar o ponto', semKeyframe({ style: { keyframes: dois } }, 500).length === 0);

// ---------- ASS ----------
const plano = { ...base, overlays: [texto] } as EditPlanV1;
t('plano com keyframes é válido', editPlanV1Schema.safeParse(plano).success);
const ev = eventosDoTextoDeTela(plano, texto, 1000, 3000, marca);
t('keyframes viram pedaços curtos com \\move e \\t', ev.length > 10 && ev.every((l) => l.includes('\\t(0,')) && ev.some((l) => l.includes('\\move(')));
t('o primeiro pedaço começa em x = 0,2 do quadro', ev[0]!.includes('\\move(216,576,'));
t('com keyframes, a entrada e a saída ficam desligadas', !ev.some((l) => l.includes('\\fad(')));
const parado = { ...texto, style: { x: 0.5, y: 0.5, keyframes: [{ t: 0, scale: 1.2 }] } };
t('onde nada muda, um evento só (com \\pos)', eventosDoTextoDeTela({ ...base, overlays: [parado] } as EditPlanV1, parado, 0, 2000, marca).filter((l) => l.includes(',TextoDeTela,')).length === 1);

// ---------- Animações novas ----------
const anima = (style: Record<string, unknown>) => eventosDoTextoDeTela(base, { ...texto, style: { x: 0.5, y: 0.3, ...style } } as EditPlanV1['overlays'][number], 0, 4000, marca).join('\n');
t('entrada desfocar: \\blur que zera', anima({ entrada: 'desfocar' }).includes('\\blur18\\t(0,340,\\blur0)'));
t('entrada quique: cai com \\move e quica na escala', anima({ entrada: 'quique' }).includes('\\fscx112\\fscy84'));
t('entrada letras: cada letra com \\fscy0 que cresce', (anima({ entrada: 'letras' }).match(/\\fscy0\\t/g) ?? []).length === 'Olha isso'.replace(' ', '').length + 1);
t('durante onda: letras crescem em sequência', anima({ durante: 'onda' }).includes('\\fscy125'));
t('durante piscar e batimento', anima({ durante: 'piscar' }).includes('\\alpha&HC0&') && anima({ durante: 'batimento' }).includes('\\fscx110'));
t('saída letras: cada letra some no seu tempo', (anima({ saida: 'letras' }).match(/\\alpha&HFF&\)/g) ?? []).length >= 8);

// ---------- Entrada de cada bloco de legenda ----------
const comLegenda = { ...base, captions: { ...base.captions, enabled: true, highlightActiveWord: false, blockEntrance: 'pop' as const } } as EditPlanV1;
const palavras = ['um', 'dois', 'tres', 'quatro'].map((p, i) => ({ id: `w${i}`, word: p, startMs: i * 400, endMs: i * 400 + 380 }));
const ass = gerarAss({ plano: comLegenda, estilo: resolverEstiloDaLegenda('padrao'), palavras, marca });
const linhas = ass.split('\n').filter((l) => l.startsWith('Dialogue:') && l.includes(',Makucho,'));
t('cada bloco entra com pop', linhas.length >= 1 && linhas.every((l) => l.split(',').slice(8).join(',').startsWith('{\\fscx80\\fscy80\\t(0,120,')));
t('plano com entrada de bloco é válido', editPlanV1Schema.safeParse(comLegenda).success);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
