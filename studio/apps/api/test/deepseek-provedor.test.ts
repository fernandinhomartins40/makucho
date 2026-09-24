// ============================================================
// O corpo que o adapter manda à DeepSeek, contra um servidor local.
//
// A API mudou em 2026: `deepseek-chat`/`deepseek-reasoner` foram
// desligados e o raciocínio virou parâmetro, LIGADO por padrão. Um
// corpo errado não falha em teste nenhum sem rede — falha em produção,
// ou pior, funciona pagando raciocínio que ninguém pediu. Este teste
// confere o corpo de verdade.
//
// Rodar: npx tsx test/deepseek-provedor.test.ts
// ============================================================

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const corpos: Array<Record<string, unknown>> = [];
const servidor = createServer((req, res) => {
  let dados = '';
  req.on('data', (c) => (dados += c));
  req.on('end', () => {
    corpos.push(JSON.parse(dados));
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [{ message: { content: '{"ok":true}', reasoning_content: 'pensando...' } }],
        usage: { prompt_tokens: 1000, completion_tokens: 300, prompt_cache_hit_tokens: 800 },
      }),
    );
  });
});

async function main() {
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

  // Importado depois do ambiente: a URL base é lida na carga do módulo.
  const { DeepseekProvedor } = await import('../src/modules/ai/deepseek.provedor');
  const provedor = new DeepseekProvedor('sk-teste', 'deepseek-flash');

  const direto = await provedor.conversar({
    chamada: 'gerar_roteiro',
    sistema: 'sistema',
    usuario: 'usuario',
    maxTokens: 500,
    raciocinio: 'desligado',
  });
  const semRaciocinio = corpos[0]!;
  t('usa o modelo atual, não os nomes desligados', semRaciocinio.model === 'deepseek-flash');
  t('sem raciocínio: desliga explicitamente (vem ligado por padrão)', JSON.stringify(semRaciocinio.thinking) === '{"type":"disabled"}');
  t('sem raciocínio: temperatura 0', semRaciocinio.temperature === 0);
  t('sem raciocínio: modo JSON', JSON.stringify(semRaciocinio.response_format) === '{"type":"json_object"}');
  t('lê o texto da resposta, não o raciocínio', direto.texto === '{"ok":true}');
  t('lê os tokens em cache', direto.consumo.tokensEmCache === 800);

  await provedor.conversar({
    chamada: 'selecionar_trechos',
    sistema: 'sistema',
    usuario: 'usuario',
    maxTokens: 500,
    raciocinio: 'high',
  });
  const comRaciocinio = corpos[1]!;
  t('com raciocínio: liga e pede o esforço', JSON.stringify(comRaciocinio.thinking) === '{"type":"enabled"}' && comRaciocinio.reasoning_effort === 'high');
  t('com raciocínio: sem temperature (não suportado)', !('temperature' in comRaciocinio));
  t('com raciocínio: sem response_format (não suportado)', !('response_format' in comRaciocinio));

  servidor.close();
  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail > 0) process.exit(1);
}

void main().then(() => {
  console.log(`
${ok} ok, ${fail} falha(s)`);
  if (fail > 0) process.exit(1);
});
