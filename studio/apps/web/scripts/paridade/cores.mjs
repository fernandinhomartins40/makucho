// Gera os .cube das cores do banco de paridade (os mesmos de entrada.ts)
// e o script que passa A.png e B.png no lut3d do FFmpeg.
// Uso: node cores.mjs <pasta>  ->  <pasta>/cor/*.cube e <pasta>/cor.sh
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerer = createRequire(import.meta.url);
const { APARENCIAS, cubeDaCor } = requerer('../../../../packages/contracts/dist/index.js');
const pasta = resolve(process.argv[2] ?? '.');
const cores = [
  ...APARENCIAS.map((a) => [a.id, { look: a.id }]),
  ['ajustes', { adjust: { brilho: 0.4, contraste: 0.5, saturacao: -0.4, temperatura: 0.6, tom: -0.5, realces: -0.6, sombras: 0.7 } }],
  ['misto', { look: 'cinema', intensity: 0.6, adjust: { brilho: -0.3, saturacao: 0.5 } }],
];
mkdirSync(join(pasta, 'cor'), { recursive: true });
const linhas = ['set -e', 'cd /d'];
for (const [id, cor] of cores) {
  writeFileSync(join(pasta, 'cor', `${id}.cube`), cubeDaCor(cor));
  for (const [k, img] of ['A.png', 'B.png'].entries()) {
    linhas.push(`ffmpeg -v error -y -i ${img} -vf lut3d=file=cor/${id}.cube:interp=trilinear -frames:v 1 cor/${id}-${k}.png`);
  }
}
writeFileSync(join(pasta, 'cor.sh'), `${linhas.join('\n')}\n`);
console.log(`${cores.length} cores em ${join(pasta, 'cor')}`);
