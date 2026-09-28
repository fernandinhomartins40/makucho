// ============================================================
// Animações em HTML (HyperFrames): a checagem do Studio e o lint oficial
// barram o que não pode ir para o vídeo, e deixam passar o que pode.
// ============================================================

import { chaveDaAnimacao, composicaoHtmlSchema } from '@makucho/studio-contracts';
import { AnimacoesService } from '../src/modules/animacoes/animacoes.service';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const boa = composicaoHtmlSchema.parse({
  layout: 'meio_a_meio',
  html: '<div id="titulo" class="titulo">Voz feita com IA</div>',
  css: ".titulo { position: absolute; left: 60px; top: 200px; font-family: 'Inter ExtraBold'; font-size: 80px; }",
  script: "tl.fromTo('#titulo', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, 0.2);",
});

async function main() {
  const s = new AnimacoesService({} as never, {} as never, {} as never);
  t('composição boa passa pela checagem e pelo lint do HyperFrames', (await s.problemas(boa, 4000)).length === 0);

  const sorteio = await s.problemas({ ...boa, script: "tl.to('#titulo', { x: Math.random() * 100, duration: 1 }, 0);" }, 4000);
  t('Math.random é barrado (a animação sairia diferente a cada quadro)', sorteio.some((p) => p.includes('sorteio')));

  const rede = await s.problemas({ ...boa, script: "fetch('https://x.com'); tl.to('#titulo', { x: 10 }, 0);" }, 4000);
  t('rede é barrada', rede.some((p) => p.includes('rede')));

  const tag = await s.problemas({ ...boa, html: '<img src="https://x.com/a.png" onload="alert(1)">' }, 4000);
  t('evento no html e endereço de fora são barrados', tag.some((p) => p.includes('evento')) && tag.some((p) => p.includes('fora')));

  const fonte = await s.problemas({ ...boa, css: ".titulo { font-family: 'Comic Neue'; }" }, 4000);
  t('o lint oficial pega fonte sem arquivo', fonte.some((p) => p.includes('font_family_without_font_face')));

  t('a chave muda com o conteúdo e é estável', chaveDaAnimacao(boa, 4000) === chaveDaAnimacao(boa, 4000) && chaveDaAnimacao(boa, 4000) !== chaveDaAnimacao({ ...boa, html: boa.html + ' ' }, 4000));

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail) process.exit(1);
}

void main();
