// ============================================================
// A pessoa no quadro, pela máscara: cabeça, ombros e espaço livre; a luz
// e as cores pelos pixels; e as cenas de motion que se ajustam a ela.
// ============================================================

import { composicaoDoPreset, luzECores, lugarDoCartao, pessoaDaMascara, pessoaTipica, tercoDoRosto, type PessoaNoQuadro } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  if (!cond) console.log(`FALHA ${nome}`);
};

const LADO = 256;
/** Uma silhueta: cabeça redonda (centro cx, cy; raio r) e o tronco largo a partir de `ombros`. */
function silhueta(cx: number, cy: number, r: number, ombros: number, meiaLargura: number): Uint8Array {
  const m = new Uint8Array(LADO * LADO);
  for (let y = 0; y < LADO; y += 1) {
    for (let x = 0; x < LADO; x += 1) {
      const naCabeca = Math.hypot(x - cx, y - cy) <= r;
      const noPescoco = y > cy && y < ombros && Math.abs(x - cx) <= r * 0.45;
      const noTronco = y >= ombros && Math.abs(x - cx) <= meiaLargura;
      if (naCabeca || noPescoco || noTronco) m[y * LADO + x] = 255;
    }
  }
  return m;
}

// Pessoa no meio: cabeça de y 60 a 120 (de 256), ombros em 132.
{
  const p = pessoaDaMascara(silhueta(128, 90, 30, 132, 100), LADO)!;
  t('acha a pessoa', !!p);
  t('a cabeça fica no centro em x', Math.abs(p.cabeca.x - 540) <= 12);
  t('o topo da cabeça', Math.abs(p.cabeca.topo - (60 * 1920) / 256) <= 16);
  t('os ombros onde a silhueta alarga', Math.abs(p.ombros - (132 * 1920) / 256) <= 16);
  t('a largura da cabeça (diâmetro)', Math.abs(p.cabeca.largura - (61 * 1080) / 256) <= 16);
  t('as bordas do corpo', Math.abs(p.corpo.esq - (28 * 1080) / 256) <= 10 && Math.abs(p.corpo.dir - (229 * 1080) / 256) <= 10);
  t('rosto no centro do quadro (terço)', tercoDoRosto(p) === 'no_centro');
}

// Pessoa deslocada para a direita e alta no quadro.
{
  const p = pessoaDaMascara(silhueta(180, 50, 26, 86, 70), LADO)!;
  t('cabeça deslocada: x acompanha', p.cabeca.x > 700);
  t('rosto em cima', tercoDoRosto(p) === 'em_cima');
}

// Sem pessoa, ruído, e rosto de perto (sem ombros à vista).
{
  t('máscara vazia: sem pessoa', pessoaDaMascara(new Uint8Array(LADO * LADO), LADO) === null);
  const ruido = new Uint8Array(LADO * LADO);
  for (let i = 0; i < 60; i += 1) ruido[i * 997 % (LADO * LADO)] = 255;
  t('pixels soltos não são pessoa', pessoaDaMascara(ruido, LADO) === null);
  t('sem pessoa: sem rosto', tercoDoRosto(null) === 'sem_rosto');
  const perto = new Uint8Array(LADO * LADO);
  for (let y = 40; y < LADO; y += 1) for (let x = 60; x < 196; x += 1) perto[y * LADO + x] = 255;
  const p = pessoaDaMascara(perto, LADO)!;
  t('rosto de perto (sem pescoço): ainda mede a cabeça', !!p && p.cabeca.base > p.cabeca.topo && p.cabeca.largura > 400);
}

// A típica: a mediana ignora o quadro em que a pessoa saiu do lugar.
{
  const a = pessoaDaMascara(silhueta(128, 90, 30, 132, 100), LADO)!;
  const fora = pessoaDaMascara(silhueta(60, 150, 30, 190, 50), LADO)!;
  const tipica = pessoaTipica([a, a, fora, null])!;
  t('a mediana fica com a posição da maioria', tipica.cabeca.x === a.cabeca.x && tipica.ombros === a.ombros);
  t('sem nenhuma medida: sem típica', pessoaTipica([null, undefined]) === null);
}

