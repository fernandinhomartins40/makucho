// ============================================================
// IA adaptativa: tipo de áudio, tipo de vídeo, cenas e a montagem
// pelas cenas (vídeo sem narração).
// ============================================================

import {
  cenasDosCortes,
  classificarAudio,
  compilarMontagemVisual,
  editPlanV1Schema,
  ehAlucinacaoDoWhisper,
  lerPropostaVisual,
  montagemVisualSemIa,
  montaPelasCenas,
  tipoDeVideoPadrao,
} from '../src';
import type { CenaDoVideo } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ---------- Áudio ----------
const narrado = classificarAudio({
  duracaoMs: 60_000,
  segmentos: Array.from({ length: 12 }, (_, i) => ({ startMs: i * 5000, endMs: i * 5000 + 4000, confidence: 0.8 })),
  silencios: [],
});
t('narração contínua é "fala"', narrado.tipo === 'fala' && narrado.coberturaDeFala > 0.7);

const loja = classificarAudio({ duracaoMs: 30_000, segmentos: [{ startMs: 1000, endMs: 2000, confidence: 0.5 }], silencios: [] });
t('uma frase solta num vídeo de loja é "musica_ou_ambiente"', loja.tipo === 'musica_ou_ambiente');

const misto = classificarAudio({ duracaoMs: 30_000, segmentos: [{ startMs: 0, endMs: 3000, confidence: 0.7 }, { startMs: 20_000, endMs: 23_000, confidence: 0.7 }], silencios: [] });
t('fala em parte do vídeo é "fala_parcial"', misto.tipo === 'fala_parcial');

const mudo = classificarAudio({ duracaoMs: 20_000, segmentos: [], silencios: [{ inicioMs: 0, fimMs: 19_500 }] });
t('sem som é "mudo"', mudo.tipo === 'mudo');

const cantado = classificarAudio({
  duracaoMs: 30_000,
  segmentos: Array.from({ length: 6 }, (_, i) => ({ startMs: i * 5000, endMs: i * 5000 + 4800, confidence: 0.15 })),
  silencios: [],
});
t('letra de música (confiança baixa) não é narração', cantado.tipo !== 'fala');

t('alucinação do Whisper reconhecida', ehAlucinacaoDoWhisper('Legendas pela comunidade Amara.org') && ehAlucinacaoDoWhisper('Obrigado por assistir!'));
t('fala comum não é alucinação', !ehAlucinacaoDoWhisper('Hoje tem promoção de cerveja'));
t('montaPelasCenas só sem narração', !montaPelasCenas(narrado) && montaPelasCenas(loja) && !montaPelasCenas(null));

// ---------- Tipo de vídeo ----------
t('com fala: falando para a câmera', tipoDeVideoPadrao({ audio: narrado }) === 'fala_camera');
t('sem fala e preço no resumo: promoção', tipoDeVideoPadrao({ audio: loja, resumo: 'Heineken 3 por R$ 10' }) === 'promocao');
t('sem fala e "chegou": novidade', tipoDeVideoPadrao({ audio: loja, resumo: 'Chegou o novo sabor' }) === 'novidade');
t('sem fala, comércio: produto', tipoDeVideoPadrao({ audio: loja, ramo: 'comercio' }) === 'produto');
t('escolhido vale', tipoDeVideoPadrao({ escolhido: 'bastidores', audio: loja }) === 'bastidores');
t('"falando" escolhido sem fala vira o do ramo', tipoDeVideoPadrao({ escolhido: 'fala_camera', audio: loja, ramo: 'comercio' }) === 'produto');

// ---------- Cenas ----------
const semCorte = cenasDosCortes([], 20_000);
t('plano contínuo vira janelas', semCorte.length >= 4 && semCorte[0]!.inicioMs === 0 && semCorte.at(-1)!.fimMs === 20_000);
const comCortes = cenasDosCortes([300, 2000, 2100, 6000], 8000);
t('cortes muito próximos se juntam', comCortes.every((c) => c.fimMs - c.inicioMs >= 700));
t('cenas encostadas, sem buraco', comCortes.every((c, i) => i === 0 || c.inicioMs === comCortes[i - 1]!.fimMs));
const muitas = cenasDosCortes(Array.from({ length: 100 }, (_, i) => (i + 1) * 900), 91_000);
t('teto de cenas respeitado', muitas.length <= 40);

