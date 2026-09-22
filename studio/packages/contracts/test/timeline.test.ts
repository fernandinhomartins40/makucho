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
    corrections: [],
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

// ============================================================
// Inserir: traz para a timeline um trecho que ficou de fora
//
// E a operacao que aplica um candidato da chamada #4. Nao viola a
// integridade editorial: o trecho vem do ORIGINAL, pelos tempos dele,
// e carrega transcriptSegmentIds como qualquer outro clipe.
// ============================================================

const paraInserir = {
  op: 'inserir' as const,
  sourceStartMs: 200_000,
  sourceEndMs: 208_000,
  role: 'proof' as const,
  transcriptSegmentIds: ['s9'],
  reason: 'Traz o caso concreto que faltava.',
  semanticRisk: 'low' as const,
};

const inserido = aplicarOperacao(plano, paraInserir);

t('inserir e aceito', inserido.ok);
t('a timeline ganha um trecho', inserido.plan?.clips.length === plano.clips.length + 1);
t(
  'o trecho novo aponta para o original',
  inserido.plan?.clips.some((c) => c.sourceStartMs === 200_000 && c.sourceEndMs === 208_000) === true,
);
t(
  'e carrega a origem na transcricao',
  inserido.plan?.clips.find((c) => c.sourceStartMs === 200_000)?.transcriptSegmentIds[0] === 's9',
);
t('sem aposClipId, entra no fim', inserido.plan?.clips.at(-1)?.sourceStartMs === 200_000);
t('a duracao total aumenta', (inserido.plan?.targetDurationMs ?? 0) > plano.targetDurationMs);

// Inserir no meio nao pode deixar buraco na timeline.
const noMeio = aplicarOperacao(plano, { ...paraInserir, aposClipId: 'c1' });
t('com aposClipId, a insercao e aceita', noMeio.ok);

if (noMeio.plan) {
  const i = noMeio.plan.clips.findIndex((c) => c.sourceStartMs === 200_000);
  t('o trecho novo fica logo depois do indicado', i === 1);

  let esperado = 0;
  const semBuraco = noMeio.plan.clips.every((c) => {
    const bate = c.timelineStartMs === esperado;
    esperado += c.sourceEndMs - c.sourceStartMs;
    return bate;
  });
  t('a timeline e recomposta sem buraco apos inserir', semBuraco);
}

// --- Recusas ---
t(
  'RECUSA trecho alem do fim da gravacao',
  !aplicarOperacao(plano, { ...paraInserir, sourceStartMs: 470_000, sourceEndMs: 490_000 }).ok,
);
t(
  'RECUSA fim antes do inicio',
  !aplicarOperacao(plano, { ...paraInserir, sourceStartMs: 208_000, sourceEndMs: 200_000 }).ok,
);
t(
  'RECUSA aposClipId inexistente',
  !aplicarOperacao(plano, { ...paraInserir, aposClipId: 'naoexiste' }).ok,
);
// Sem origem na transcricao, a fala nao tem como ser comprovada -- e
// exatamente o caso que a regra de integridade editorial proibe.
t(
  'RECUSA insercao sem transcriptSegmentIds',
  !timelineOperationSchema.safeParse({ ...paraInserir, transcriptSegmentIds: [] }).success,
);

t('o plano original nao e mutado pela insercao', plano.clips.length === 3);

// ============================================================
// Correcao de transcricao
//
// O whisper erra nome proprio, jargao e sigla. Antes esta operacao
// era um `break` vazio: era aceita, salvava uma versao, e o render
// ignorava -- a legenda saia do whisper de novo.
// ============================================================

const corrigido = aplicarOperacao(plano, {
  op: 'editar_legenda', wordId: 'w1', text: 'Makucho', original: 'macucho',
});

t('a correcao e aceita', corrigido.ok);
t('e ENTRA no plano -- nao e mais um break vazio',
  corrigido.plan?.captions.corrections.length === 1);
t('com o texto corrigido',
  corrigido.plan?.captions.corrections[0]?.text === 'Makucho');
t('e o original preservado, para exibir e desfazer',
  corrigido.plan?.captions.corrections[0]?.original === 'macucho');

// O tempo NAO e digitado: a ancora e a palavra, e o tempo vem dela.
t('a correcao guarda a palavra, nao um tempo',
  corrigido.plan?.captions.corrections[0]?.wordId === 'w1' &&
  !('startMs' in (corrigido.plan!.captions.corrections[0] as object)));

// Corrigir de novo SUBSTITUI, nao empilha: duas correcoes para a
// mesma palavra fariam o resultado depender da ordem do array.
const duasVezes = aplicarOperacao(corrigido.plan!, {
  op: 'editar_legenda', wordId: 'w1', text: 'MAKUCHO', original: 'Makucho',
});
t('corrigir a mesma palavra de novo substitui',
  duasVezes.plan?.captions.corrections.length === 1);
t('e fica o texto mais recente',
  duasVezes.plan?.captions.corrections[0]?.text === 'MAKUCHO');
// O original e o que o WHISPER ouviu, nao a correcao anterior:
// senao corrigir duas vezes apagaria o que o audio de fato contem.
t('mas o original continua sendo o do whisper',
  duasVezes.plan?.captions.corrections[0]?.original === 'macucho');

// Palavras diferentes convivem.
const duas = aplicarOperacao(corrigido.plan!, {
  op: 'editar_legenda', wordId: 'w2', text: 'CNPJ', original: 'cinpege',
});
t('correcoes de palavras diferentes convivem',
  duas.plan?.captions.corrections.length === 2);

