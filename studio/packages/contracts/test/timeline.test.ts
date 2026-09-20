import {
  aplicarOperacao,
  aplicarOperacoes,
  montarVisao,
  duracaoDoPlano,
  timelineOperationSchema,
} from '../src/index';
import type { EditPlanV1, TimelineOperation } from '../src/index';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const plano: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'proj1',
  sourceMediaId: 'media1',
  sourceDurationMs: 480_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 17_400,
  framework: 'authority_education',
  clips: [
    {
      id: 'c1', sourceStartMs: 138_200, sourceEndMs: 144_900, timelineStartMs: 0,
      role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'hook forte',
    },
    {
      id: 'c2', sourceStartMs: 271_100, sourceEndMs: 277_600, timelineStartMs: 6_700,
      role: 'authority', transcriptSegmentIds: ['s2'], semanticRisk: 'low', reason: 'autoridade',
    },
    {
      id: 'c3', sourceStartMs: 370_000, sourceEndMs: 374_200, timelineStartMs: 13_200,
      role: 'cta', transcriptSegmentIds: ['s3'], semanticRisk: 'low', reason: 'cta',
    },
  ],
  captions: {
    enabled: true, styleId: 'st1', wordsPerBlock: 3,
    position: 'bottom', highlightActiveWord: true,
  },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: {
    fps: 30, videoCodec: 'h264', audioCodec: 'aac',
    crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14,
  },
};

// ============================================================
// Schema das operações
// ============================================================

t('aceita operacao de mover',
  timelineOperationSchema.safeParse({ op: 'mover_clipe', clipId: 'c1', timelineStartMs: 0 }).success);

t('rejeita operacao desconhecida',
  !timelineOperationSchema.safeParse({ op: 'deletar_tudo', clipId: 'c1' }).success);

t('rejeita corte com fim antes do inicio',
  !timelineOperationSchema.safeParse({
    op: 'ajustar_corte', clipId: 'c1', sourceStartMs: 5000, sourceEndMs: 1000,
  }).success);

// ============================================================
// Ajustar corte
// ============================================================

const encurtado = aplicarOperacao(plano, {
  op: 'ajustar_corte', clipId: 'c1', sourceStartMs: 139_000, sourceEndMs: 143_000,
});

t('encurta o clipe', encurtado.ok);
t('o novo trecho aponta para o original',
  encurtado.plan?.clips[0]?.sourceStartMs === 139_000);

// Mudar a duracao de um clipe desloca os seguintes: sem isso sobraria
// buraco ou sobreposicao.
t('os clipes seguintes sao reposicionados',
  encurtado.plan?.clips[1]?.timelineStartMs === 4_000);

t('a duracao total acompanha a mudanca',
  encurtado.plan !== undefined && duracaoDoPlano(encurtado.plan) === 14_700);

// O trecho precisa existir no video original.
const alemDoFim = aplicarOperacao(plano, {
  op: 'ajustar_corte', clipId: 'c1', sourceStartMs: 470_000, sourceEndMs: 500_000,
});
t('recusa corte alem da duracao do original', !alemDoFim.ok);
t('o erro explica o motivo',
  alemDoFim.erro?.includes('ultrapassa') === true);

t('recusa clipe inexistente',
  !aplicarOperacao(plano, {
    op: 'ajustar_corte', clipId: 'nao_existe', sourceStartMs: 0, sourceEndMs: 1000,
  }).ok);

// ============================================================
// Desativar e restaurar
// ============================================================

const semC2 = aplicarOperacao(plano, { op: 'alternar_clipe', clipId: 'c2', enabled: false });
t('desativa um clipe', semC2.ok && semC2.plan?.clips.length === 2);

t('a timeline se recompoe sem buraco',
  semC2.plan?.clips[1]?.timelineStartMs === 6_700);

// O contexto mestre (secao 13) exige poder RESTAURAR um trecho: por
// isso "desativar" e nao "deletar". O plano anterior fica intacto.
t('o plano original nao e mutado', plano.clips.length === 3);

