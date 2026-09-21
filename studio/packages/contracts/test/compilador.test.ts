import { compilarProposta, confiancaDoPlano } from '../src/index';
import type { AiProposalV1, SegmentoDaTranscricao } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const DURACAO = 60_000;

// Uma transcrição de quatro falas, cobrindo o vídeo inteiro.
const TRANSCRICAO: SegmentoDaTranscricao[] = [
  { id: 'seg-1', startMs: 0, endMs: 5000, text: 'Você perde cliente por demora?', minWordConfidence: 0.9 },
  { id: 'seg-2', startMs: 5000, endMs: 14000, text: 'A maioria das empresas responde em horas.', minWordConfidence: 0.85 },
  { id: 'seg-3', startMs: 14000, endMs: 26000, text: 'O primeiro passo é medir esse tempo.', minWordConfidence: 0.88 },
  { id: 'seg-4', startMs: 40000, endMs: 52000, text: 'Comece hoje mesmo pelo seu WhatsApp.', minWordConfidence: 0.92 },
];

const proposta = (segments: AiProposalV1['segments']): AiProposalV1 => ({
  schemaVersion: '1.0',
  framework: 'authority_education',
  targetDurationMs: 30_000,
  segments,
  warnings: [],
  missingBlocks: [],
});

const base = {
  projectId: 'proj-1',
  sourceMediaId: 'media-1',
  sourceDurationMs: DURACAO,
  segmentos: TRANSCRICAO,
};

// ============================================================
// Caminho feliz
// ============================================================

const feliz = compilarProposta({
  ...base,
  proposta: proposta([
    {
      sourceStartMs: 0,
      sourceEndMs: 5000,
      role: 'hook',
      score: 0.9,
      dependencies: [],
      reason: 'Abre com a pergunta.',
      semanticRisk: 'low',
    },
    {
      sourceStartMs: 14000,
      sourceEndMs: 26000,
      role: 'insight',
      score: 0.8,
      dependencies: [0],
      reason: 'Desenvolve o ponto.',
      semanticRisk: 'medium',
    },
  ]),
});

t('a proposta válida compila', feliz.ok);

if (feliz.ok) {
  const p = feliz.plano;

  t('o plano tem os dois clips', p.clips.length === 2);

  // A rastreabilidade é o que o produto inteiro sustenta: cada clip
  // aponta para os segmentos de transcrição que ele de fato cobre.
  t('o primeiro clip aponta para o segmento que cobre', p.clips[0]!.transcriptSegmentIds.includes('seg-1'));
  t('o segundo clip aponta para o seu', p.clips[1]!.transcriptSegmentIds.includes('seg-3'));
  t(
    'nenhum clip fica sem origem na transcrição',
    p.clips.every((c) => c.transcriptSegmentIds.length > 0),
  );
  // O clip 2 não encosta no seg-2 (termina em 14000, o clip começa
  // em 14000): sobreposição zero não conta como cobertura.
  t('não reivindica segmento que apenas encosta', !p.clips[1]!.transcriptSegmentIds.includes('seg-2'));

  // Clips encostados: um buraco na timeline viraria quadro preto.
  t('o primeiro clip começa em zero', p.clips[0]!.timelineStartMs === 0);
  t('o segundo começa onde o primeiro termina', p.clips[1]!.timelineStartMs === 5000);

  // A duração vem da soma real, não do alvo pedido.
  t('a duração é a soma dos clips', p.targetDurationMs === 5000 + 12000);

  t('o motivo do modelo é preservado', p.clips[0]!.reason === 'Abre com a pergunta.');
  t('o risco do modelo é preservado', p.clips[1]!.semanticRisk === 'medium');

  // Decisões técnicas são do compilador, não do modelo.
  t('o canvas é vertical 1080x1920', p.canvas.width === 1080 && p.canvas.height === 1920);
  t('as legendas vêm ligadas', p.captions.enabled);
  t('o loudness é o das plataformas sociais', p.render.loudnessTargetLufs === -14);
}

