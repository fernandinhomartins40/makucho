// ============================================================
// O projeto SINTÉTICO do teste no Safari do iPhone (simulador).
//
// O repositório é público: nada de vídeo, fala ou plano de cliente aqui.
// O plano é montado pelo próprio Studio (composicaoDoPreset), com duas
// animações prontas, legenda e uma fala inventada; o vídeo é gerado no CI
// (ffmpeg testsrc). O que importa é o caminho do editor ser o mesmo.
// ============================================================

// O pacote de contratos compilado (o pnpm não o expõe fora do workspace).
import contratos from '../../packages/contracts/dist/index.js';

const { composicaoDoPreset } = contratos;

export const ID = 'projeto-teste-ios';
const DURACAO_MS = 12_000;

const frase = 'A oportunidade passa e você não está preparado então faça hoje o que tem que ser feito';
const palavras = frase.split(' ').map((texto, i) => ({ id: `w${i}`, startMs: 300 + i * 600, endMs: 300 + i * 600 + 500, texto, confianca: 0.9 }));

const alerta = composicaoDoPreset({ preset: 'alerta', textos: { kicker: 'ATENÇÃO', titulo: 'A OPORTUNIDADE PASSA', detalhe: 'E você não está preparado' }, layout: 'meio_a_meio', lado: 'baixo' }, 'mg-neon', 4, []);
const impacto = composicaoDoPreset({ preset: 'impacto', textos: { titulo: 'FAÇA HOJE' }, layout: 'cartao' }, 'mg-neon', 3, []);

export const plano = {
  schemaVersion: '1.0',
  projectId: ID,
  sourceMediaId: 'midia-teste',
  sourceDurationMs: DURACAO_MS,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: DURACAO_MS,
  framework: 'authority_education',
  clips: [
    { id: 'clip-1', sourceStartMs: 0, sourceEndMs: 6000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'teste' },
    { id: 'clip-2', sourceStartMs: 6000, sourceEndMs: 12_000, timelineStartMs: 6000, role: 'cta', transcriptSegmentIds: ['s2'], semanticRisk: 'low', reason: 'teste' },
  ],
  captions: { enabled: true, styleId: 'hormozi', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  screenEffects: [],
  mediaLayers: [
    { id: 'anim-alerta', assetId: 'html', kind: 'html', timelineStartMs: 1000, durationMs: 4000, layout: 'tela_cheia', composicao: alerta },
    { id: 'anim-impacto', assetId: 'html', kind: 'html', timelineStartMs: 7000, durationMs: 3000, layout: 'tela_cheia', composicao: impacto },
  ],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
};

const agora = new Date().toISOString();
export const projeto = {
  id: ID,
  title: 'Teste no iPhone',
  state: 'USER_EDITING',
  objective: null,
  framework: null,
  targetDurationMs: null,
  publicError: null,
  createdAt: agora,
  updatedAt: agora,
  script: null,
  mediaSources: [
    { id: 'midia-teste', kind: 'ORIGINAL', durationMs: DURACAO_MS, widthPx: 480, heightPx: 848, createdAt: agora },
    { id: 'proxy-teste', kind: 'PROXY', durationMs: DURACAO_MS, widthPx: 480, heightPx: 848, createdAt: agora },
  ],
  editPlans: [{ id: 'plano-teste', version: 1, createdAt: agora }],
  animationNote: null,
};

export const versao = { id: 'plano-teste', version: 1, origin: 'ai', createdAt: agora, document: plano };

export const transcricao = {
  existe: true,
  idioma: 'pt',
  segmentos: [
    { id: 's1', startMs: 0, endMs: 6000, texto: palavras.slice(0, 10).map((p) => p.texto).join(' '), palavras: palavras.slice(0, 10) },
    { id: 's2', startMs: 6000, endMs: 12_000, texto: palavras.slice(10).map((p) => p.texto).join(' '), palavras: palavras.slice(10) },
  ],
};