// Um EditPlan sem clipe nao renderiza nada.
const soUm: EditPlanV1 = {
  ...plano,
  clips: [plano.clips[0]!],
  targetDurationMs: 6_700,
};
t('recusa desativar o ultimo trecho',
  !aplicarOperacao(soUm, { op: 'alternar_clipe', clipId: 'c1', enabled: false }).ok);

// ============================================================
// Reordenar
// ============================================================

const reordenado = aplicarOperacao(plano, {
  op: 'reordenar', clipIds: ['c3', 'c1', 'c2'],
});

t('reordena os clipes', reordenado.ok);
t('o CTA passa a ser o primeiro', reordenado.plan?.clips[0]?.id === 'c3');
t('o primeiro comeca no zero', reordenado.plan?.clips[0]?.timelineStartMs === 0);

// 4.2s do c3, depois o c1 comeca.
t('a sequencia e recomposta', reordenado.plan?.clips[1]?.timelineStartMs === 4_200);

// Ordem parcial perderia clipes silenciosamente.
t('recusa ordem que nao inclui todos',
  !aplicarOperacao(plano, { op: 'reordenar', clipIds: ['c1'] }).ok);

// ============================================================
// Legenda e música
// ============================================================

t('troca o estilo de legenda',
  aplicarOperacao(plano, { op: 'trocar_estilo_legenda', styleId: 'st2' })
    .plan?.captions.styleId === 'st2');

const comMusica = aplicarOperacao(plano, {
  op: 'trocar_musica', assetId: 'mus1', gainDb: -20,
});
t('adiciona trilha', comMusica.plan?.music?.assetId === 'mus1');
t('respeita o ganho informado', comMusica.plan?.music?.gainDb === -20);

t('remove a trilha',
  comMusica.plan !== undefined &&
  aplicarOperacao(comMusica.plan, { op: 'trocar_musica', assetId: null })
    .plan?.music === undefined);

// Corrigir erro de transcricao muda o que esta ESCRITO, nao o que
// foi FALADO.
t('edita o texto da legenda',
  aplicarOperacao(plano, { op: 'editar_legenda', clipId: 'c1', text: 'Texto corrigido' }).ok);

// ============================================================
// Sequência de operações
// ============================================================

const varias: TimelineOperation[] = [
  { op: 'ajustar_corte', clipId: 'c1', sourceStartMs: 139_000, sourceEndMs: 143_000 },
  { op: 'reordenar', clipIds: ['c2', 'c1', 'c3'] },
  { op: 'trocar_estilo_legenda', styleId: 'st3' },
];

const sequencia = aplicarOperacoes(plano, varias);
t('aplica varias operacoes', sequencia.ok);
t('o resultado reflete todas', sequencia.plan?.clips[0]?.id === 'c2' &&
  sequencia.plan?.captions.styleId === 'st3');

// Aplicar metade deixaria o usuario com um estado que ele nao pediu.
const comFalha = aplicarOperacoes(plano, [
  { op: 'trocar_estilo_legenda', styleId: 'st2' },
  { op: 'ajustar_corte', clipId: 'inexistente', sourceStartMs: 0, sourceEndMs: 100 },
]);
t('para na primeira falha', !comFalha.ok);
t('o erro diz qual operacao falhou', comFalha.erro?.includes('operacao 2') === true);

// ============================================================
// Visão para a interface
// ============================================================

const visao = montarVisao(plano);
t('monta a track de video', visao.video.length === 3);
t('o item carrega a funcao comunicacional', visao.video[0]?.label === 'hook');

// A interface precisa mostrar de onde veio cada trecho.
t('o item aponta para o original',
  visao.video[0]?.sourceStartMs === 138_200);

// Trecho de risco alto exige confirmacao antes do render.
t('o item carrega o risco semantico',
  visao.video[0]?.semanticRisk === 'low');

t('as cinco tracks existem',
  ['video', 'text', 'assets', 'music', 'effects']
    .every((tr) => tr in visao));

t('sem trilha, a track de musica fica vazia', visao.music.length === 0);

const visaoComMusica = comMusica.plan ? montarVisao(comMusica.plan) : null;
t('com trilha, a track cobre o video inteiro',
  visaoComMusica?.music[0]?.endMs === 17_400);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
