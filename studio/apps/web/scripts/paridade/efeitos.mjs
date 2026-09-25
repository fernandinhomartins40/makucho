// Referências do FFmpeg para os efeitos de tela (banco de paridade).
// Uso: node efeitos.mjs <pasta>  ->  <pasta>/efeitos/*.txt e <pasta>/efeitos.sh
// Cada efeito vale do quadro 3 ao 17 de um vídeo de 24 quadros feito com
// A.png; o script salva os quadros 5, 10 e 16 (j = 2, 7 e 13 no efeito).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerer = createRequire(import.meta.url);
const { EFEITOS_DE_TELA } = requerer('../../../../packages/contracts/dist/index.js');
const { filtroDoEfeitoDeTela } = requerer('../../../../packages/worker-core/dist/render.js');
const pasta = resolve(process.argv[2] ?? '.');
export const QUADROS_DO_EFEITO = [5, 10, 16];
mkdirSync(join(pasta, 'efeitos'), { recursive: true });
const linhas = ['set -e', 'cd /d'];
for (const def of EFEITOS_DE_TELA) {
  const e = { id: 'e1', type: def.id, timelineStartMs: 100, durationMs: 500, intensity: def.id.startsWith('iris') ? 1 : 0.8 };
  // Os efeitos de fundo usam uma máscara sintética (mascara.png, 256x256),
  // a mesma que a prévia recebe: compara-se a mistura, não o modelo.
  const pessoa = def.usaPessoa === true;
  const partes = filtroDoEfeitoDeTela(e, 'base', 'fx', 24, 1080, 1920, pessoa ? 'masc' : undefined);
  const grafo = [
    `[0:v]fps=30,format=yuv420p,trim=end_frame=24,setpts=N/(30*TB)[base]`,
    ...(pessoa ? ['[1:v]format=gray,scale=1080:1920:flags=bicubic,loop=loop=23:size=1:start=0,setpts=N/(30*TB)[masc]'] : []),
    ...partes,
    `[fx]select='${QUADROS_DO_EFEITO.map((q) => `eq(n,${q})`).join('+')}'[saida]`,
  ].join(';\n');
  writeFileSync(join(pasta, 'efeitos', `${def.id}.txt`), grafo);
  linhas.push(
    `ffmpeg -v error -y -loop 1 -framerate 30 -t 1 -i A.png ${pessoa ? '-i mascara.png ' : ''}-filter_complex_script efeitos/${def.id}.txt -map [saida] -fps_mode passthrough -start_number 0 efeitos/${def.id}-%d.png`,
  );
}
writeFileSync(join(pasta, 'efeitos.sh'), `${linhas.join('\n')}\n`);
console.log(`${EFEITOS_DE_TELA.length} efeitos em ${join(pasta, 'efeitos')}`);
