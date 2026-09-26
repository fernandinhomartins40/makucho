// ============================================================
// Roteiro por pedido livre: leitura tolerante da resposta da IA,
// conversão para salvar e o pedido de edição.
// ============================================================

import {
  lerRoteiroDaIa,
  pedidoDeEdicaoDeRoteiroSchema,
  pedidoDeRoteiroLivreSchema,
  roteiroAtualParaIa,
  roteiroDaIaParaEntrada,
  scriptInputSchema,
} from '../src/index';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const resposta = JSON.stringify({
  title: 'Responder rápido vende mais',
  framework: 'pas',
  duracaoAlvoS: 30,
  blocks: [
    { role: 'hook', goal: 'Crie tensão com a perda', text: 'Você perde cliente toda vez que demora pra responder. (pausa)' },
    { role: 'problema_inventado', goal: 'x'.repeat(300), text: 'Quem espera\\nmais de 5 minutos vai pro concorrente.' },
    { role: 'solution', text: 'Deixa uma resposta pronta para as 5 perguntas mais comuns.' },
    { role: 'cta', goal: 'Uma ação só', text: 'Salva esse vídeo e aplica hoje.' },
    { role: 'insight', text: '   ' },
  ],
  tecnicas: [{ nome: 'Gancho de dor', onde: 'abre com a perda de clientes' }, { nome: '' }],
  extra: 'campo que o modelo inventou',
});

const lido = lerRoteiroDaIa(`\`\`\`json\n${resposta}\n\`\`\``);
t('a resposta é lida (com cerca de markdown e campo a mais)', lido.ok);
if (lido.ok) {
  const r = lido.roteiro;
  t('papel desconhecido vira insight', r.blocks[1]!.role === 'insight');
  t('intenção longa é cortada em 120', r.blocks[1]!.goal.length === 120);
  t('didascália no fim da fala sai', !r.blocks[0]!.text.includes('(pausa)'));
  t('bloco sem texto some', r.blocks.length === 4);
  t('técnica sem nome some', r.tecnicas.length === 1);
  const entrada = roteiroDaIaParaEntrada(r);
  t('vira um roteiro que o contrato aceita', scriptInputSchema.safeParse(entrada).success);
  t('duração alvo em ms e estrutura preservadas', entrada.targetDurationMs === 30_000 && entrada.framework === 'pas');
}

t('JSON quebrado não passa', !lerRoteiroDaIa('{quebrado').ok);
t('sem blocos não passa', !lerRoteiroDaIa('{"title":"x","blocks":[]}').ok);
const semEstrutura = lerRoteiroDaIa('{"blocks":[{"role":"hook","text":"Oi"}]}');
t('sem título, estrutura e duração: padrões', semEstrutura.ok && semEstrutura.roteiro.title === 'Roteiro' && semEstrutura.roteiro.framework === 'authority_education' && semEstrutura.roteiro.duracaoAlvoS === 45);

t('pedido livre com duração opcional', pedidoDeRoteiroLivreSchema.safeParse({ pedido: 'Um reels sobre café', duracaoS: null }).success);
t('pedido curto demais é recusado', !pedidoDeRoteiroLivreSchema.safeParse({ pedido: 'a' }).success);

const edicao = pedidoDeEdicaoDeRoteiroSchema.parse({
  pedido: 'deixa isso mais forte',
  roteiro: { title: 'T', targetDurationMs: 30000, blocks: [{ role: 'hook', text: 'Oi' }, { role: 'cta', text: 'Segue' }] },
  blocoSelecionado: 0,
  anterior: { pedido: 'encurta', resposta: 'Cortei o contexto.' },
});
const texto = roteiroAtualParaIa(edicao);
t('o pedido de edição leva blocos numerados, selecionado e conversa', texto.includes('[0] hook') && texto.includes('BLOCO SELECIONADO: [0]') && texto.includes('encurta') && texto.includes('PEDIDO: deixa isso mais forte'));

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
