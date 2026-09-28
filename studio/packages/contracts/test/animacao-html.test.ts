// ============================================================
// Animações em HTML (HyperFrames): o documento que o Studio monta em
// volta do que a IA escreve, a área da animação e as travas.
// ============================================================

import { areaDaComposicao, chaveDaAnimacao, composicaoHtmlSchema, divisaoDaCamada, documentoDaComposicao, problemasDaComposicao } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const c = composicaoHtmlSchema.parse({ layout: 'meio_a_meio', html: '<div id="a">Oi</div>', script: "tl.from('#a', { y: 20, opacity: 0, duration: 0.3 }, 0);" });
const doc = documentoDaComposicao(c, { duracaoMs: 4000, gsap: 'gsap.min.js', fontes: '', origens: "'self'" });
t('documento: política de conteúdo sem rede', doc.includes("connect-src 'none'") && doc.includes("default-src 'none'"));
t('documento: raiz no formato do HyperFrames, com a duração', doc.includes('data-composition-id="cena"') && doc.includes('data-duration="4.000"') && doc.includes('window.__timelines["cena"] = tl'));
t('documento: uma única timeline pausada', (doc.match(/gsap\.timeline\(/g) ?? []).length === 1 && doc.includes('paused: true'));
t('documento de render não escuta mensagens de fora', !doc.includes('addEventListener'));
t('documento da prévia escuta o instante', documentoDaComposicao(c, { duracaoMs: 4000, gsap: 'g', fontes: '', origens: 'x', previa: true }).includes('hfT'));
t('script da IA não fecha a tag do documento', documentoDaComposicao({ ...c, script: "tl.to('#a',{x:1},0); // </script><script>alert(1)" }, { duracaoMs: 1000, gsap: 'g', fontes: '', origens: 'x' }).includes('<\/script>'));

t('área no meio a meio (animação em cima): metade de cima', JSON.stringify(areaDaComposicao(c)) === JSON.stringify({ x: 0, y: 0, w: 1080, h: 960 }));
t('área com a animação embaixo e 40%: a faixa de baixo', JSON.stringify(areaDaComposicao({ ...c, lado: 'baixo', divisao: 0.4 })) === JSON.stringify({ x: 0, y: 1152, w: 1080, h: 768 }));
t('cartão e tela cheia usam o quadro todo', areaDaComposicao({ ...c, layout: 'cartao' }).h === 1920);
t('a camada html desloca o vídeo no meio a meio', divisaoDaCamada({ kind: 'html', composicao: c })?.a === 0.5);

t('trava: temporizador', problemasDaComposicao({ ...c, script: "setTimeout(()=>{}, 10); tl.to('#a',{x:1},0);" }).some((p) => p.includes('temporizador')));
t('trava: acesso à página de fora', problemasDaComposicao({ ...c, script: "window.parent.document; tl.to('#a',{x:1},0);" }).some((p) => p.includes('fora')));
t('trava: @import no css', problemasDaComposicao({ ...c, css: "@import url('x.css');" }).length > 0);
t('trava: script sem usar tl', problemasDaComposicao({ ...c, script: 'var x = 1;' }).some((p) => p.includes('tl')));
t('composição boa passa', problemasDaComposicao(c).length === 0);
t('chave muda com a duração e com a cor da marca', chaveDaAnimacao(c, 4000) !== chaveDaAnimacao(c, 5000) && chaveDaAnimacao(c, 4000, '#111111') !== chaveDaAnimacao(c, 4000, '#222222'));

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
