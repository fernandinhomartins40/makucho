// ============================================================
// Os WAVs da prévia dos efeitos sonoros embutidos, com a MESMA receita
// que o render usa (contracts/sons.ts).
//
// Uso: node scripts/gerar-sons.mjs > sons.sh e rode o script onde houver
// FFmpeg, com a pasta public/sons montada em /out. Ex.:
//   docker run --rm -v "<repo>/studio/apps/web/public/sons:/out" <imagem com ffmpeg> sh -c "$(cat sons.sh)"
// ============================================================

import { createRequire } from 'node:module';

const requerer = createRequire(import.meta.url);
const { SONS_EMBUTIDOS } = requerer('../../../packages/contracts/dist/index.js');

const linhas = ['set -e'];
for (const s of SONS_EMBUTIDOS) {
  linhas.push(`ffmpeg -v error -y -f lavfi -i "${s.receita}" -ac 1 -ar 44100 -c:a pcm_s16le /out/${s.id}.wav`);
}
console.log(linhas.join('\n'));
