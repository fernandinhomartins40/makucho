import { gerarSlug, gerarSlugUnico, slugValido } from '../src/slug';

/**
 * Casos reais de titulos do portal. Rodar com: pnpm test
 */
const casos: Array<[string, string]> = [
  ['O que esperar da economia brasileira no segundo semestre?', 'o-que-esperar-da-economia-brasileira-no-segundo-semestre'],
  ['Política Econômica & Inflação', 'politica-economica-e-inflacao'],
  ['Reforma tributária: o que muda', 'reforma-tributaria-o-que-muda'],
  ['Ação, coração e informação', 'acao-coracao-e-informacao'],
  ['  Espaços   demais  ', 'espacos-demais'],
  ['SELIC a 10,50% a.a.', 'selic-a-10-50-porcento-a-a'],
  ['Dólar/Euro', 'dolar-euro'],
  ['---traços---', 'tracos'],
  ['Você já viu?', 'voce-ja-viu'],
];

let ok = 0;
let fail = 0;

for (const [entrada, esperado] of casos) {
  const resultado = gerarSlug(entrada);
  if (resultado === esperado) {
    ok += 1;
  } else {
    fail += 1;
    console.error(`FALHA "${entrada}"\n  obtido:   "${resultado}"\n  esperado: "${esperado}"`);
  }
}

const unico = gerarSlugUnico('economia', ['economia', 'economia-2']);
if (unico === 'economia-3') ok += 1;
else { fail += 1; console.error(`FALHA slug unico: ${unico}`); }

if (slugValido('abc-123') && !slugValido('Abc') && !slugValido('a--b')) ok += 1;
else { fail += 1; console.error('FALHA validacao de slug'); }

console.log(`slug: ${ok} passaram, ${fail} falharam`);
process.exit(fail > 0 ? 1 : 0);
