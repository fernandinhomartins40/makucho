// ============================================================
// Legendas em todos os trechos, editáveis, e textos de destaque.
// ============================================================

import { aplicarOperacao, gerarAss, montarBlocos, resolverEstiloDaLegenda } from '../src';
import type { EditPlanV1, PalavraDaTranscricao } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// Três trechos REORDENADOS (o terceiro da gravação abre o vídeo).
const plano: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 30_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 9000,
  framework: 'authority_education',
  clips: [
    { id: 'c1', sourceStartMs: 20_000, sourceEndMs: 23_000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s3'], semanticRisk: 'low', reason: 'a' },
    { id: 'c2', sourceStartMs: 0, sourceEndMs: 3000, timelineStartMs: 3000, role: 'context', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'b' },
    { id: 'c3', sourceStartMs: 10_000, sourceEndMs: 13_000, timelineStartMs: 6000, role: 'cta', transcriptSegmentIds: ['s2'], semanticRisk: 'low', reason: 'c' },
  ],
  captions: { enabled: true, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
};

const p = (id: string, s: number, e: number, word: string): PalavraDaTranscricao => ({ id, startMs: s, endMs: e, word });
const palavras = [
  p('a1', 200, 700, 'primeiro'), p('a2', 800, 1300, 'trecho'),
  p('b1', 10_100, 10_600, 'terceiro'), p('b2', 10_700, 11_200, 'trecho'),
  // Palavra na BORDA: começa 100 ms antes do trecho c1 (80% dentro).
  p('c0', 19_900, 20_400, 'abrindo'), p('c1', 20_500, 21_000, 'segundo'),
  // Palavra quase toda FORA do trecho c2 (só 20% dentro): fica de fora.
  p('x1', 2900, 3400, 'fora'),
];
const estilo = resolverEstiloDaLegenda('padrao');
const blocos = montarBlocos({ plano, estilo, palavras });
const noTrecho = (de: number, ate: number) => blocos.filter((b) => b.inicioMs >= de && b.inicioMs < ate);

t('legenda no 1º trecho (que veio do fim da gravação)', noTrecho(0, 3000).length > 0);
t('legenda no 2º trecho', noTrecho(3000, 6000).length > 0);
t('legenda no 3º trecho', noTrecho(6000, 9000).length > 0);
t('palavra na borda (maior parte dentro) é legendada', blocos.some((b) => b.wordIds?.includes('c0')));
t('palavra na borda começa no 0 do trecho, não antes', blocos.find((b) => b.wordIds?.includes('c0'))!.inicioMs === 0);
t('palavra quase toda fora do trecho não aparece', !blocos.some((b) => b.wordIds?.includes('x1')));
t('tempo convertido: "terceiro" (10,1 s no original) aparece em 6,1 s', noTrecho(6000, 9000)[0]!.inicioMs === 6100);
t('cada bloco sabe suas palavras', blocos.filter((b) => !b.manualId).every((b) => (b.wordIds?.length ?? 0) === b.palavras.length));

// ---------- excluir e incluir ----------
const oculto = aplicarOperacao(plano, { op: 'ocultar_legenda', wordIds: ['a1', 'a2'] });
t('ocultar legenda passa no schema', oculto.ok);
const semPrimeiro = montarBlocos({ plano: oculto.plan!, estilo, palavras });
t('legenda ocultada some da tela', !semPrimeiro.some((b) => b.wordIds?.includes('a1')));
const restaurado = aplicarOperacao(oculto.plan!, { op: 'restaurar_legenda', wordIds: ['a1'] });
t('restaurar traz de volta', montarBlocos({ plano: restaurado.plan!, estilo, palavras }).some((b) => b.wordIds?.includes('a1')));

const manual = aplicarOperacao(plano, { op: 'adicionar_legenda', timelineStartMs: 4500, durationMs: 1200, text: 'escrita à mão' });
t('legenda manual entra', manual.ok && manual.plan!.captions.manual?.length === 1);
const comManual = montarBlocos({ plano: manual.plan!, estilo, palavras });
const bloco = comManual.find((b) => b.manualId);
t('legenda manual aparece no tempo pedido', bloco?.inicioMs === 4500 && bloco.fimMs === 5700);
t('palavras da manual espalhadas pela duração', bloco?.palavras.length === 3 && bloco.palavras[2]!.fimMs === 5700);
const id = manual.plan!.captions.manual![0]!.id;
const editada = aplicarOperacao(manual.plan!, { op: 'editar_legenda_manual', legendaId: id, text: 'outra', durationMs: 800 });
t('editar legenda manual', editada.ok && editada.plan!.captions.manual![0]!.text === 'outra' && editada.plan!.captions.manual![0]!.durationMs === 800);
t('remover legenda manual', aplicarOperacao(editada.plan!, { op: 'remover_legenda_manual', legendaId: id }).plan!.captions.manual!.length === 0);

// ---------- fonte e cores escolhidas ----------
const estilizado = aplicarOperacao(plano, { op: 'configurar_legenda', fontId: 'anton', color: '#FF0000', highlightColor: '#00FF00' });
const ass = gerarAss({ plano: estilizado.plan!, estilo, palavras });
t('fonte escolhida vai para o .ass (prévia e render)', /Style: Makucho,Anton,/.test(ass));
t('cor escolhida vai para o .ass', ass.includes('&H000000FF'));
const voltou = aplicarOperacao(estilizado.plan!, { op: 'configurar_legenda', fontId: null });
t('fonte null volta à do estilo', voltou.ok && voltou.plan!.captions.fontId === undefined);

// ---------- Destaque ----------
const d = aplicarOperacao(plano, {
  op: 'adicionar_overlay',
  component: 'Destaque',
  text: 'Responda em 5 minutos',
  timelineStartMs: 1000,
  durationMs: 2500,
  style: { x: 0.5, y: 0.25, decoration: 'marca_texto', fontId: 'bebas', sizeScale: 1.2 },
});
t('destaque entra com estilo', d.ok && d.plan!.overlays[0]!.style?.decoration === 'marca_texto');
const assD = gerarAss({ plano: d.plan!, estilo, palavras });
const linha = assD.split('\n').find((l) => l.includes('Responda'))!;
t('destaque no ponto escolhido (\pos)', linha.includes('\pos(540,480)'));
t('destaque com a fonte escolhida', linha.includes(String.raw`\fnBebas Neue`));
t('destaque em caixa (marca-texto): fundo amarelo desenhado atrás', assD.split('\n').some((l) => l.includes(String.raw`\c&H00D4FF&`) && l.includes(String.raw`\p1`)));
t('destaque no tempo certo', linha.includes('0:00:01.00,0:00:03.50'));
const movido = aplicarOperacao(d.plan!, { op: 'editar_overlay', overlayId: d.plan!.overlays[0]!.id, style: { y: 0.6 } });
t('mover não apaga o resto do estilo', movido.plan!.overlays[0]!.style?.decoration === 'marca_texto' && movido.plan!.overlays[0]!.style?.y === 0.6);
t('destaque sem texto é recusado', !aplicarOperacao(plano, { op: 'adicionar_overlay', component: 'Destaque', timelineStartMs: 0, durationMs: 1000 }).ok);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
