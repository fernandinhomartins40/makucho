import {
  configuracaoDaRegua,
  ehPosicaoDeRotulo,
  formatarRotulo,
  msParaPx,
  pxParaMs,
  alinharAoFrame,
  PIXELS_POR_SEGUNDO_BASE,
} from '../src/components/timeline/ruler-utils';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ============================================================
// Escala da régua (logica portada do OpenCut)
// ============================================================

// Zoom baixo: marcacoes esparsas, senao viram um borrao.
const longe = configuracaoDaRegua(0.25);
t('zoom baixo usa intervalos largos', longe.intervaloRotuloSegundos >= 5);

// Zoom alto: marcacoes finas, ate o nivel de frame.
const perto = configuracaoDaRegua(8);
t('zoom alto usa intervalos finos', perto.intervaloRotuloSegundos < 1);

// O tick PRECISA dividir o rotulo de forma exata, senao o rotulo
// aparece entre duas marcacoes -- visualmente errado.
for (const zoom of [0.25, 0.5, 1, 2, 4, 8]) {
  const c = configuracaoDaRegua(zoom);
  const razao = c.intervaloRotuloSegundos / c.intervaloTickSegundos;
  t(
    `zoom ${zoom}: tick divide o rotulo exatamente`,
    Math.abs(razao - Math.round(razao)) < 0.001,
  );
}

// Espacamento minimo para o rotulo continuar legivel.
for (const zoom of [0.25, 1, 8]) {
  const c = configuracaoDaRegua(zoom);
  const espacoPx = c.intervaloRotuloSegundos * PIXELS_POR_SEGUNDO_BASE * zoom;
  t(`zoom ${zoom}: rotulos nao se sobrepoem`, espacoPx >= 100);
}

// ============================================================
// Rótulos
// ============================================================

t('segundo cheio vira MM:SS', formatarRotulo(90) === '01:30');
t('zero vira 00:00', formatarRotulo(0) === '00:00');
t('acima de uma hora inclui a hora', formatarRotulo(3661) === '1:01:01');

// Entre segundos, mostra o frame -- e o nivel de precisao que o
// corte usa.
t('entre segundos mostra o frame', formatarRotulo(1.5, 30) === '15f');

t('detecta posicao de rotulo', ehPosicaoDeRotulo(10, 5));
t('detecta posicao sem rotulo', !ehPosicaoDeRotulo(7, 5));

// ============================================================
// Conversão tempo <-> pixel
// ============================================================

t('1 segundo no zoom 1 sao 50px', msParaPx(1000, 1) === PIXELS_POR_SEGUNDO_BASE);
t('o zoom multiplica a largura', msParaPx(1000, 2) === PIXELS_POR_SEGUNDO_BASE * 2);
t('a conversao e reversivel', pxParaMs(msParaPx(5000, 2), 2) === 5000);
t('zero continua zero', msParaPx(0, 1) === 0);

// ============================================================
// Alinhamento ao frame
// ============================================================

// Arrastar produz posicao em pixel, que vira tempo fracionario. Um
// corte entre frames nao existe: o FFmpeg arredonda de qualquer
// jeito, e melhor a interface ja mostrar onde o corte vai cair.
// 1000ms nao cai num frame exato a 30fps (33,333ms cada): o frame 30
// fica em 999,99. O resultado e inteiro para caber no EditPlan.
t('alinha ao frame mais proximo', alinharAoFrame(1000, 30) === 1000);
t('devolve sempre inteiro',
  Number.isInteger(alinharAoFrame(1234, 30)) && Number.isInteger(alinharAoFrame(567, 30)));
t('arredonda para o frame de cima', Math.round(alinharAoFrame(1020, 30)) === 1033);
t('arredonda para o frame de baixo', Math.round(alinharAoFrame(1010, 30)) === 1000);
t('a 30fps o frame dura 33ms', Math.round(alinharAoFrame(33, 30)) === 33);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
