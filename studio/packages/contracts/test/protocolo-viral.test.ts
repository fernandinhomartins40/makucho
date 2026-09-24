// ============================================================
// Protocolo de edição: retomadas, entendimento da IA e o formato
// da resposta do prompt de seleção atual.
// ============================================================

import { aiProposalV1Schema, detectarRetomadas, parseAiProposal, removerRetomadasEscolhidas } from '../src';
import type { AiProposalV1 } from '../src';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const seg = (i: number, text: string) => ({ startMs: i * 3000, endMs: i * 3000 + 2800, text });

// ---------- Retomadas ----------
const segmentos = [
  seg(0, 'Oi pessoal, tudo bem?'),
  seg(1, 'O maior erro de quem vende'),
  seg(2, 'O maior erro de quem vende pelo WhatsApp é demorar pra responder.'),
  seg(3, 'Quando o cliente espera, ele compra do concorrente.'),
  seg(4, 'Quando o cliente espera ele acaba comprando do concorrente.'),
  seg(5, 'Então responda em até cinco minutos.'),
];
const r = detectarRetomadas(segmentos);
t('começo em falso: #2 refaz #1', r.get(2) === 1);
t('repetição: #4 refaz #3', r.get(4) === 3);
t('fala nova não é retomada', !r.has(5) && !r.has(3));
t('fala curta não conta', !r.has(1));

const trecho = (i: number, role: AiProposalV1['segments'][number]['role'], deps: number[] = []) => ({
  sourceStartMs: segmentos[i]!.startMs,
  sourceEndMs: segmentos[i]!.endMs,
  role,
  score: 0.8,
  dependencies: deps,
  reason: 'x',
  semanticRisk: 'low' as const,
});

const proposta: AiProposalV1 = {
  schemaVersion: '1.0',
  framework: 'authority_education',
  targetDurationMs: 12_000,
  segments: [trecho(2, 'hook'), trecho(3, 'problem', [0]), trecho(4, 'problem', [0]), trecho(5, 'solution', [2])],
  warnings: [],
  missingBlocks: [],
  style: { emphasis: [3], transitions: [{ before: 3, type: 'smooth' }] },
};
const limpa = removerRetomadasEscolhidas(proposta, segmentos, r);
t('as duas versões escolhidas: sai a anterior', limpa.removidos === 1 && limpa.proposta.segments.length === 3);
t('fica a última versão', limpa.proposta.segments[1]!.sourceStartMs === segmentos[4]!.startMs);
t('dependências renumeradas', JSON.stringify(limpa.proposta.segments[2]!.dependencies) === '[1]');
t('ênfase e transição renumeradas', limpa.proposta.style?.emphasis?.[0] === 2 && limpa.proposta.style?.transitions?.[0]?.before === 2);
t('o resultado continua válido no schema', aiProposalV1Schema.safeParse(limpa.proposta).success);

const semDupla = removerRetomadasEscolhidas({ ...proposta, segments: [trecho(2, 'hook'), trecho(4, 'problem')] }, segmentos, r);
t('só a última versão escolhida: nada muda', semDupla.removidos === 0);

// ---------- Entendimento ----------
const resposta = {
  schemaVersion: '1.0',
  analysis: {
    topic: 'Tempo de resposta no WhatsApp',
    audience: 'donos de pequenos negócios',
    promise: 'vender mais respondendo rápido',
    structure: 'problema_solucao',
    hookType: 'dor',
  },
  framework: 'authority_education',
  targetDurationMs: 9000,
  segments: [trecho(2, 'hook'), trecho(4, 'problem'), trecho(5, 'solution', [1])],
  style: {
    hookTitle: 'O erro que trava suas vendas',
    captionPreset: 'destaque',
    emphasis: [2],
    transitions: [{ before: 2, type: 'smooth' }],
    cta: 'Salva pra não esquecer',
  },
  warnings: [],
  missingBlocks: [],
};
const lida = parseAiProposal(JSON.stringify(resposta));
t('resposta no formato do prompt atual é aceita', lida.ok);
t('o entendimento vem junto', lida.ok && lida.proposal.analysis?.structure === 'problema_solucao');
t('estrutura fora da lista é recusada', !parseAiProposal(JSON.stringify({ ...resposta, analysis: { ...resposta.analysis, structure: 'viral' } })).ok);
t('sem analysis continua aceita (propostas antigas)', parseAiProposal(JSON.stringify({ ...resposta, analysis: undefined })).ok);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