// ---------- Montagem ----------
const cenas: CenaDoVideo[] = cenasDosCortes([2000, 4500, 7000, 9000], 12_000).map((c, i) => ({ indice: i, ...c, ruim: i === 2 }));
const regra = montagemVisualSemIa({ cenas, tipo: 'produto', ramo: 'comercio', resumo: 'Promoção de cerveja gelada' });
t('sem IA: escolhe cenas e pula a ruim', regra.scenes.length >= 2 && !regra.scenes.some((s) => s.scene === 2));
t('sem IA: título do resumo e chamada do ramo', regra.hookTitle === 'Promoção de cerveja gelada' && regra.cta === 'Venha conferir na loja');

const lida = lerPropostaVisual(
  'Aqui está: {"scenes":[{"scene":1,"role":"hook","reason":"produto"},{"scene":3,"startMs":7200,"endMs":8500,"role":"cta","reason":"fim"}],"texts":[{"at":0,"text":"3 por R$ 10","kind":"preco"}],"hookTitle":"Só hoje","cta":"Corre pra loja"}',
);
t('lê a proposta da IA', lida.ok && lida.proposta.scenes.length === 2);

if (lida.ok) {
  const r = compilarMontagemVisual({
    proposta: lida.proposta,
    cenas,
    projectId: 'p1',
    sourceMediaId: 'm1',
    sourceDurationMs: 12_000,
    tipo: 'promocao',
    audio: loja,
    acabamento: { musicaAssetId: 'trilha1' },
  });
  t('compila um plano válido', r.ok && editPlanV1Schema.safeParse(r.plano).success);
  if (r.ok) {
    t('trechos de cena, sem fala', r.plano.clips.every((c) => c.origin === 'cena' && c.transcriptSegmentIds.length === 0));
    t('recorte dentro da cena respeitado', r.plano.clips[1]!.sourceStartMs === 7200 && r.plano.clips[1]!.sourceEndMs === 8500);
    t('legenda desligada sem fala', r.plano.captions.enabled === false);
    t('texto de preço na tela', r.plano.overlays.some((o) => o.component === 'Destaque' && o.text === '3 por R$ 10'));
    t('som ambiente baixo', r.plano.clips.every((c) => (c.audio?.gainDb ?? 0) < 0 || c.audio?.muted));
    t('trilha sem abaixar para voz', r.plano.music?.duckUnderVoice === false);
  }

  const comFala = compilarMontagemVisual({
    proposta: lida.proposta,
    cenas,
    projectId: 'p1',
    sourceMediaId: 'm1',
    sourceDurationMs: 12_000,
    tipo: 'promocao',
    audio: misto,
    segmentos: [{ id: 's1', startMs: 2100, endMs: 4000, text: 'olha essa oferta', minWordConfidence: 0.9 }],
  });
  t('vídeo misto: a cena com fala aponta para a fala', comFala.ok && comFala.plano.clips[0]!.origin === 'fala' && comFala.plano.clips[0]!.transcriptSegmentIds[0] === 's1');
  t('vídeo misto: legenda ligada', comFala.ok && comFala.plano.captions.enabled);
}

// ---------- O schema ainda protege a fala ----------
const semOrigem = editPlanV1Schema.safeParse({
  schemaVersion: '1.0',
  projectId: 'p',
  sourceMediaId: 'm',
  sourceDurationMs: 10_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 2000,
  framework: 'sales',
  clips: [{ id: 'a', sourceStartMs: 0, sourceEndMs: 2000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: [], semanticRisk: 'low', reason: 'x' }],
  captions: { enabled: false, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
});
t('trecho de fala sem segmento continua recusado', !semOrigem.success);

console.log(`\n${ok} ok, ${fail} falhas`);
if (fail) process.exit(1);
