// ============================================================
// Cenas animadas: a divisão do meio a meio (a mesma conta no render e na
// prévia), a duração sugerida e o desenho de cada modelo pronto.
// ============================================================

import { MODELOS_DE_CENA, cenaAnimadaSchema, desenharCena, divisaoDaCena, divisaoNoInstante, duracaoSugeridaDaCena, type Contexto2D } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const d = divisaoDaCena({ layout: 'meio_a_meio', divisao: 0.5, foco: 0.4 });
t('meio a meio: vídeo na metade de baixo, com o rosto (y0 = 0,15)', d !== null && d.a === 0.5 && d.h === 0.5 && Math.abs(d.y0 - 0.15) < 1e-9);
const baixo = divisaoDaCena({ layout: 'meio_a_meio', divisao: 0.4, lado: 'baixo', foco: 0.9 });
t('animação embaixo: vídeo em cima, recorte preso na base', baixo !== null && baixo.a === 0 && Math.abs(baixo.y0 - 0.4) < 1e-9);
t('cartão e tela cheia não deslocam o vídeo', divisaoDaCena({ layout: 'cartao' }) === null && divisaoDaCena({ layout: 'tela_cheia' }) === null);

const camada = (id: string, ini: number, dur: number, layout: 'meio_a_meio' | 'cartao') => ({
  id, assetId: 'cena', kind: 'cena' as const, timelineStartMs: ini, durationMs: dur, layout: 'tela_cheia' as const,
  cena: { layout, blocos: [{ tipo: 'texto' as const, texto: 'x', emMs: 0 }] },
});
t('divisão no instante: só dentro da cena meio a meio', divisaoNoInstante([camada('a', 1000, 2000, 'meio_a_meio')], 1500) !== null && divisaoNoInstante([camada('a', 1000, 2000, 'meio_a_meio')], 3100) === null);
t('cena cartão no instante não divide', divisaoNoInstante([camada('b', 0, 5000, 'cartao')], 100) === null);

t('duração sugerida: o último instante marcado + respiro', duracaoSugeridaDaCena(cenaAnimadaSchema.parse({ layout: 'cartao', blocos: [{ tipo: 'texto', texto: 'x', emMs: 3000 }] })) === 4800);
t('cena sem bloco é recusada', !cenaAnimadaSchema.safeParse({ layout: 'cartao', blocos: [] }).success);
t('bloco desconhecido é recusado', !cenaAnimadaSchema.safeParse({ layout: 'cartao', blocos: [{ tipo: 'foguete' }] }).success);

// Um contexto de mentira que só conta as chamadas: cada modelo desenha do começo ao fim sem erro.
const chamadas = { texto: 0, preencher: 0 };
const falso = new Proxy({} as Record<string, unknown>, {
  get(alvo, nome) {
    if (nome in alvo) return alvo[nome as string];
    if (nome === 'measureText') return (s: string) => ({ width: s.length * 10 });
    if (nome === 'createLinearGradient' || nome === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
    if (nome === 'fillText') return () => { chamadas.texto += 1; };
    if (nome === 'fill' || nome === 'fillRect') return () => { chamadas.preencher += 1; };
    return () => undefined;
  },
  set(alvo, nome, v) {
    alvo[nome as string] = v;
    return true;
  },
}) as unknown as Contexto2D;
let erros = 0;
for (const m of MODELOS_DE_CENA) {
  for (const tMs of [0, 500, 1500, 3000, 6000]) {
    try {
      desenharCena(falso, m.cena, tMs, 1080, 1920);
    } catch {
      erros += 1;
    }
  }
}
t(`os ${MODELOS_DE_CENA.length} modelos desenham em qualquer instante, sem erro`, erros === 0 && chamadas.texto > 50 && chamadas.preencher > 100);

console.log(`
${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
