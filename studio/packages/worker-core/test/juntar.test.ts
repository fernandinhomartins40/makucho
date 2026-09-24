// ============================================================
// Juntar várias partes num original só: os argumentos do FFmpeg.
// ============================================================

import { argumentosDeJuntar, juncaoConfere, listaDeConcat, podeCopiar, quadroDaJuncao } from '../src/juntar';
import type { ParteParaJuntar } from '../src/juntar';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const probe = (o: Partial<ParteParaJuntar['probe']> = {}): ParteParaJuntar['probe'] => ({
  durationMs: 10_000,
  widthPx: 1080,
  heightPx: 1920,
  fps: 30,
  videoCodec: 'h264',
  audioCodec: 'aac',
  sizeBytes: 1000,
  audioSampleRate: 48000,
  audioChannels: 2,
  pixFmt: 'yuv420p',
  rotacao: 0,
  ...o,
});

const iguais: ParteParaJuntar[] = [
  { caminho: '/s/a.mp4', probe: probe() },
  { caminho: '/s/b.mp4', probe: probe({ durationMs: 5000 }) },
];

t('partes iguais do mesmo celular são coladas por cópia', podeCopiar(iguais));

// O caso do WhatsApp: tudo igual, menos o áudio.
const audioDiferente = (o: Partial<ParteParaJuntar['probe']>) => [
  { caminho: '/s/a.mp4', probe: probe() },
  { caminho: '/s/b.mp4', probe: probe(o) },
];
t('taxa de amostragem diferente: normaliza (senão o áudio da 2ª parte quebra)', !podeCopiar(audioDiferente({ audioSampleRate: 44100 })));
t('canais diferentes: normaliza', !podeCopiar(audioDiferente({ audioChannels: 1 })));
t('taxa de amostragem desconhecida: normaliza', !podeCopiar(audioDiferente({ audioSampleRate: undefined })));
t('rotação diferente: normaliza', !podeCopiar(audioDiferente({ rotacao: 90 })));
t('formato de pixel diferente: normaliza', !podeCopiar(audioDiferente({ pixFmt: 'yuvj420p' })));
t('forçar normalização ignora a cópia', argumentosDeJuntar(iguais, '/o.mp4', '/l.txt', { forcarNormalizacao: true }).includes('-filter_complex'));
t('junção com a duração das partes confere', juncaoConfere(iguais, 15_050));
t('junção 2 s mais longa (timestamps quebrados) não confere', !juncaoConfere(iguais, 17_100));
const copia = argumentosDeJuntar(iguais, '/o.mp4', '/l.txt');
t('cópia usa o demuxer de concat sem recodificar', copia.includes('concat') && copia.includes('copy') && !copia.includes('libx264'));
t('a lista escapa aspas simples', listaDeConcat([{ caminho: "/s/it's.mp4", probe: probe() }]).includes(String.raw`'\''`));

const diferentes: ParteParaJuntar[] = [
  { caminho: '/s/a.mp4', probe: probe() },
  { caminho: '/s/b.webm', probe: probe({ widthPx: 1280, heightPx: 720, videoCodec: 'vp8', audioCodec: 'opus' }) },
  { caminho: '/s/c.mp4', probe: probe({ audioCodec: null, durationMs: 4000 }) },
];
t('partes diferentes não são coladas por cópia', !podeCopiar(diferentes));
const args = argumentosDeJuntar(diferentes, '/o.mp4', '/l.txt');
const f = args[args.indexOf('-filter_complex') + 1]!;
t('todas as partes viram o quadro da maior, sem esticar', (f.match(/scale=1080:1920:force_original_aspect_ratio=decrease/g) ?? []).length === 3);
t(
  'uma webcam pequena no começo não rebaixa o vídeo maior',
  quadroDaJuncao([
    { caminho: '/w.webm', probe: probe({ widthPx: 640, heightPx: 480 }) },
    { caminho: '/c.mp4', probe: probe({ widthPx: 1280, heightPx: 720 }) },
  ]).w === 1280,
);
t('todas a 30 fps', (f.match(/fps=30/g) ?? []).length === 3);
t('parte sem áudio ganha silêncio do tamanho dela', f.includes('anullsrc=r=48000:cl=stereo,atrim=0:4.000'));
t('as três entram no concat, na ordem', f.includes('[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1'));
t('recodifica em CRF 18 (é a fonte do render)', args[args.indexOf('-crf') + 1] === '18');
t('WebM nunca vai por cópia', !podeCopiar([{ caminho: '/a.webm', probe: probe() }, { caminho: '/b.webm', probe: probe() }]));
t('quadro 4K vira no máximo 1920 no lado maior', quadroDaJuncao([{ caminho: '/a.mp4', probe: probe({ widthPx: 2160, heightPx: 3840 }) }]).h === 1920);

let recusou = false;
try {
  argumentosDeJuntar([{ caminho: '/a.mp4', probe: probe() }, { caminho: '/b.mp4', probe: probe({ audioCodec: null, durationMs: 0 }) }], '/o', '/l');
} catch {
  recusou = true;
}
t('parte sem áudio e sem duração é recusada com motivo', recusou);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