// ============================================================
// O que precisa ser RECUSADO
//
// Cada caso aqui passaria no schema e produziria vídeo errado.
// ============================================================

const foraDoVideo = compilarProposta({
  ...base,
  proposta: proposta([
    {
      sourceStartMs: 70_000,
      sourceEndMs: 80_000,
      role: 'hook',
      score: 0.9,
      dependencies: [],
      reason: 'Trecho que não existe.',
      semanticRisk: 'low',
    },
  ]),
});
// O schema não conhece a duração do vídeo; só o compilador pega.
t('trecho depois do fim da gravação é recusado', !foraDoVideo.ok);
t(
  'e a mensagem diz em que minuto, não em milissegundos',
  !foraDoVideo.ok && foraDoVideo.erro.includes('1:20'),
);

// O caso mais sutil: tempos válidos, dentro do vídeo, e ainda assim
// sem fala nenhuma. Acontece quando o modelo aponta para um silêncio.
const noSilencio = compilarProposta({
  ...base,
  proposta: proposta([
    {
      sourceStartMs: 27_000,
      sourceEndMs: 39_000,
      role: 'hook',
      score: 0.9,
      dependencies: [],
      reason: 'Aponta para um trecho mudo.',
      semanticRisk: 'low',
    },
  ]),
});
t('trecho sem fala correspondente é recusado', !noSilencio.ok);
t(
  'e a mensagem explica que não há fala ali',
  !noSilencio.ok && noSilencio.erro.includes('transcrição'),
);

const semTranscricao = compilarProposta({
  ...base,
  segmentos: [],
  proposta: proposta([
    {
      sourceStartMs: 0,
      sourceEndMs: 5000,
      role: 'hook',
      score: 0.9,
      dependencies: [],
      reason: 'Sem transcrição para ancorar.',
      semanticRisk: 'low',
    },
  ]),
});
t('sem transcrição não compila', !semTranscricao.ok);

// ============================================================
// Blocos ausentes
//
// Declarar a ausência é obrigatório; preenchê-la é proibido. O que
// resta é contar para quem grava.
// ============================================================

const comFalta = compilarProposta({
  ...base,
  proposta: {
    ...proposta([
      {
        sourceStartMs: 0,
        sourceEndMs: 5000,
        role: 'hook',
        score: 0.9,
        dependencies: [],
        reason: 'Abre.',
        semanticRisk: 'low',
      },
    ]),
    missingBlocks: ['cta'],
  },
});

t('a proposta com bloco ausente ainda compila', comFalta.ok);
t(
  'e o aviso diz o que gravar',
  comFalta.ok && comFalta.avisos.some((a) => a.includes('cta') && a.includes('Grave')),
);

// ============================================================
// Confiança
//
// O número NÃO vem do modelo: é agregação de julgamentos discretos.
// ============================================================

if (feliz.ok) {
  const c = confiancaDoPlano(feliz.plano);
  // low (1.0) + medium (0.7) = 1.7 / 2 = 85%
  t('a confiança agrega os riscos dos clips', c === 85);
}

const todoAlto = compilarProposta({
  ...base,
  proposta: proposta([
    {
      sourceStartMs: 0,
      sourceEndMs: 5000,
      role: 'hook',
      score: 0.5,
      dependencies: [],
      reason: 'Risco alto.',
      semanticRisk: 'high',
    },
  ]),
});
t('risco alto derruba a confiança', todoAlto.ok && confiancaDoPlano(todoAlto.plano) === 35);

const todoBaixo = compilarProposta({
  ...base,
  proposta: proposta([
    {
      sourceStartMs: 0,
      sourceEndMs: 5000,
      role: 'hook',
      score: 0.9,
      dependencies: [],
      reason: 'Sem risco.',
      semanticRisk: 'low',
    },
  ]),
});
t('risco baixo dá confiança cheia', todoBaixo.ok && confiancaDoPlano(todoBaixo.plano) === 100);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
