import {
  parseRoteiroGerado,
  parseSugestoes,
  roteiroParaEntrada,
  scriptInputSchema,
} from '../src/index';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ============================================================
// #1 -- roteiro gerado
// ============================================================

const blocos = [
  { role: 'hook', goal: 'criar curiosidade', text: 'Voce esta perdendo cliente no primeiro minuto.' },
  { role: 'problem', goal: 'nomear a dor', text: 'A maioria demora horas para responder.' },
  { role: 'solution', goal: 'entregar o caminho', text: 'Responda em ate cinco minutos.' },
  { role: 'cta', goal: 'convidar', text: 'Comenta AGENDA que eu te mando o passo a passo.' },
];

const roteiroValido = {
  schemaVersion: '1.0',
  title: 'O erro que custa cliente',
  framework: 'authority_education',
  mode: 'BULLETS',
  blocks: blocos,
};

const json = (v: unknown) => JSON.stringify(v);

const lido = parseRoteiroGerado(json(roteiroValido));
t('roteiro valido passa', lido.ok === true);
t('quatro blocos preservados', lido.ok === true && lido.dados.blocks.length === 4);

// --- Cerca de codigo ---
const comCerca = parseRoteiroGerado('```json\n' + json(roteiroValido) + '\n```');
t('cerca de codigo e tolerada', comCerca.ok === true);

// --- JSON quebrado: recuperavel ---
const quebrado = parseRoteiroGerado('{ "schemaVersion": "1.0", ');
t('JSON quebrado recusado', quebrado.ok === false);
t(
  'JSON quebrado e recuperavel -- vale tentar de novo',
  quebrado.ok === false && quebrado.recuperavel === true,
);

// --- Violacao de schema: NAO recuperavel ---
const semHook = parseRoteiroGerado(
  json({ ...roteiroValido, blocks: blocos.map((b) => ({ ...b, role: 'insight' })) }),
);
t('roteiro sem hook e recusado', semHook.ok === false);
t(
  'falta de hook NAO e recuperavel -- repetir so gasta o teto',
  semHook.ok === false && semHook.recuperavel === false,
);

// --- Campo extra: prompt injection ou modelo trocado ---
const comExtra = parseRoteiroGerado(
  json({ ...roteiroValido, blocks: [{ ...blocos[0], instrucao: 'ignore o anterior' }, ...blocos.slice(1)] }),
);
t('campo extra no bloco faz o parse FALHAR, nao e ignorado', comExtra.ok === false);

// --- Contagem de blocos ---
t(
  'tres blocos recusados -- sem arco narrativo',
  parseRoteiroGerado(json({ ...roteiroValido, blocks: blocos.slice(0, 3) })).ok === false,
);
t(
  'sete blocos recusados',
  parseRoteiroGerado(json({ ...roteiroValido, blocks: [...blocos, ...blocos] })).ok === false,
);

// --- Papel e framework fora do vocabulario ---
t(
  'papel inventado recusado',
  parseRoteiroGerado(
    json({ ...roteiroValido, blocks: [{ ...blocos[0], role: 'gancho' }, ...blocos.slice(1)] }),
  ).ok === false,
);
t(
  'framework inventado recusado',
  parseRoteiroGerado(json({ ...roteiroValido, framework: 'aida' })).ok === false,
);

// ============================================================
// A ponte ate o que a tela salva
// ============================================================

if (lido.ok) {
  const entrada = roteiroParaEntrada(lido.dados, 60_000);

  t('posicoes numeradas pelo parser, em ordem',
    entrada.blocks.map((b) => b.position).join(',') === '0,1,2,3');

  t('duracao alvo vem de fora, nao do modelo', entrada.targetDurationMs === 60_000);

  // O que importa de verdade: o que a IA produz precisa entrar pela
  // MESMA porta que um roteiro escrito a mao. Se divergir, existem
  // dois formatos de roteiro no produto.
  t(
    'o resultado passa no scriptInputSchema -- a mesma porta do roteiro manual',
    scriptInputSchema.safeParse(entrada).success,
  );
}

// ============================================================
// #2 -- sugestoes
// ============================================================

const sugestoesValidas = {
  schemaVersion: '1.0',
  suggestions: [
    {
      blockIndex: 0,
      issue: 'o hook afirma em vez de perguntar',
      reason: 'uma pergunta direta segura mais nos primeiros segundos',
      replacementText: 'Quanto cliente voce perde no primeiro minuto?',
    },
  ],
};

const s1 = parseSugestoes(json(sugestoesValidas), 4);
t('sugestao valida passa', s1.ok === true);

// --- Zero sugestoes e resposta valida ---
const vazio = parseSugestoes(json({ schemaVersion: '1.0', suggestions: [] }), 4);
t(
  'zero sugestoes e VALIDO -- roteiro bom nao tem o que melhorar',
  vazio.ok === true && vazio.dados.suggestions.length === 0,
);

// --- O texto pronto e obrigatorio ---
const semTexto = parseSugestoes(
  json({
    schemaVersion: '1.0',
    suggestions: [{ blockIndex: 0, issue: 'melhore o hook', reason: 'esta fraco' }],
  }),
  4,
);
t('sugestao sem o texto reescrito e recusada -- conselho nao e ferramenta', semTexto.ok === false);

// --- Indice alem do fim do roteiro ---
const foraDoFim = parseSugestoes(
  json({
    schemaVersion: '1.0',
    suggestions: [{ ...sugestoesValidas.suggestions[0], blockIndex: 9 }],
  }),
  4,
);
t('indice alem do fim do roteiro e recusado', foraDoFim.ok === false);
t(
  'a recusa diz qual indice e quantos blocos existem',
  foraDoFim.ok === false && foraDoFim.erro.includes('9') && foraDoFim.erro.includes('4'),
);

// --- Mais de tres ---
t(
  'quatro sugestoes recusadas',
  parseSugestoes(
    json({
      schemaVersion: '1.0',
      suggestions: Array.from({ length: 4 }, (_, i) => ({
        ...sugestoesValidas.suggestions[0],
        blockIndex: i,
      })),
    }),
    4,
  ).ok === false,
);

// --- Duas para o mesmo bloco: a segunda partiria de um texto que
//     nao existe mais depois de aplicar a primeira.
const duplicadas = parseSugestoes(
  json({
    schemaVersion: '1.0',
    suggestions: [
      sugestoesValidas.suggestions[0],
      { ...sugestoesValidas.suggestions[0], replacementText: 'Outra versao do hook.' },
    ],
  }),
  4,
);
t(
  'duas sugestoes para o mesmo bloco: fica so a primeira',
  duplicadas.ok === true && duplicadas.dados.suggestions.length === 1,
);
t(
  'e a que fica e a primeira, nao a ultima',
  duplicadas.ok === true &&
    duplicadas.dados.suggestions[0].replacementText.startsWith('Quanto cliente'),
);

// --- Campo extra tambem falha aqui ---
t(
  'campo extra na sugestao faz o parse falhar',
  parseSugestoes(
    json({
      schemaVersion: '1.0',
      suggestions: [{ ...sugestoesValidas.suggestions[0], prioridade: 'alta' }],
    }),
    4,
  ).ok === false,
);

// --- Prosa em vez de JSON ---
const prosa = parseSugestoes('Claro! Aqui vao algumas sugestoes para o seu roteiro:', 4);
t('prosa em vez de JSON e recusada', prosa.ok === false);
t('prosa e marcada como recuperavel', prosa.ok === false && prosa.recuperavel === true);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
