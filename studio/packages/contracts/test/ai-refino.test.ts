import { parseCandidatos, parseRefino } from '../src/index';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const json = (v: unknown) => JSON.stringify(v);

// ============================================================
// #4 -- candidatos
// ============================================================

const candidato = {
  sourceStartMs: 30_000,
  sourceEndMs: 36_000,
  role: 'proof',
  score: 0.8,
  reason: 'Traz o caso concreto que falta na argumentacao.',
  semanticRisk: 'low',
  apos: 1,
};

const jaUsados = [
  { sourceStartMs: 10_000, sourceEndMs: 18_000 },
  { sourceStartMs: 50_000, sourceEndMs: 58_000 },
];

const ctx = { duracaoDoOriginalMs: 120_000, jaUsados };

{
  const r = parseCandidatos(json({ schemaVersion: '1.0', candidates: [candidato] }), ctx);
  t('candidato valido passa', r.ok === true);
  t('e traz o motivo', r.ok === true && r.dados.candidates[0]!.reason.length > 0);
}

// --- Lista vazia e resposta valida ---
{
  const r = parseCandidatos(json({ schemaVersion: '1.0', candidates: [] }), ctx);
  t(
    'zero candidatos e VALIDO -- nem toda gravacao tem sobra boa',
    r.ok === true && r.dados.candidates.length === 0,
  );
}

// --- Alem do fim da gravacao ---
{
  const r = parseCandidatos(
    json({
      schemaVersion: '1.0',
      candidates: [{ ...candidato, sourceStartMs: 118_000, sourceEndMs: 130_000 }],
    }),
    ctx,
  );
  t('trecho alem do fim da gravacao e recusado', r.ok === false);
  t(
    'e a recusa diz a duracao real',
    r.ok === false && r.erro.includes('120000'),
  );
}

// --- O que JA esta na timeline ---
{
  // Sobreposicao de 100% com o primeiro clipe ja usado.
  const r = parseCandidatos(
    json({
      schemaVersion: '1.0',
      candidates: [{ ...candidato, sourceStartMs: 10_000, sourceEndMs: 18_000 }],
    }),
    ctx,
  );
  t(
    'candidato que ja esta na timeline e descartado',
    r.ok === true && r.dados.candidates.length === 0,
  );
}

{
  // 60% de sobreposicao: ja e repeticao para quem assiste.
  const r = parseCandidatos(
    json({
      schemaVersion: '1.0',
      candidates: [{ ...candidato, sourceStartMs: 13_000, sourceEndMs: 21_000 }],
    }),
    ctx,
  );
  t('sobreposicao acima de 50% tambem e descartada', r.ok === true && r.dados.candidates.length === 0);
}

{
  // Encosta no fim do usado, mas quase nao cobre: nao e repeticao.
  const r = parseCandidatos(
    json({
      schemaVersion: '1.0',
      candidates: [{ ...candidato, sourceStartMs: 17_500, sourceEndMs: 25_000 }],
    }),
    ctx,
  );
  t('sobreposicao pequena NAO e descartada', r.ok === true && r.dados.candidates.length === 1);
}

{
  // Um repetido no meio de dois bons: os bons sobrevivem. Recusar a
  // resposta inteira gastaria a chamada de novo para obter os mesmos
  // dois.
  const r = parseCandidatos(
    json({
      schemaVersion: '1.0',
      candidates: [
        candidato,
        { ...candidato, sourceStartMs: 10_000, sourceEndMs: 18_000 },
        { ...candidato, sourceStartMs: 70_000, sourceEndMs: 76_000 },
      ],
    }),
    ctx,
  );
  t(
    'um repetido nao invalida os outros dois',
    r.ok === true && r.dados.candidates.length === 2,
  );
}

// --- Schema ---
{
  t(
    'quatro candidatos sao recusados',
    parseCandidatos(
      json({ schemaVersion: '1.0', candidates: Array.from({ length: 4 }, () => candidato) }),
      ctx,
    ).ok === false,
  );
  t(
    'campo extra faz o parse FALHAR',
    parseCandidatos(
      json({ schemaVersion: '1.0', candidates: [{ ...candidato, prioridade: 'alta' }] }),
      ctx,
    ).ok === false,
  );
  t(
    'papel inventado e recusado',
    parseCandidatos(
      json({ schemaVersion: '1.0', candidates: [{ ...candidato, role: 'gancho' }] }),
      ctx,
    ).ok === false,
  );
  t(
    'fim antes do inicio e recusado',
    parseCandidatos(
      json({
        schemaVersion: '1.0',
        candidates: [{ ...candidato, sourceStartMs: 40_000, sourceEndMs: 30_000 }],
      }),
      ctx,
    ).ok === false,
  );
}