// Correcao igual ao original nao e correcao.
t('correcao identica ao original e recusada',
  !aplicarOperacao(plano, {
    op: 'editar_legenda', wordId: 'w1', text: 'macucho', original: 'macucho',
  }).ok);

// ---------- Desfazer ----------
const desfeito = aplicarOperacao(corrigido.plan!, {
  op: 'desfazer_correcao', wordId: 'w1',
});
t('desfazer remove a correcao', desfeito.ok && desfeito.plan?.captions.corrections.length === 0);
t('desfazer o que nao foi corrigido e recusado',
  !aplicarOperacao(plano, { op: 'desfazer_correcao', wordId: 'w9' }).ok);

// ---------- A correcao sobrevive a outras operacoes ----------
//
// E a razao de a ancora ser a palavra e nao um tempo: um ajuste de
// corte move a fala, e uma correcao ancorada em tempo passaria a
// legendar outra palavra.
const depoisDeCortar = aplicarOperacao(corrigido.plan!, {
  op: 'ajustar_corte', clipId: 'c1', sourceStartMs: 139_000, sourceEndMs: 143_000,
});
t('a correcao sobrevive a um ajuste de corte',
  depoisDeCortar.plan?.captions.corrections[0]?.text === 'Makucho');

const depoisDeReordenar = aplicarOperacao(corrigido.plan!, {
  op: 'reordenar', clipIds: ['c2', 'c1', 'c3'],
});
t('e sobrevive a uma reordenacao',
  depoisDeReordenar.plan?.captions.corrections[0]?.wordId === 'w1');

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


// ---------- Dividir ----------
//
// Dividir nao cria conteudo: parte um trecho em dois, e as duas
// metades continuam apontando para o original.

const dividido = aplicarOperacao(plano, {
  op: 'dividir_clipe', clipId: 'c1', sourceMs: 141_000,
});

t('aceita dividir no meio do trecho', dividido.ok === true);
t('o video ganha um trecho na divisao', dividido.plan?.clips.length === 4);

const metadeA = dividido.plan?.clips[0];
const metadeB = dividido.plan?.clips[1];

t('a primeira metade termina no ponto do corte',
  metadeA?.sourceEndMs === 141_000);
t('a segunda metade comeca no ponto do corte',
  metadeB?.sourceStartMs === 141_000);
t('a segunda metade termina onde o trecho terminava',
  metadeB?.sourceEndMs === 144_900);
t('as duas metades herdam a funcao narrativa',
  metadeA?.role === 'hook' && metadeB?.role === 'hook');
t('as duas metades mantem a origem na transcricao',
  (metadeB?.transcriptSegmentIds.length ?? 0) > 0);
t('a divisao nao muda a duracao total',
  dividido.plan ? duracaoDoPlano(dividido.plan) === 17_400 : false);
t('a timeline e recomposta sem buraco apos dividir',
  metadeB?.timelineStartMs === (metadeA?.sourceEndMs ?? 0) - (metadeA?.sourceStartMs ?? 0));

// Um fragmento de meio segundo nao da para ouvir nem selecionar.
const divisaoNaBorda = aplicarOperacao(plano, {
  op: 'dividir_clipe', clipId: 'c1', sourceMs: 138_300,
});
t('RECUSA divisao colada na borda', divisaoNaBorda.ok === false);
t('o erro da divisao explica o motivo',
  (divisaoNaBorda.erro ?? '').includes('perto demais'));

const divisaoForaDoClipe = aplicarOperacao(plano, {
  op: 'dividir_clipe', clipId: 'c1', sourceMs: 300_000,
});
t('RECUSA divisao fora do trecho', divisaoForaDoClipe.ok === false);

t('RECUSA dividir clipe inexistente',
  aplicarOperacao(plano, {
    op: 'dividir_clipe', clipId: 'nao-existe', sourceMs: 141_000,
  }).ok === false);

// ---------- Duplicar ----------

const duplicado = aplicarOperacao(plano, { op: 'duplicar_clipe', clipId: 'c2' });

t('aceita duplicar', duplicado.ok === true);
t('o video ganha um trecho na duplicacao', duplicado.plan?.clips.length === 4);
t('a copia fica logo depois do original',
  duplicado.plan?.clips[2]?.sourceStartMs === 271_100);
t('a copia aponta para o mesmo trecho da gravacao',
  duplicado.plan?.clips[1]?.sourceStartMs === duplicado.plan?.clips[2]?.sourceStartMs);
t('a copia recebe id proprio',
  duplicado.plan?.clips[1]?.id !== duplicado.plan?.clips[2]?.id);
t('duplicar aumenta a duracao total',
  duplicado.plan ? duracaoDoPlano(duplicado.plan) === 17_400 + 6_500 : false);
t('a duracao alvo acompanha a duplicacao',
  duplicado.plan?.targetDurationMs === 23_900);

t('RECUSA duplicar clipe inexistente',
  aplicarOperacao(plano, { op: 'duplicar_clipe', clipId: 'nao-existe' }).ok === false);

// As duas operacoes passam pelo mesmo schema das demais.
t('dividir e uma operacao valida',
  timelineOperationSchema.safeParse({
    op: 'dividir_clipe', clipId: 'c1', sourceMs: 141_000,
  }).success);
t('duplicar e uma operacao valida',
  timelineOperationSchema.safeParse({
    op: 'duplicar_clipe', clipId: 'c1',
  }).success);
console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
