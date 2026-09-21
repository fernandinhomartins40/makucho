import {
  planoParaEditor,
  editorParaPlano,
  idaEVoltaPreserva,
} from '../src/index';
import type { EditPlanV1, ProjetoDoEditor } from '../src/index';

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
      role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low',
      reason: 'Frase direta com consequencia financeira',
    },
    {
      id: 'c2', sourceStartMs: 271_100, sourceEndMs: 277_600, timelineStartMs: 6_700,
      role: 'authority', transcriptSegmentIds: ['s2'], semanticRisk: 'low',
      reason: 'Demonstra experiencia recorrente',
    },
    {
      id: 'c3', sourceStartMs: 370_000, sourceEndMs: 374_200, timelineStartMs: 13_200,
      role: 'cta', transcriptSegmentIds: ['s3'], semanticRisk: 'low',
      reason: 'Fechamento com acao clara',
    },
  ],
  captions: {
    enabled: true, styleId: 'padrao', wordsPerBlock: 3,
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
// Ida: a proposta da IA chega pronta no editor
// ============================================================

const projeto = planoParaEditor(plano);

t('cria as quatro tracks', projeto.tracks.length === 4);
t('a track de video vem primeiro', projeto.tracks[0]?.type === 'video');

const trackVideo = projeto.tracks.find((tr) => tr.type === 'video');
t('todos os clipes viram elementos', trackVideo?.elements.length === 3);

// O usuario abre o editor e encontra a edicao JA FEITA -- e o que
// distingue o produto de um editor manual com timeline vazia.
t('o elemento carrega o motivo da escolha da IA',
  trackVideo?.elements[0]?.reason === 'Frase direta com consequencia financeira');

t('o elemento carrega a funcao comunicacional',
  trackVideo?.elements[0]?.role === 'hook');

// Sem a origem, o render nao saberia que pedaco do bruto usar.
t('o elemento aponta para o original',
  trackVideo?.elements[0]?.sourceStartMs === 138_200 &&
  trackVideo?.elements[0]?.sourceEndMs === 144_900);

t('a duracao do elemento bate com o recorte',
  trackVideo?.elements[0]?.durationMs === 6_700);

t('o risco semantico acompanha o elemento',
  trackVideo?.elements[0]?.semanticRisk === 'low');

// Legendas saem da transcricao no render, palavra por palavra. Um
// elemento por palavra encheria a timeline de ruido.
const trackTexto = projeto.tracks.find((tr) => tr.type === 'text');
t('a track de legendas fica vazia', trackTexto?.elements.length === 0);
t('a track de legendas fica visivel quando ativas', trackTexto?.hidden === false);

t('sem trilha, a track de audio fica vazia',
  projeto.tracks.find((tr) => tr.type === 'audio')?.elements.length === 0);

t('preserva o framework', projeto.framework === 'authority_education');
t('preserva o formato de saida', projeto.width === 1080 && projeto.height === 1920);

// ============================================================
// Volta: o que o usuário editou vira EditPlan
// ============================================================

const volta = editorParaPlano(projeto, plano);
t('a volta funciona', volta.ok);
t('preserva os tres clipes', volta.ok && volta.plan.clips.length === 3);

// Abrir e fechar sem tocar em nada nao pode mudar a edicao: seria a
// timeline se alterando sozinha aos olhos do usuario.
t('ida e volta nao perde informacao', idaEVoltaPreserva(plano));

// ============================================================
// A REGRA CENTRAL: nada de fala inventada
// ============================================================

// No editor, nada impede criar um elemento do nada -- e um editor
// manual. A ponte e onde isso e barrado.
const comElementoInventado: ProjetoDoEditor = {
  ...projeto,
  tracks: projeto.tracks.map((tr) =>
    tr.type === 'video'
      ? {
          ...tr,
          elements: [
            ...tr.elements,
            {
              id: 'inventado',
              trackId: tr.id,
              startMs: 20_000,
              durationMs: 3_000,
              // Sem sourceStartMs/sourceEndMs: nao veio da gravacao.
              enabled: true,
              label: 'trecho criado no editor',
            },
          ],
        }
      : tr,
  ),
};

const recusado = editorParaPlano(comElementoInventado, plano);
t('RECUSA trecho sem origem no video original', !recusado.ok);
t('o erro explica a regra',
  !recusado.ok && recusado.erro.includes('precisa existir na gravacao'));

// Um corte alem do fim do arquivo produziria clipe mudo e curto, sem
// erro do FFmpeg.
const alemDoFim: ProjetoDoEditor = {
  ...projeto,
  tracks: projeto.tracks.map((tr) =>
    tr.type === 'video'
      ? {
          ...tr,
          elements: [{ ...tr.elements[0]!, sourceEndMs: 500_000 }],
        }
      : tr,
  ),
};
t('RECUSA corte alem da duracao do original',
  !editorParaPlano(alemDoFim, plano).ok);

// Um EditPlan sem clipe nao renderiza nada.
const tudoDesativado: ProjetoDoEditor = {
  ...projeto,
  tracks: projeto.tracks.map((tr) =>
    tr.type === 'video'
      ? { ...tr, elements: tr.elements.map((e) => ({ ...e, enabled: false })) }
      : tr,
  ),
};
const vazio = editorParaPlano(tudoDesativado, plano);
t('RECUSA video sem nenhum trecho ativo', !vazio.ok);
t('o erro pede ao menos um trecho',
  !vazio.ok && vazio.erro.includes('ao menos um trecho'));

// ============================================================
// Edição legítima
// ============================================================

// Desativar um trecho e operacao valida: e o "remover" da interface,
// que na verdade preserva o clipe para poder restaurar.
const semOSegundo: ProjetoDoEditor = {
  ...projeto,
  tracks: projeto.tracks.map((tr) =>
    tr.type === 'video'
      ? {
          ...tr,
          elements: tr.elements.map((e) =>
            e.id === 'c2' ? { ...e, enabled: false } : e,
          ),
        }
      : tr,
  ),
};

const doisClipes = editorParaPlano(semOSegundo, plano);
t('aceita desativar um trecho', doisClipes.ok);
t('o resultado fica com dois clipes',
  doisClipes.ok && doisClipes.plan.clips.length === 2);

// Sem recompor, sobraria um buraco de 6,5s que viraria tela preta.
t('a timeline e recomposta sem buraco',
  doisClipes.ok && doisClipes.plan.clips[1]?.timelineStartMs === 6_700);

t('a duracao acompanha a remocao',
  doisClipes.ok && doisClipes.plan.targetDurationMs === 10_900);

// Encurtar pelas bordas continua apontando para o original.
const encurtado: ProjetoDoEditor = {
  ...projeto,
  tracks: projeto.tracks.map((tr) =>
    tr.type === 'video'
      ? {
          ...tr,
          elements: tr.elements.map((e) =>
            e.id === 'c1'
              ? { ...e, sourceStartMs: 139_000, sourceEndMs: 143_000, durationMs: 4_000 }
              : e,
          ),
        }
      : tr,
  ),
};

const apos = editorParaPlano(encurtado, plano);
t('aceita encurtar o trecho', apos.ok);
t('o novo corte aponta para o original',
  apos.ok && apos.plan.clips[0]?.sourceStartMs === 139_000);

// O motivo da IA sobrevive ao ajuste manual: e o que permite explicar
// a escolha depois.
t('o motivo da IA sobrevive a edicao',
  apos.ok && apos.plan.clips[0]?.reason === 'Frase direta com consequencia financeira');

// Reordenar: o CTA vira o primeiro.
const reordenado: ProjetoDoEditor = {
  ...projeto,
  tracks: projeto.tracks.map((tr) =>
    tr.type === 'video'
      ? {
          ...tr,
          elements: [
            { ...tr.elements[2]!, startMs: 0 },
            { ...tr.elements[0]!, startMs: 4_200 },
            { ...tr.elements[1]!, startMs: 10_900 },
          ],
        }
      : tr,
  ),
};

const novaOrdem = editorParaPlano(reordenado, plano);
t('aceita reordenar', novaOrdem.ok);
t('a nova ordem e respeitada', novaOrdem.ok && novaOrdem.plan.clips[0]?.id === 'c3');
t('a recomposicao comeca no zero',
  novaOrdem.ok && novaOrdem.plan.clips[0]?.timelineStartMs === 0);

// ============================================================
// Legendas e trilha
// ============================================================

const semLegenda: ProjetoDoEditor = {
  ...projeto,
  tracks: projeto.tracks.map((tr) =>
    tr.type === 'text' ? { ...tr, hidden: true } : tr,
  ),
};
t('esconder a track desliga as legendas',
  editorParaPlano(semLegenda, plano).ok &&
  editorParaPlano(semLegenda, plano).plan?.captions.enabled === false);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
