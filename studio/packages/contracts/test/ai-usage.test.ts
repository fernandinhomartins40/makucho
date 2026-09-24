import {
  custoEmCentavos,
  estadoDoLimite,
  cabeNoLimite,
  avisoDeUso,
  periodoDe,
  situacaoDeUsoSchema,
  MODELO_POR_CHAMADA,
  CONFIG_POR_CHAMADA,
  CHAMADAS_DE_IA,
  LIMITE_MENSAL_PADRAO_CENTAVOS,
} from '../src/index';
import type { SituacaoDeUso } from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ============================================================
// Custo
//
// Aritmética de dinheiro. Um erro aqui não quebra teste nenhum em
// produção — aparece na fatura.
// ============================================================

// Preço de pico da tabela, por definição.
t('1M de tokens de entrada no Flash custa 30 centavos', custoEmCentavos('deepseek-flash', 1_000_000, 0) === 30);
t('1M de tokens de saída no Flash custa 120 centavos', custoEmCentavos('deepseek-flash', 0, 1_000_000) === 120);

// O cache de contexto: a entrada que acerta o cache custa uma fração.
t(
  'entrada em cache sai muito mais barata',
  custoEmCentavos('deepseek-flash', 1_000_000, 0, 1_000_000) === 1,
);
t(
  'cache maior que a entrada não gera custo negativo',
  custoEmCentavos('deepseek-flash', 1000, 0, 5000) >= 0,
);

// O Pro é mais caro: é o que justifica deixá-lo como opção, não padrão.
t(
  'o Pro custa mais que o Flash pelo mesmo uso',
  custoEmCentavos('deepseek-v4-pro', 1_000_000, 0) > custoEmCentavos('deepseek-flash', 1_000_000, 0),
);

// Arredondamento PARA CIMA: um teto que erra para baixo deixa passar
// a chamada que estoura.
t('custo fracionário arredonda para cima', custoEmCentavos('deepseek-flash', 1000, 0) === 1);
t('chamada de custo zero continua zero', custoEmCentavos('deepseek-flash', 0, 0) === 0);

// Uma chamada típica de seleção: transcrição de 10 min cabe em uns
// 8 mil tokens de entrada, resposta com raciocínio em uns 6 mil.
const tipica = custoEmCentavos('deepseek-flash', 8000, 6000);
t('uma seleção típica custa menos de 1% do teto mensal', tipica < LIMITE_MENSAL_PADRAO_CENTAVOS / 100);

// ============================================================
// Estado do limite
// ============================================================

const uso = (gasto: number, limite = 2000): SituacaoDeUso => ({
  periodo: '2026-09',
  gastoCentavos: gasto,
  limiteCentavos: limite,
  chamadas: 1,
});

t('gasto baixo é ok', estadoDoLimite(uso(100)) === 'ok');
t('79% ainda é ok', estadoDoLimite(uso(1580)) === 'ok');
t('exatamente 80% já avisa', estadoDoLimite(uso(1600)) === 'aviso');
t('99% avisa', estadoDoLimite(uso(1999)) === 'aviso');
t('exatamente no teto bloqueia', estadoDoLimite(uso(2000)) === 'bloqueado');
t('acima do teto bloqueia', estadoDoLimite(uso(2500)) === 'bloqueado');

// ============================================================
// Cabe no limite
//
// A estimativa é o que separa "avisar depois" de "não gastar".
// ============================================================

t('chamada barata cabe com folga', cabeNoLimite(uso(100), 5));
t('chamada que fecha exatamente no teto cabe', cabeNoLimite(uso(1900), 100));
t('chamada que passa um centavo do teto NÃO cabe', !cabeNoLimite(uso(1900), 101));
t('nada cabe quando já estourou', !cabeNoLimite(uso(2000), 1));

// ============================================================
// Aviso ao usuário
// ============================================================

t('gasto normal não gera aviso', avisoDeUso(uso(100)) === null);

const emAviso = avisoDeUso(uso(1700));
t('o aviso de 80% menciona os dois valores', !!emAviso && emAviso.includes('17.00') && emAviso.includes('20.00'));

const bloqueado = avisoDeUso(uso(2000));
// A mensagem precisa dizer o que fazer: um bloqueio sem saída é pior
// que nenhum, porque o usuário não sabe se esperou ou se quebrou.
t('a mensagem de bloqueio diz como sair dele', !!bloqueado && bloqueado.includes('configurações'));
t('a mensagem de bloqueio diz quando volta sozinho', !!bloqueado && bloqueado.includes('1º'));

// ============================================================
// Período
// ============================================================

t('o período sai como AAAA-MM', /^\d{4}-\d{2}$/.test(periodoDe(new Date('2026-09-21T12:00:00Z'))));
t('janeiro vira 01, com zero à esquerda', periodoDe(new Date('2026-01-05T12:00:00Z')) === '2026-01');
// UTC e não fuso local: quem apura no dia 1º às 00h de Brasília não
// pode ver o mês anterior por causa das 3 horas de diferença.
t('o período usa UTC', periodoDe(new Date('2026-03-01T01:00:00Z')) === '2026-03');

// ============================================================
// Schema e tabelas
// ============================================================

t('situação válida passa', situacaoDeUsoSchema.safeParse(uso(100)).success);
t(
  'período em formato errado é recusado',
  !situacaoDeUsoSchema.safeParse({ ...uso(100), periodo: 'setembro' }).success,
);
t(
  'gasto negativo é recusado',
  !situacaoDeUsoSchema.safeParse({ ...uso(100), gastoCentavos: -1 }).success,
);
t(
  'limite zero é recusado — um teto de zero bloquearia tudo em silêncio',
  !situacaoDeUsoSchema.safeParse({ ...uso(100), limiteCentavos: 0 }).success,
);

t(
  'toda chamada tem modelo definido',
  CHAMADAS_DE_IA.every((c) => !!MODELO_POR_CHAMADA[c]),
);
t(
  'nenhuma chamada usa os nomes desligados em 2026-07-24',
  CHAMADAS_DE_IA.every((c) => !['deepseek-chat', 'deepseek-reasoner'].includes(MODELO_POR_CHAMADA[c])),
);
t(
  'seleção e risco usam raciocínio (seção 26.6)',
  CONFIG_POR_CHAMADA.selecionar_trechos.raciocinio !== 'desligado' &&
    CONFIG_POR_CHAMADA.avaliar_risco.raciocinio !== 'desligado',
);
t(
  'as chamadas de escrita curta NÃO pagam raciocínio',
  CONFIG_POR_CHAMADA.gerar_roteiro.raciocinio === 'desligado' &&
    CONFIG_POR_CHAMADA.sugerir_melhorias.raciocinio === 'desligado' &&
    CONFIG_POR_CHAMADA.comandar_edicao.raciocinio === 'desligado',
);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
