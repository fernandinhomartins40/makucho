// ============================================================
// Os argumentos do render.
//
// Um filtro mal montado não falha: produz vídeo errado em silêncio —
// áudio deslocado do quadro, buraco entre os trechos, rosto
// esticado. Conferir o vetor de argumentos é mais confiável do que
// assistir ao resultado, e não precisa do binário instalado.
// ============================================================

import { montarArgumentos, duracaoDoResultado } from '../src/render';
import type { EditPlanV1 } from '@makucho/studio-contracts';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const plano: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 120_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 15_000,
  framework: 'authority_education',
  clips: [
    {
      id: 'c1',
      sourceStartMs: 10_000,
      sourceEndMs: 18_000,
      timelineStartMs: 0,
      role: 'hook',
      transcriptSegmentIds: ['s1'],
      semanticRisk: 'low',
      reason: 'Abre.',
    },
    {
      id: 'c2',
      sourceStartMs: 40_000,
      sourceEndMs: 47_000,
      timelineStartMs: 8_000,
      role: 'cta',
      transcriptSegmentIds: ['s2'],
      semanticRisk: 'low',
      reason: 'Fecha.',
    },
  ],
  captions: {
    enabled: true,
    styleId: 'padrao',
    wordsPerBlock: 3,
    position: 'bottom',
    highlightActiveWord: true,
  },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: {
    fps: 30,
    videoCodec: 'h264',
    audioCodec: 'aac',
    crf: 23,
    audioBitrateKbps: 128,
    loudnessTargetLufs: -14,
  },
};

const args = montarArgumentos({ entrada: '/in.mp4', saida: '/out.mp4', plano });
const filtro = args[args.indexOf('-filter_complex') + 1]!;

// ============================================================
// Corte
// ============================================================

t('a entrada é o original', args.includes('/in.mp4'));
t('a saída está no vetor', args.includes('/out.mp4'));

// Os tempos vêm do plano, em segundos com três casas.
t('o primeiro clip corta de 10s a 18s', filtro.includes('trim=10.000:18.000'));
t('o segundo corta de 40s a 47s', filtro.includes('trim=40.000:47.000'));

// setpts zera o relógio de cada trecho. Sem isso o concat mantém os
// timestamps originais e o resultado fica com buracos do tamanho do
// que foi cortado entre eles.
// O `` importa: `asetpts` também contém `setpts`, e sem a borda
// o contador daria 4 e o teste passaria por engano.
t('o vídeo tem setpts em cada trecho', (filtro.match(/,setpts=PTS-STARTPTS/g) ?? []).length === 2);
// asetpts pelo mesmo motivo: sem ele o áudio entra deslocado do
// quadro, que é o defeito mais visível possível.
t('o áudio tem asetpts em cada trecho', (filtro.match(/asetpts=PTS-STARTPTS/g) ?? []).length === 2);

t('o áudio é cortado junto do vídeo', (filtro.match(/atrim=/g) ?? []).length === 2);

// ============================================================
// Formato vertical
// ============================================================

t('escala para 1080x1920', filtro.includes('scale=1080:1920'));
// decrease + pad: a imagem inteira cabe sem distorcer, e o resto é
// preenchido. Esticar o rosto de quem gravou seria pior que a borda.
t('não distorce — usa decrease', filtro.includes('force_original_aspect_ratio=decrease'));
t('preenche o resto com pad', filtro.includes('pad=1080:1920'));
t('corrige o aspecto de pixel', filtro.includes('setsar=1'));

// ============================================================
// Concatenação
// ============================================================

t('concatena os dois trechos', filtro.includes('concat=n=2:v=1:a=1'));
// O áudio sai do concat em [aconcat] e só então passa pelo
// loudnorm; o vídeo vai direto para [vsaida].
t('o concat produz vídeo e áudio', filtro.includes('[vsaida][aconcat]'));
t('e o áudio normalizado vira a saída', filtro.includes('[asaida]'));
t('a saída de vídeo é mapeada', args.includes('[vsaida]'));
t('a saída de áudio é mapeada', args.includes('[asaida]'));

// ============================================================
// Codificação
// ============================================================

// -c copy só corta em keyframe, e um corte editorial cai onde a fala
// termina. Copiar produziria clips deslocados em até vários segundos.
t('NÃO copia o stream — reencodifica', !args.includes('-c') || !args.includes('copy'));

t('o CRF vem do plano', args[args.indexOf('-crf') + 1] === '23');
t('o bitrate de áudio vem do plano', args[args.indexOf('-b:a') + 1] === '128k');
// yuv420p é o único formato que toca em todo lugar; sem ele o vídeo
// pode falhar só no celular de quem abre.
t('força yuv420p', args[args.indexOf('-pix_fmt') + 1] === 'yuv420p');
// O loudnorm precisa estar DENTRO do filter_complex: o FFmpeg
// recusa misturar `-af` com saída de filtro complexo, e com ele
// do lado de fora toda exportação falhava.
t('normaliza o loudness no alvo do plano', filtro.includes('loudnorm=I=-14'));
t('o loudnorm NÃO vai num -af', !args.includes('-af'));
// O entregável usa preset medium; ultrafast é do proxy, que é
// descartável.
t('usa preset medium, não ultrafast', args[args.indexOf('-preset') + 1] === 'medium');
t('permite assistir antes de baixar tudo', args.includes('+faststart'));

// ============================================================
// Clips desligados
//
// A seção 13 exige poder restaurar o que foi descartado: desligar
// não apaga, e o render precisa respeitar isso.
// ============================================================

const semC1 = montarArgumentos({
  entrada: '/in.mp4',
  saida: '/out.mp4',
  plano,
  clipsDesligados: ['c1'],
});
const filtroSemC1 = semC1[semC1.indexOf('-filter_complex') + 1]!;

t('o clip desligado não entra', !filtroSemC1.includes('trim=10.000:18.000'));
t('o que sobrou entra', filtroSemC1.includes('trim=40.000:47.000'));
// Um único trecho ainda passa pelo concat: mudar o caminho para o
// caso de um só produziria dois comportamentos para manter.
t('um trecho só ainda concatena', filtroSemC1.includes('concat=n=1'));

let recusou = false;
try {
  montarArgumentos({ entrada: '/in.mp4', saida: '/out.mp4', plano, clipsDesligados: ['c1', 'c2'] });
} catch {
  recusou = true;
}
t('desligar tudo é recusado em vez de gerar arquivo vazio', recusou);

// ============================================================
// Duração
// ============================================================

t('a duração é a soma dos trechos', duracaoDoResultado(plano) === 8000 + 7000);
t('desligar um trecho encurta o resultado', duracaoDoResultado(plano, ['c1']) === 7000);

// ============================================================
// Ordem
//
// A ordem da timeline é a ordem do resultado, mesmo que o array
// venha embaralhado.
// ============================================================

const embaralhado: EditPlanV1 = { ...plano, clips: [plano.clips[1]!, plano.clips[0]!] };
const filtroOrdenado = (() => {
  const a = montarArgumentos({ entrada: '/in.mp4', saida: '/out.mp4', plano: embaralhado });
  return a[a.indexOf('-filter_complex') + 1]!;
})();

t(
  'ordena pela timeline, não pela posição no array',
  filtroOrdenado.indexOf('trim=10.000') < filtroOrdenado.indexOf('trim=40.000'),
);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
