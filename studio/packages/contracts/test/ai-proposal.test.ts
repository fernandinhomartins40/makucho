import {
  parseAiProposal,
  validateSemanticSafety,
  hasBlockingIssues,
  overallRisk,
} from '../src/index';
import type { ProposedSegment, SegmentText } from '../src/index';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ============================================================
// Parse da saida do modelo
// ============================================================

const propostaValida = {
  schemaVersion: '1.0',
  framework: 'authority_education',
  targetDurationMs: 57_000,
  segments: [
    {
      sourceStartMs: 138_200,
      sourceEndMs: 144_900,
      role: 'hook',
      score: 0.94,
      dependencies: [],
      reason: 'Frase direta, consequencia financeira e curiosidade',
      semanticRisk: 'low',
    },
  ],
  warnings: [],
  missingBlocks: ['cta'],
};

t('aceita proposta valida', parseAiProposal(JSON.stringify(propostaValida)).ok);

// Modelos embrulham o JSON em cerca de markdown mesmo quando o prompt
// pede JSON puro.
t(
  'remove cerca de markdown',
  parseAiProposal('```json\n' + JSON.stringify(propostaValida) + '\n```').ok,
);

// --- Erro de sintaxe e reparavel; violacao de schema nao e ---
const sintaxe = parseAiProposal('{ isso nao e json');
t('JSON quebrado e marcado como reparavel', !sintaxe.ok && sintaxe.repairable);

const schemaInvalido = parseAiProposal(
  JSON.stringify({ ...propostaValida, framework: 'framework_inventado' }),
);
t('framework desconhecido nao e reparavel', !schemaInvalido.ok && !schemaInvalido.repairable);

// --- Campo extra: sinal de injecao ou de modelo trocado ---
t(
  'rejeita chave inesperada na proposta',
  !parseAiProposal(
    JSON.stringify({ ...propostaValida, ffmpegCommand: 'rm -rf /' }),
  ).ok,
);

t(
  'rejeita funcao comunicacional inexistente',
  !parseAiProposal(
    JSON.stringify({
      ...propostaValida,
      segments: [{ ...propostaValida.segments[0], role: 'subliminal' }],
    }),
  ).ok,
);

t(
  'rejeita dependencia fora da lista',
  !parseAiProposal(
    JSON.stringify({
      ...propostaValida,
      segments: [{ ...propostaValida.segments[0], dependencies: [7] }],
    }),
  ).ok,
);

// ============================================================
// Seguranca semantica — as pegadinhas da secao 5 do contexto mestre
// ============================================================

const seg = (over: Partial<ProposedSegment>): ProposedSegment => ({
  sourceStartMs: 0,
  sourceEndMs: 5_000,
  role: 'hook',
  score: 0.9,
  dependencies: [],
  reason: 'teste',
  semanticRisk: 'low',
  ...over,
});

const texto = (text: string, minWordConfidence = 0.95): SegmentText => ({
  text,
  minWordConfidence,
});

// --- Enumeracao orfa ---
// "A segunda coisa que voce precisa fazer..." nao pode abrir o video.
const enumeracao = validateSemanticSafety(
  [
    seg({ sourceStartMs: 200_000, sourceEndMs: 205_000 }),
    seg({ sourceStartMs: 100_000, sourceEndMs: 105_000, role: 'solution' }),
  ],
  [texto('O maior erro que eu vejo e esse.'), texto('A segunda coisa que voce precisa fazer e responder rapido.')],
);
t('detecta enumeracao orfa', enumeracao.some((i) => i.code === 'orphan_enumeration'));
t('enumeracao orfa bloqueia o render', hasBlockingIssues(enumeracao));

// --- Negacao deslocada ---
// "Isso nao funciona..." junto de outro contexto inverte o sentido.
const negacao = validateSemanticSafety(
  [
    seg({ sourceStartMs: 300_000, sourceEndMs: 305_000 }),
    seg({ sourceStartMs: 50_000, sourceEndMs: 55_000, role: 'problem' }),
  ],
  [texto('Muita gente investe em anuncio.'), texto('Nao funciona do jeito que estao fazendo.')],
);
t('detecta negacao deslocada', negacao.some((i) => i.code === 'leading_negation'));

// --- Contexto original preservado nao gera alarme ---
// Se o trecho anterior tambem o precede no audio, o sentido esta intacto.
const ordemOriginal = validateSemanticSafety(
  [
    seg({ sourceStartMs: 10_000, sourceEndMs: 15_000 }),
    seg({ sourceStartMs: 15_000, sourceEndMs: 20_000, role: 'solution' }),
  ],
  [texto('Existem tres pontos a corrigir.'), texto('A segunda coisa e a mensagem inicial.')],
);
t(
  'nao alarma quando a ordem original e mantida',
  !ordemOriginal.some((i) => i.code === 'orphan_enumeration'),
);

// --- Dependencia declarada fora de ordem ---
const dependencia = validateSemanticSafety(
  [seg({ dependencies: [1] }), seg({ role: 'solution' })],
  [texto('Primeiro trecho.'), texto('Segundo trecho.')],
);
t(
  'detecta dependencia posicionada depois',
  dependencia.some((i) => i.code === 'dependency_out_of_order'),
);

// --- Risco alto nunca entra sozinho ---
const riscoAlto = validateSemanticSafety(
  [seg({ semanticRisk: 'high' })],
  [texto('Trecho ambiguo.')],
);
t('risco alto bloqueia', hasBlockingIssues(riscoAlto));
t('risco geral fica alto', overallRisk(riscoAlto) === 'high');

// --- Pronome sem referente ---
const pronome = validateSemanticSafety(
  [
    seg({ sourceStartMs: 200_000, sourceEndMs: 205_000 }),
    seg({ sourceStartMs: 20_000, sourceEndMs: 25_000, role: 'insight' }),
  ],
  [texto('Vamos ao ponto.'), texto('Isso acontece toda semana nas empresas.')],
);
t('detecta pronome orfao', pronome.some((i) => i.code === 'orphan_pronoun'));
t('pronome orfao apenas sinaliza', !hasBlockingIssues(pronome));

// --- Confianca baixa de transcricao ---
const confianca = validateSemanticSafety([seg({})], [texto('Trecho incerto.', 0.42)]);
t(
  'detecta confianca baixa',
  confianca.some((i) => i.code === 'low_transcription_confidence'),
);

// --- Proposta limpa ---
const limpa = validateSemanticSafety(
  [seg({}), seg({ sourceStartMs: 60_000, sourceEndMs: 65_000, role: 'solution' })],
  [texto('O maior erro que eu vejo e a demora no atendimento.'), texto('Corrija o tempo de resposta primeiro.')],
);
t('proposta limpa nao gera pendencia', limpa.length === 0);
t('risco geral baixo', overallRisk(limpa) === 'low');

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
