// ============================================================
// Busca de mídia sem IA: português -> inglês por glossário.
// ============================================================

import { traduzirBusca } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

t('verbo flexionado e número por extenso', traduzirBusca('consigamos controlar três').consulta === 'control three');
t('plural e acento', traduzirBusca('Promoção de cerveja gelada').termos.includes('beer') && traduzirBusca('Promoção de cerveja gelada').termos.includes('sale'));
t('inglês passa como está', traduzirBusca('money rocket').consulta === 'money rocket');
t('palavra portuguesa sem tradução sai', !traduzirBusca('as pessoas avaliam nossas atitudes').termos.includes('avaliam'));
t('diminutivo', traduzirBusca('salgadinhos').termos.includes('chips'));
t('marca fica, número solto sai', traduzirBusca('Heineken 3 por 10').consulta === 'heineken');
t('nada traduzível: vai como digitado', traduzirBusca('xyzabc').consulta === 'xyzabc');
t('só palavras vazias: vai como digitado', traduzirBusca('que isso aqui').traduziu === false);

console.log(`\n${ok} ok, ${fail} falhas`);
if (fail) process.exit(1);
