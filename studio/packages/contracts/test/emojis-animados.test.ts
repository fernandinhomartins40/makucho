// ============================================================
// Emojis animados: a célula do quadro (a mesma conta do render) e a busca.
// ============================================================

import { buscarEmojisAnimados, caractereDoEmoji, emojisDoCatalogoDoGoogle, linhasDoSprite, proporcaoDoQuadro, quadroDoSprite, recorteDoSprite, spriteDaMidiaSchema } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const s = { quadros: 33, colunas: 6, fps: 33 };
t('33 quadros em 6 colunas: 6 linhas', linhasDoSprite(s) === 6);
t('quadro 0: primeira célula', JSON.stringify(quadroDoSprite(s, 0)) === '{"coluna":0,"linha":0}');
// n=10 a 30 fps com a animação a 33 fps: floor(10*33/30) = 11 -> coluna 5, linha 1.
t('quadro 10 do vídeo: o 11º da animação', JSON.stringify(quadroDoSprite(s, 10)) === '{"coluna":5,"linha":1}');
t('em loop: volta ao começo depois do último', JSON.stringify(quadroDoSprite(s, 30)) === JSON.stringify(quadroDoSprite({ ...s }, 0)));
const r = recorteDoSprite(s, 10);
t('recorte em frações da folha', Math.abs(r.x - 5 / 6) < 1e-9 && Math.abs(r.y - 1 / 6) < 1e-9 && Math.abs(r.w - 1 / 6) < 1e-9);
t('folha 6x6 de quadros quadrados: quadro quadrado', Math.abs(proporcaoDoQuadro(s, 1) - 1) < 1e-9);
t('sprite com quadros demais é recusado', !spriteDaMidiaSchema.safeParse({ quadros: 999, colunas: 6, fps: 30 }).success);

const lista = emojisDoCatalogoDoGoogle({
  icons: [
    { codepoint: '1f525', categories: ['Travel and places'], tags: [':fire:'], popularity: 10 },
    { codepoint: '1f602', categories: ['Smileys and emotions'], tags: [':joy:', ':lol:', ':laughing:'], popularity: 50 },
    { codepoint: '1f44f_1f3fd', categories: ['People'], tags: [':clap:'], popularity: 5 },
  ],
});
t('variações de tom de pele ficam de fora', lista.length === 2);
t('"risada" acha o emoji chorando de rir', buscarEmojisAnimados(lista, 'risada')[0]?.codigo === '1f602');
t('"fogo" acha o fogo', buscarEmojisAnimados(lista, 'fogo')[0]?.codigo === '1f525');
t('caractere do emoji', caractereDoEmoji('1f525') === '🔥');

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