// A luz e as cores.
{
  const img = (pixels: Array<[number, number, number, number]>) => {
    const total = pixels.reduce((s, p) => s + p[3], 0);
    const b = new Uint8Array(total * 3);
    let i = 0;
    for (const [r, g, bl, n] of pixels) for (let k = 0; k < n; k += 1) (b[i++] = r), (b[i++] = g), (b[i++] = bl);
    return b;
  };
  const escura = luzECores(img([[10, 8, 20, 700], [200, 60, 180, 200], [240, 170, 140, 100]]));
  t('imagem escura', escura.luz === 'escura');
  t('as cores vêm da que ocupa mais para a que ocupa menos', escura.cores.length === 3 && escura.cores[0] === '#0a0814' && escura.cores[1] === '#c83cb4');
  t('imagem clara', luzECores(img([[240, 240, 235, 900], [40, 40, 40, 100]])).luz === 'clara');
  const parecidas = luzECores(img([[100, 100, 100, 500], [110, 104, 100, 400], [250, 0, 0, 100]]));
  t('tons vizinhos não se repetem', parecidas.cores.length === 2);
  t('imagem vazia: neutra', luzECores(new Uint8Array(0)).luz === 'media');
}

// Onde o cartão cabe.
{
  const base: PessoaNoQuadro = { cabeca: { x: 540, topo: 700, base: 1000, largura: 300 }, ombros: 1000, corpo: { esq: 200, dir: 880 } };
  const acima = lugarDoCartao(base)!;
  t('cabeça baixa: o cartão vai acima dela', acima.topo === 192 && acima.topo + acima.altura <= 700 - 40);
  const alta: PessoaNoQuadro = { ...base, cabeca: { x: 540, topo: 260, base: 620, largura: 300 }, ombros: 620 };
  const abaixo = lugarDoCartao(alta)!;
  t('cabeça alta: o cartão vai entre o rosto e a legenda', abaixo.topo >= 860 && abaixo.topo + abaixo.altura <= 1176);
  const perto: PessoaNoQuadro = { ...base, cabeca: { x: 540, topo: 290, base: 975, largura: 480 }, ombros: 975 };
  t('pessoa de perto: sem lugar para o cartão', lugarDoCartao(perto) === null);
}

// As cenas de motion se ajustam à pessoa.
{
  const p: PessoaNoQuadro = { cabeca: { x: 540, topo: 620, base: 900, largura: 260 }, ombros: 900, corpo: { esq: 180, dir: 900 } };
  const cena = (preset: string, textos: Record<string, unknown>, pessoa?: PessoaNoQuadro, layout = 'cartao') =>
    composicaoDoPreset({ preset, textos: textos as never, layout: layout as 'cartao' }, 'mg-soco', 5, [], pessoa ? { pessoa } : {});
  const semMedida = cena('ladeando', { icones: ['raio', 'alvo'] });
  const comMedida = cena('ladeando', { icones: ['raio', 'alvo'] }, p);
  t('sem medida: o lugar padrão', semMedida.html.includes('top:400px'));
  t('ícones ao lado do rosto: na altura dele', comMedida.html.includes(`top:${(620 + 900) / 2 - 130}px`));
  const larga: PessoaNoQuadro = { ...p, cabeca: { ...p.cabeca, largura: 700 } };
  t('cabeça que ocupa o quadro: os ícones encolhem', cena('ladeando', { icones: ['raio', 'alvo'] }, larga).html.includes('scale:0.6'));
  t('título gigante: começa acima do cabelo', cena('cartaz', { titulo: 'Editor' }, p).html.includes(`top:${620 - 190}px`));
  t('texto 3D: logo abaixo dos ombros', cena('profundidade', { titulo: 'Longe' }, p).html.includes(`top:${900 + 50}px`) || cena('profundidade', { titulo: 'Longe' }, p).html.includes('top:950px'));
  const moldura = cena('selecao', { titulo: 'RAW' }, p).html;
  t('moldura: em volta do corpo medido', moldura.includes(`x="${180 - 40}"`) && moldura.includes(`y="${620 - 70}"`));
  const contador = cena('contador', { numero: '87', titulo: 'por cento' }, p);
  t('cartão sobre o vídeo: acima da cabeça, fora do rosto', /\.mg:not\(\.mg-quadro\)[^{]*\{ top: 192px; height: \d+px; \}/.test(contador.css));
  t('sem medida, o cartão fica na área útil padrão', !cena('contador', { numero: '87', titulo: 'por cento' }).css.includes(':not(.mg-quadro)'));
  const meio = cena('contador', { numero: '87', titulo: 'por cento' }, p, 'meio_a_meio');
  t('meio a meio: o vídeo enquadra o rosto medido', Math.abs((meio.foco ?? 0) - 760 / 1920) < 0.01);
  t('meio a meio sem medida: sem foco', cena('contador', { numero: '87', titulo: 'por cento' }, undefined, 'meio_a_meio').foco === undefined);
}

console.log(`${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