// --- Recuperavel: sintaxe sim, conteudo nao ---
{
  const quebrado = parseCandidatos('{"schemaVersion": "1.0", ', ctx);
  t('JSON quebrado e recuperavel', quebrado.ok === false && quebrado.recuperavel === true);

  const prosa = parseCandidatos('Claro! Encontrei tres trechos otimos:', ctx);
  t('prosa e recusada', prosa.ok === false);

  const schema = parseCandidatos(json({ schemaVersion: '2.0', candidates: [] }), ctx);
  t(
    'violacao de schema NAO e recuperavel -- repetir so gasta o teto',
    schema.ok === false && schema.recuperavel === false,
  );
}

// ============================================================
// #6 -- refino
// ============================================================

const clipes = [
  { sourceStartMs: 10_000, sourceEndMs: 18_000 },
  { sourceStartMs: 50_000, sourceEndMs: 58_000 },
];

const ajuste = {
  clipIndex: 0,
  sourceStartMs: 10_400,
  sourceEndMs: 18_000,
  reason: 'O corte comecava no meio da palavra anterior.',
};

{
  const r = parseRefino(json({ schemaVersion: '1.0', adjustments: [ajuste] }), clipes, 120_000);
  t('ajuste valido passa', r.ok === true);
  t('e traz o motivo do ajuste', r.ok === true && r.dados.adjustments[0]!.reason.length > 0);
}

{
  const r = parseRefino(json({ schemaVersion: '1.0', adjustments: [] }), clipes, 120_000);
  t(
    'zero ajustes e VALIDO -- corte bom nao tem o que refinar',
    r.ok === true && r.dados.adjustments.length === 0,
  );
}

// --- Indice alem da timeline ---
{
  const r = parseRefino(
    json({ schemaVersion: '1.0', adjustments: [{ ...ajuste, clipIndex: 9 }] }),
    clipes,
    120_000,
  );
  t('ajuste em trecho inexistente e recusado', r.ok === false);
  t(
    'e a recusa diz quantos trechos existem',
    r.ok === false && r.erro.includes('9') && r.erro.includes('2'),
  );
}

// --- Alem do fim da gravacao ---
{
  const r = parseRefino(
    json({
      schemaVersion: '1.0',
      adjustments: [{ ...ajuste, sourceStartMs: 115_000, sourceEndMs: 130_000 }],
    }),
    clipes,
    120_000,
  );
  t('ajuste alem do fim da gravacao e recusado', r.ok === false);
}

// --- Ajuste que nao muda nada ---
{
  const r = parseRefino(
    json({
      schemaVersion: '1.0',
      // Exatamente os tempos que o clipe ja tem.
      adjustments: [{ ...ajuste, sourceStartMs: 10_000, sourceEndMs: 18_000 }],
    }),
    clipes,
    120_000,
  );
  t(
    'ajuste identico ao atual e filtrado -- nao e ajuste',
    r.ok === true && r.dados.adjustments.length === 0,
  );
}

// --- Dois ajustes para o mesmo clipe ---
{
  const r = parseRefino(
    json({
      schemaVersion: '1.0',
      adjustments: [ajuste, { ...ajuste, sourceStartMs: 10_800 }],
    }),
    clipes,
    120_000,
  );
  t(
    'dois ajustes no mesmo trecho: fica so o primeiro',
    r.ok === true && r.dados.adjustments.length === 1,
  );
  t(
    'e e o primeiro que fica',
    r.ok === true && r.dados.adjustments[0]!.sourceStartMs === 10_400,
  );
}

// --- Ajustes em clipes diferentes convivem ---
{
  const r = parseRefino(
    json({
      schemaVersion: '1.0',
      adjustments: [ajuste, { ...ajuste, clipIndex: 1, sourceStartMs: 50_300, sourceEndMs: 58_000 }],
    }),
    clipes,
    120_000,
  );
  t('ajustes em trechos diferentes convivem', r.ok === true && r.dados.adjustments.length === 2);
}

// --- Schema ---
{
  t(
    'fim antes do inicio e recusado',
    parseRefino(
      json({
        schemaVersion: '1.0',
        adjustments: [{ ...ajuste, sourceStartMs: 18_000, sourceEndMs: 10_000 }],
      }),
      clipes,
      120_000,
    ).ok === false,
  );
  t(
    'campo extra faz o parse falhar',
    parseRefino(
      json({ schemaVersion: '1.0', adjustments: [{ ...ajuste, urgencia: 'alta' }] }),
      clipes,
      120_000,
    ).ok === false,
  );
  t(
    'ajuste sem motivo e recusado -- o usuario precisa poder discordar',
    parseRefino(
      json({
        schemaVersion: '1.0',
        adjustments: [{ clipIndex: 0, sourceStartMs: 10_400, sourceEndMs: 18_000 }],
      }),
      clipes,
      120_000,
    ).ok === false,
  );
}

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
