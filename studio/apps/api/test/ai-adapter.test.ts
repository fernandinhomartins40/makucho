// ============================================================
// O adapter de IA e as recusas.
//
// Testar o caminho feliz de uma IA é fácil e quase inútil. O que
// precisa de teste é a RECUSA: JSON quebrado, campo inventado, prosa
// no lugar de estrutura, trecho que não existe no vídeo.
//
// Nenhuma dessas saídas pode ser pedida a um provedor real. É o
// segundo motivo pelo qual o adapter existe.
// ============================================================

import { parseAiProposal } from '@makucho/studio-contracts';
import { FalsoProvedor } from '../src/modules/ai/falso.provedor';
import { PromptsService } from '../src/modules/ai/prompts.service';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const DURACAO = 60_000;

const pedir = (provedor: FalsoProvedor) =>
  provedor.conversar({
    chamada: 'selecionar_trechos',
    sistema: 'sistema',
    usuario: 'usuario',
    maxTokens: 2000,
  });

async function main() {
  // ============================================================
  // Caminho feliz
  // ============================================================

  const valido = await pedir(new FalsoProvedor('valido', DURACAO));
  const propostaOk = parseAiProposal(valido.texto);
  t('a proposta válida do falso passa no contrato', propostaOk.ok);

  if (propostaOk.ok) {
    t('a proposta traz ao menos um segmento', propostaOk.proposal.segments.length > 0);
    t(
      'todo segmento tem motivo preenchido',
      propostaOk.proposal.segments.every((s) => s.reason.length > 0),
    );
    // O risco nunca pode ser 'low' por omissão: um risco sempre baixo
    // é pior que nenhum, porque dá falsa segurança (seção 26.3).
    t(
      'os riscos variam, não são todos low',
      new Set(propostaOk.proposal.segments.map((s) => s.semanticRisk)).size > 1,
    );
    t(
      'a dependência declarada aponta para um segmento que existe',
      propostaOk.proposal.segments.every((s) =>
        s.dependencies.every((d) => d < propostaOk.proposal.segments.length),
      ),
    );
  }

  // O consumo precisa ser contado mesmo no falso: é o que a trava de
  // custo soma, e um provedor que reporta zero deixaria o teto
  // inoperante em desenvolvimento.
  t('o provedor reporta consumo de entrada', valido.consumo.inputTokens > 0);
  t('o provedor reporta consumo de saída', valido.consumo.outputTokens > 0);

  // ============================================================
  // As recusas
  // ============================================================

  const quebrado = await pedir(new FalsoProvedor('json_quebrado', DURACAO));
  const rQuebrado = parseAiProposal(quebrado.texto);
  t('JSON quebrado é recusado', !rQuebrado.ok);
  // Erro de sintaxe é o caso que uma segunda tentativa costuma
  // resolver; violação de schema é erro de conteúdo e não adianta.
  t('JSON quebrado é marcado como reparável', !rQuebrado.ok && rQuebrado.repairable);

  const extra = await pedir(new FalsoProvedor('campo_extra', DURACAO));
  const rExtra = parseAiProposal(extra.texto);
  t('campo inesperado é recusado pelo .strict()', !rExtra.ok);
  t('campo inesperado NÃO é reparável', !rExtra.ok && !rExtra.repairable);

  const prosa = await pedir(new FalsoProvedor('prosa', DURACAO));
  t('resposta em prosa é recusada', !parseAiProposal(prosa.texto).ok);

  const vazio = await pedir(new FalsoProvedor('vazio', DURACAO));
  t('resposta vazia é recusada', !parseAiProposal(vazio.texto).ok);

  // ============================================================
  // O caso perigoso
  //
  // JSON válido, schema satisfeito, e o trecho aponta para um tempo
  // que não existe na gravação. Só uma conferência contra a duração
  // real pega — e é por isso que o validador semântico existe.
  // ============================================================

  const fora = await pedir(new FalsoProvedor('fora_do_video', DURACAO));
  const rFora = parseAiProposal(fora.texto);
  t('trecho fora do vídeo passa no schema — o schema não conhece a duração', rFora.ok);

  if (rFora.ok) {
    const estoura = rFora.proposal.segments.some((s) => s.sourceEndMs > DURACAO);
    t('e é detectável conferindo contra a duração real', estoura);
  }

  // ============================================================
  // Prompts versionados
  // ============================================================

  const prompts = new PromptsService();
  const { texto, versao } = prompts.obter('selecionar_trechos');

  t('o prompt de seleção é carregado', texto.length > 100);
  // A versão vai gravada com a resposta: sem ela, um prompt ajustado
  // torna todo resultado anterior inexplicável (seção 26.8).
  t('a versão vem junto e tem o formato do arquivo', versao === 'selecao-v1');
  t(
    'o prompt diz que a IA não escreve fala',
    texto.includes('NUNCA escreve fala') || texto.toLowerCase().includes('nunca escreve fala'),
  );
  t('o prompt exige declarar o que falta', texto.includes('missingBlocks'));
  t('o prompt manda escolher o risco mais alto na dúvida', texto.includes('mais alto'));

  // Segunda leitura vem do cache, e precisa ser idêntica.
  t('a segunda leitura devolve o mesmo texto', prompts.obter('selecionar_trechos').texto === texto);

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail > 0) process.exit(1);
}

void main();
