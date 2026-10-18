// ============================================================
// FusAI: o que vai no pedido (modelo, teto, sem os parâmetros da
// DeepSeek) e o que a tela mostra quando falta crédito.
//
// O fetch é simulado: nenhum teste chama a FusAI de verdade.
// ============================================================

import { FusaiProvedor, ehChaveDaFusai, mensagemDaFusai } from '../src/modules/ai/fusai.provedor';
import { ErroDoProvedor } from '../src/modules/ai/provedor';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

type Pedido = { url: string; corpo: Record<string, unknown>; auth: string };
let ultimo: Pedido | null = null;
let proxima: { status: number; corpo: unknown } = { status: 200, corpo: {} };
globalThis.fetch = (async (url: string, init: RequestInit) => {
  ultimo = { url, corpo: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).authorization) };
  return new Response(JSON.stringify(proxima.corpo), { status: proxima.status, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const respostaOk = (texto: string) => ({
  model: 'fuse/deepseek-chat',
  choices: [{ message: { content: texto }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 100, completion_tokens: 20 },
});

async function main() {
  const p = new FusaiProvedor('fai_live_teste123');
  t('não enxerga imagens', p.enxerga === false && p.nome === 'fusai');

  proxima = { status: 200, corpo: respostaOk('{"ok":true}') };
  const r = await p.conversar({ chamada: 'comandar_edicao', sistema: 's', usuario: 'u', maxTokens: 20_000, raciocinio: 'desligado' });
  const c = ultimo!.corpo;
  t('chama /chat/completions da FusAI com a chave', ultimo!.url.endsWith('/v1/chat/completions') && ultimo!.auth === 'Bearer fai_live_teste123');
  t('sem raciocínio: o chat, em JSON e temperatura zero', c.model === 'fuse/deepseek-chat' && (c.response_format as { type: string }).type === 'json_object' && c.temperature === 0);
  t('o teto de saída do chat (8192) vale sobre o pedido maior', c.max_tokens === 8192);
  t('nada do parâmetro da DeepSeek (thinking)', !('thinking' in c) && !('reasoning_effort' in c));
  t('o consumo vem do usage', r.consumo.inputTokens === 100 && r.consumo.outputTokens === 20 && r.texto === '{"ok":true}');

  proxima = { status: 200, corpo: { ...respostaOk('{"a":1}'), model: 'fuse/deepseek-reasoner' } };
  await p.conversar({ chamada: 'selecionar_trechos', sistema: 's', usuario: 'u', maxTokens: 4000, raciocinio: 'high' });
  t('com raciocínio: o reasoner, sem response_format nem temperatura', ultimo!.corpo.model === 'fuse/deepseek-reasoner' && !('response_format' in ultimo!.corpo) && !('temperature' in ultimo!.corpo));

  proxima = { status: 200, corpo: { model: 'fuse/deepseek-chat', choices: [{ message: { content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'x', arguments: '{}' } }] } }], usage: {} } };
  const f = await p.conversarComFerramentas({
    chamada: 'agente_de_edicao',
    mensagens: [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'a', reasoning_content: 'pensei' }],
    ferramentas: [{ type: 'function', function: { name: 'x', description: 'd', parameters: {} } }],
    maxTokens: 16000,
    raciocinio: 'high',
  });
  const msgs = ultimo!.corpo.messages as Array<Record<string, unknown>>;
  t('ferramentas: sempre no chat (o reasoner não chama ferramentas)', ultimo!.corpo.model === 'fuse/deepseek-chat' && Array.isArray(ultimo!.corpo.tools));
  t('ferramentas: o pensamento de outra volta não vai', !msgs.some((m) => 'reasoning_content' in m));
  t('ferramentas: as chamadas voltam', f.chamadas.length === 1 && f.chamadas[0]!.function.name === 'x');

  proxima = { status: 402, corpo: { error: { code: 'insufficient_funds', message: 'Saldo insuficiente.', type: 'billing_error' } } };
  let erro: unknown = null;
  try {
    await p.conversar({ chamada: 'comandar_edicao', sistema: 's', usuario: 'u', maxTokens: 100 });
  } catch (e) {
    erro = e;
  }
  t('sem crédito: erro que não se repete e manda recarregar', erro instanceof ErroDoProvedor && !erro.temporario && /Adicione créditos em Configurações/.test(erro.publico));

  proxima = { status: 503, corpo: { error: { code: 'model_unavailable', message: 'fora' } } };
  erro = null;
  try {
    await p.conversar({ chamada: 'comandar_edicao', sistema: 's', usuario: 'u', maxTokens: 100 });
  } catch (e) {
    erro = e;
  }
  t('5xx: erro que vale tentar de novo', erro instanceof ErroDoProvedor && erro.temporario);

  t('chave do projeto reconhecida', ehChaveDaFusai('fai_live_AbC123') && ehChaveDaFusai('fai_test_x9'));
  t('chave de agente e session token recusados', !ehChaveDaFusai('fai_agent_AbC123') && !ehChaveDaFusai('fai_st_x') && !ehChaveDaFusai('sk-abc'));
  t('modelo não liberado: diz onde liberar', /Modelos permitidos/.test(mensagemDaFusai(403, 'model_not_allowed')));

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail) process.exit(1);
}

void main();
