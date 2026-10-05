// ============================================================
// DeepSeek — a primeira implementação do adapter.
//
// A API é compatível com a da OpenAI no formato de mensagens, o que
// torna a troca por outro provedor desse formato uma questão de URL
// base e nome de modelo.
// ============================================================

import { Logger } from '@nestjs/common';
import { ErroDoProvedor } from './provedor';
import type { ChamadaDeFerramenta, PedidoAoProvedor, PedidoComFerramentas, ProvedorDeIa, RespostaComFerramentas, RespostaDoProvedor } from './provedor';

const URL_BASE = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';

/**
 * Teto de tempo de uma chamada.
 *
 * O reasoner pensa antes de responder e leva dezenas de segundos numa
 * transcrição longa. Dois minutos cobrem o caso legítimo; passar
 * disso é falha, e esperar mais só segura a fila.
 */
const TIMEOUT_MS = 120_000;

/** Uma volta do agente pode escrever uma animação inteira. */
const TIMEOUT_DAS_FERRAMENTAS_MS = 240_000;

/** Com raciocínio, o modelo pensa antes de responder: mais tempo. */
const TIMEOUT_COM_RACIOCINIO_MS = 300_000;

/** Até quando as voltas com ferramentas vão sem raciocínio (o provedor o recusou). */
let ferramentasSemRaciocinioAte = 0;

export class DeepseekProvedor implements ProvedorDeIa {
  readonly nome = 'deepseek';
  private readonly log = new Logger(DeepseekProvedor.name);

  constructor(
    private readonly apiKey: string,
    private readonly modelo: string,
  ) {}

