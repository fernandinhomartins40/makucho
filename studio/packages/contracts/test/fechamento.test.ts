// ============================================================
// O vídeo termina concluindo o assunto?
// ============================================================

import { analisarFechamento, aplicarOperacao } from '../src';
import type { EditPlanV1 } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const segmentos = [
  { id: 's1', startMs: 0, endMs: 4000, text: 'O maior erro de quem vende pelo WhatsApp é demorar.' },
  { id: 's2', startMs: 4000, endMs: 9000, text: 'Quando o cliente espera, ele compra do concorrente e' },
  { id: 's3', startMs: 9000, endMs: 12_000, text: 'você perde a venda sem perceber.' },
  { id: 's4', startMs: 12_000, endMs: 16_000, text: 'Então responda em até cinco minutos, sempre.' },
];

const plano = (clips: Array<[string, number, number, string]>): EditPlanV1 => {
  let acc = 0;
  return {
    schemaVersion: '1.0',
    projectId: 'p',
    sourceMediaId: 'm',
    sourceDurationMs: 16_000,
    fps: 30,
    canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
    targetDurationMs: clips.reduce((t, c) => t + (c[2] - c[1]), 0),
    framework: 'authority_education',
    clips: clips.map(([id, s, e, role]) => {
      const c = { id, sourceStartMs: s, sourceEndMs: e, timelineStartMs: acc, role: role as 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low' as const, reason: 'x' };
      acc += e - s;
      return c;
    }),
    captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
    overlays: [],
    soundEffects: [],
    transitions: [],
    render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
  };
};

// Termina numa linha que não fecha a frase ("...concorrente e").
const aberto = analisarFechamento(plano([['c1', 0, 4000, 'hook'], ['c2', 4000, 9000, 'problem']]), segmentos);
t('linha sem ponto final = meio da frase', aberto.problema === 'meio_da_frase');
t('propõe estender até o fim da frase (s3)', aberto.estender?.sourceEndMs === 12_000 && aberto.estender.clipId === 'c2');
t('mostra o que vai entrar', aberto.estender?.acrescimo.includes('perde a venda') === true);
t('oferece outro final que soa conclusivo (s4, "Então...")', aberto.candidatos[0]?.segmentIds[0] === 's4');

// Corte dentro da linha (a linha termina em ponto, mas o corte não chega lá).
const cortado = analisarFechamento(plano([['c1', 0, 2500, 'hook']]), segmentos);
t('corte dentro da linha = meio da frase', cortado.problema === 'meio_da_frase');
t('estende até o fim da própria linha', cortado.estender?.sourceEndMs === 4000);

// Termina num trecho de abertura, com frase completa.
const semFim = analisarFechamento(plano([['c1', 9000, 12_000, 'context'], ['c2', 0, 4000, 'problem']]), segmentos);
t('termina apresentando o problema = sem conclusão', semFim.problema === 'sem_conclusao');
t('sem conclusão oferece trechos não usados', semFim.candidatos.some((c) => c.segmentIds[0] === 's4'));

// Bem fechado.
const bom = analisarFechamento(plano([['c1', 0, 4000, 'hook'], ['c2', 12_000, 16_000, 'payoff']]), segmentos);
t('vídeo que fecha a ideia não tem problema', bom.problema === null);

// Não estende por cima de fala já usada em outro trecho.
const repetiria = analisarFechamento(plano([['c1', 9000, 12_000, 'hook'], ['c2', 4000, 9000, 'problem']]), segmentos);
t('não estende por fala que já está no vídeo', repetiria.estender === undefined);

// A saída proposta é uma operação válida.
const p = plano([['c1', 0, 4000, 'hook'], ['c2', 4000, 9000, 'problem']]);
const r = aplicarOperacao(p, { op: 'ajustar_corte', clipId: 'c2', sourceStartMs: aberto.estender!.sourceStartMs, sourceEndMs: aberto.estender!.sourceEndMs });
const depois = analisarFechamento(r.plan!, segmentos);
t('estender vira ajustar_corte válido e a frase fica completa', r.ok && depois.problema !== 'meio_da_frase');
t('frase completa mas terminando no problema ainda pede conclusão', depois.problema === 'sem_conclusao');

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