  async conversar(pedido: PedidoAoProvedor): Promise<RespostaDoProvedor> {
    // Dois abortos somados: o do chamador (job cancelado) e o do
    // tempo. `AbortSignal.any` é o que evita ter de escolher entre um
    // e outro.
    const raciocinio = pedido.raciocinio ?? 'desligado';
    const relogio = AbortSignal.timeout(pedido.tempoMaximoMs ?? (raciocinio === 'desligado' ? TIMEOUT_MS : TIMEOUT_COM_RACIOCINIO_MS));
    const sinal = pedido.sinal ? AbortSignal.any([pedido.sinal, relogio]) : relogio;

    let resposta: Response;
    try {
      resposta = await fetch(`${URL_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelo,
          messages: [
            { role: 'system', content: pedido.sistema },
            // Com imagens, o conteúdo vira partes (formato OpenAI): o texto e
            // cada imagem como data URL.
            pedido.imagens?.length
              ? {
                  role: 'user',
                  content: [
                    { type: 'text', text: pedido.usuario },
                    ...pedido.imagens.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } })),
                  ],
                }
              : { role: 'user', content: pedido.usuario },
          ],
          max_tokens: pedido.maxTokens,
          stream: false,
          // O raciocínio vem LIGADO por padrão na API atual: desligar é
          // explícito. Ligado, o modo não aceita `temperature` nem
          // `response_format`; o parser dos contratos já tira a cerca
          // de markdown e valida o JSON de qualquer forma.
          ...(raciocinio === 'desligado'
            ? {
                thinking: { type: 'disabled' },
                // Zero: o mesmo pedido não pode dar resultado diferente
                // a cada execução sem motivo.
                temperature: pedido.temperatura ?? 0,
                response_format: { type: 'json_object' },
              }
            : { thinking: { type: 'enabled' }, reasoning_effort: raciocinio }),
        }),
        signal: sinal,
      });
    } catch (e) {
      const abortado = e instanceof Error && e.name === 'AbortError';
      throw new ErroDoProvedor(
        `falha de rede ao chamar o deepseek: ${(e as Error).message}`,
        abortado
          ? 'A IA demorou demais para responder. Tente de novo.'
          : 'Não foi possível falar com o serviço de IA. Tente de novo em alguns minutos.',
        true,
      );
    }

    if (!resposta.ok) {
      // O corpo do erro pode trazer a chave de volta em alguma
      // mensagem; ele vai para o log do servidor, nunca para a tela.
      const corpo = await resposta.text().catch(() => '');
      this.log.error(`deepseek respondeu ${resposta.status}: ${corpo.slice(0, 400)}`);

      // A mensagem da DeepSeek vai junto ("Model Not Exist", "Invalid
      // parameter"...): sem ela, um erro de configuracao vira "o servico
      // falhou" e ninguem consegue dizer o que fazer. Qualquer coisa com
      // cara de chave sai antes.
      let detalhe = '';
      try {
        const lido = JSON.parse(corpo) as { error?: { message?: string } };
        detalhe = (lido.error?.message ?? '').replace(/sk-[A-Za-z0-9*._-]+/g, '[chave]').slice(0, 160);
      } catch {
        detalhe = '';
      }

      throw new ErroDoProvedor(
        `deepseek respondeu ${resposta.status}`,
        `${mensagemPara(resposta.status)}${detalhe ? ` (DeepSeek, ${resposta.status}: ${detalhe})` : ` (DeepSeek respondeu ${resposta.status}.)`}`,
        // 4xx é problema de configuração ou de crédito: insistir não
        // resolve e ainda gasta a cota de requisições.
        resposta.status >= 500 || resposta.status === 429,
      );
    }

    const dados = (await resposta.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
    } | null;

    const texto = dados?.choices?.[0]?.message?.content;
    if (!texto) {
      throw new ErroDoProvedor(
        'deepseek devolveu resposta sem conteúdo',
        'A IA devolveu uma resposta vazia. Tente de novo.',
        true,
      );
    }

    return {
      texto,
      consumo: {
        // Quando o provedor omite o consumo, contar zero mentiria para
        // a trava de custo. A estimativa por caracteres erra, mas erra
        // para um lado conhecido — e quatro caracteres por token é a
        // regra prática para texto latino.
        inputTokens: dados.usage?.prompt_tokens ?? Math.ceil(
          (pedido.sistema.length + pedido.usuario.length) / 4,
        ),
        // `completion_tokens` já inclui o raciocínio, que é cobrado como
        // saída.
        outputTokens: dados.usage?.completion_tokens ?? Math.ceil(texto.length / 4),
        tokensEmCache: dados.usage?.prompt_cache_hit_tokens ?? 0,
        modelo: this.modelo,
      },
    };
  }

  /**
   * Uma volta da conversa com ferramentas.
   *
   * Com raciocínio, a IA pensa antes de decidir o que usar -- é o que a
   * faz dirigir em vez de seguir uma lista -- e o pensamento de cada volta
   * volta nas seguintes (`reasoning_content`). Se o provedor recusar o
   * pedido com raciocínio (400), a volta é refeita sem ele e as próximas
   * já vão sem, por uma hora: o pedido da pessoa não pode morrer por isso.
   */
  async conversarComFerramentas(pedido: PedidoComFerramentas): Promise<RespostaComFerramentas> {
    const quer = pedido.raciocinio && pedido.raciocinio !== 'desligado' && Date.now() > ferramentasSemRaciocinioAte;
    if (!quer) return this.voltaComFerramentas(pedido, 'desligado');
    try {
      return await this.voltaComFerramentas(pedido, pedido.raciocinio!);
    } catch (e) {
      if (!(e instanceof ErroDoProvedor) || e.temporario || !/\b400\b/.test(e.message)) throw e;
      this.log.warn(`ferramentas com raciocínio recusadas (${e.publico}); seguindo sem raciocínio por uma hora`);
      ferramentasSemRaciocinioAte = Date.now() + 60 * 60_000;
      return this.voltaComFerramentas(pedido, 'desligado');
    }
  }

  private async voltaComFerramentas(pedido: PedidoComFerramentas, raciocinio: NonNullable<PedidoComFerramentas['raciocinio']>): Promise<RespostaComFerramentas> {
  const pensando = raciocinio !== 'desligado';
  // Uma volta pode trazer uma animação inteira (html + css + script do
  // criar_animacao): mais longa que as outras respostas.
  const relogio = AbortSignal.timeout(pensando ? TIMEOUT_COM_RACIOCINIO_MS : TIMEOUT_DAS_FERRAMENTAS_MS);
  const sinal = pedido.sinal ? AbortSignal.any([pedido.sinal, relogio]) : relogio;
  const eu = this;
  // Sem raciocínio, o pensamento das voltas anteriores não vai.
  const mensagens = pensando
    ? pedido.mensagens
    : pedido.mensagens.map((m) => {
        if (m.role !== 'assistant' || m.reasoning_content === undefined) return m;
        const { reasoning_content: _fora, ...resto } = m;
        return resto;
      });
  let resposta: Response;
  try {
    resposta = await fetch(`${URL_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${eu.apiKey}` },
      body: JSON.stringify({
        model: eu.modelo,
        messages: mensagens,
        tools: pedido.ferramentas,
        tool_choice: 'auto',
        max_tokens: pedido.maxTokens,
        stream: false,
        ...(pensando ? { thinking: { type: 'enabled' }, reasoning_effort: raciocinio } : { thinking: { type: 'disabled' }, temperature: 0.2 }),
      }),
      signal: sinal,
    });
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError';
    throw new ErroDoProvedor(
      `falha de rede ao chamar o deepseek: ${(e as Error).message}`,
      abortado ? 'A IA demorou demais para responder. Tente de novo.' : 'Não foi possível falar com o serviço de IA. Tente de novo em alguns minutos.',
      true,
    );
  }
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    eu.log.error(`deepseek (ferramentas) respondeu ${resposta.status}: ${corpo.slice(0, 400)}`);
    let detalhe = '';
    try {
      detalhe = ((JSON.parse(corpo) as { error?: { message?: string } }).error?.message ?? '').replace(/sk-[A-Za-z0-9*._-]+/g, '[chave]').slice(0, 160);
    } catch {
      detalhe = '';
    }
    throw new ErroDoProvedor(
      `deepseek respondeu ${resposta.status}`,
      `${mensagemPara(resposta.status)}${detalhe ? ` (DeepSeek, ${resposta.status}: ${detalhe})` : ''}`,
      resposta.status >= 500 || resposta.status === 429,
    );
  }
  const dados = (await resposta.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null; tool_calls?: ChamadaDeFerramenta[] } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
  } | null;
  const msg = dados?.choices?.[0]?.message;
  const texto = msg?.content ?? '';
  const chamadas = (msg?.tool_calls ?? []).filter((c) => c?.function?.name);
  if (!texto && !chamadas.length) {
    throw new ErroDoProvedor('deepseek devolveu resposta vazia', 'A IA devolveu uma resposta vazia. Tente de novo.', true);
  }
  const entrada = JSON.stringify(pedido.mensagens).length + JSON.stringify(pedido.ferramentas).length;
  return {
    texto,
    chamadas,
    ...(pensando && msg?.reasoning_content ? { raciocinio: msg.reasoning_content } : {}),
    consumo: {
      inputTokens: dados?.usage?.prompt_tokens ?? Math.ceil(entrada / 4),
      outputTokens: dados?.usage?.completion_tokens ?? Math.ceil((texto.length + JSON.stringify(chamadas).length) / 4),
      tokensEmCache: dados?.usage?.prompt_cache_hit_tokens ?? 0,
      modelo: eu.modelo,
    },
  };
  }
}

/** O que a tela mostra para cada falha do provedor. */
function mensagemPara(status: number): string {
  if (status === 401 || status === 403) {
    return 'A chave de IA foi recusada. Confira a credencial nas configurações.';
  }
  if (status === 402) {
    return 'A conta de IA está sem créditos. Recarregue no painel do provedor.';
  }
  if (status === 429) {
    return 'O serviço de IA está recebendo pedidos demais. Tente em alguns minutos.';
  }
  return 'O serviço de IA falhou. Tente de novo em alguns minutos.';
}
