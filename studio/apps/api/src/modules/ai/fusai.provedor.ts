// ============================================================
// FusAI -- gateway de IA em reais, pago com Pix (https://fusai.com.br).
//
// O dono do Studio coloca créditos (Pix) na carteira da organização dele
// na FusAI, cadastra a chave do projeto (fai_live_...) nas Configurações
// e a IA do Studio passa a sair desse saldo: é o modo "uso próprio"
// (Carteira da organização) da FusAI. A recarga pode ser feita de dentro
// do Studio (creditos-de-ia.service.ts).
//
// A API é compatível com a da OpenAI. As diferenças para a DeepSeek
// direta, e por que existem:
//
//   - os modelos têm nome próprio (fuse/...) e são os liberados no
//     projeto da FusAI: o raciocínio vai para o reasoner (que não aceita
//     ferramentas nem `response_format`), o resto para o chat;
//   - não há o parâmetro `thinking` da DeepSeek: o modelo decide o modo;
//   - a saída tem teto por modelo (8 mil tokens no chat): o pedido maior
//     é cortado no teto, senão a FusAI recusa;
//   - nenhum modelo liberado enxerga imagem (`enxerga = false`): o
//     serviço de IA tira as imagens opcionais e pula as etapas de visão;
//   - sem crédito, 402 `insufficient_funds`: a tela manda recarregar.
// ============================================================

import { Logger } from '@nestjs/common';
import { ErroDoProvedor } from './provedor';
import type { ChamadaDeFerramenta, PedidoAoProvedor, PedidoComFerramentas, ProvedorDeIa, RespostaComFerramentas, RespostaDoProvedor } from './provedor';

export const URL_DA_FUSAI = process.env.FUSAI_BASE_URL ?? 'https://api.fusai.com.br/v1';

/** O modelo das chamadas sem raciocínio e das com ferramentas. */
const MODELO_RAPIDO = process.env.FUSAI_MODELO ?? 'fuse/deepseek-chat';
/** O modelo das chamadas que pedem raciocínio (sem ferramentas). */
const MODELO_COM_RACIOCINIO = process.env.FUSAI_MODELO_RACIOCINIO ?? 'fuse/deepseek-reasoner';

/** O teto de saída de cada modelo (max_output_tokens em /v1/models). */
const TETO_DE_SAIDA: Record<string, number> = {
  'fuse/deepseek-chat': 8192,
  'fuse/deepseek-reasoner': 32768,
};
const tetoDe = (modelo: string, pedido: number) => Math.min(pedido, TETO_DE_SAIDA[modelo] ?? 8192);

const TIMEOUT_MS = 120_000;
const TIMEOUT_DAS_FERRAMENTAS_MS = 240_000;
const TIMEOUT_COM_RACIOCINIO_MS = 300_000;

/** A chave da FusAI: fai_live_ (produção) ou fai_test_ (teste). */
export function ehChaveDaFusai(chave: string): boolean {
  return /^fai_(live|test)_[A-Za-z0-9]+$/.test(chave.trim());
}

type Uso = { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };

export class FusaiProvedor implements ProvedorDeIa {
  readonly nome = 'fusai';
  readonly enxerga = false;
  private readonly log = new Logger(FusaiProvedor.name);

  constructor(private readonly apiKey: string) {}

  async conversar(pedido: PedidoAoProvedor): Promise<RespostaDoProvedor> {
    const pensa = (pedido.raciocinio ?? 'desligado') !== 'desligado';
    const modelo = pensa ? MODELO_COM_RACIOCINIO : MODELO_RAPIDO;
    const dados = await this.pedir(
      {
        model: modelo,
        messages: [
          { role: 'system', content: pedido.sistema },
          { role: 'user', content: pedido.usuario },
        ],
        max_tokens: tetoDe(modelo, pedido.maxTokens),
        stream: false,
        // O reasoner não aceita temperatura nem saída em JSON; o parser dos
        // contratos tira a cerca de markdown e valida o JSON de qualquer forma.
        ...(pensa ? {} : { temperature: pedido.temperatura ?? 0, response_format: { type: 'json_object' } }),
      },
      pedido.tempoMaximoMs ?? (pensa ? TIMEOUT_COM_RACIOCINIO_MS : TIMEOUT_MS),
      pedido.sinal,
    );
    const escolha = dados.choices?.[0];
    const texto = escolha?.message?.content;
    if (!texto) {
      const pensouDemais = pensa && escolha?.finish_reason === 'length';
      throw new ErroDoProvedor(
        pensouDemais ? 'fusai pensou demais: o raciocínio gastou todo o teto de tokens' : 'fusai devolveu resposta sem conteúdo',
        'A IA devolveu uma resposta vazia. Tente de novo.',
        true,
      );
    }
    return {
      texto,
      consumo: {
        inputTokens: dados.usage?.prompt_tokens ?? Math.ceil((pedido.sistema.length + pedido.usuario.length) / 4),
        outputTokens: dados.usage?.completion_tokens ?? Math.ceil(texto.length / 4),
        tokensEmCache: dados.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        modelo: dados.model ?? modelo,
      },
    };
  }

  /** Uma volta com ferramentas: sempre no chat (o reasoner não chama ferramentas). */
  async conversarComFerramentas(pedido: PedidoComFerramentas): Promise<RespostaComFerramentas> {
    // O pensamento de outro provedor não vai: aqui não há `reasoning_content`.
    const mensagens = pedido.mensagens.map((m) => {
      if (m.role !== 'assistant' || m.reasoning_content === undefined) return m;
      const { reasoning_content: _fora, ...resto } = m;
      return resto;
    });
    const dados = await this.pedir(
      {
        model: MODELO_RAPIDO,
        messages: mensagens,
        tools: pedido.ferramentas,
        tool_choice: 'auto',
        max_tokens: tetoDe(MODELO_RAPIDO, pedido.maxTokens),
        stream: false,
        temperature: 0.2,
      },
      TIMEOUT_DAS_FERRAMENTAS_MS,
      pedido.sinal,
    );
    const msg = dados.choices?.[0]?.message;
    const texto = msg?.content ?? '';
    const chamadas = (msg?.tool_calls ?? []).filter((c) => c?.function?.name);
    if (!texto && !chamadas.length) {
      throw new ErroDoProvedor('fusai devolveu resposta vazia', 'A IA devolveu uma resposta vazia. Tente de novo.', true);
    }
    const entrada = JSON.stringify(pedido.mensagens).length + JSON.stringify(pedido.ferramentas).length;
    return {
      texto,
      chamadas,
      consumo: {
        inputTokens: dados.usage?.prompt_tokens ?? Math.ceil(entrada / 4),
        outputTokens: dados.usage?.completion_tokens ?? Math.ceil((texto.length + JSON.stringify(chamadas).length) / 4),
        tokensEmCache: dados.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        modelo: dados.model ?? MODELO_RAPIDO,
      },
    };
  }

  private async pedir(
    corpo: Record<string, unknown>,
    tempoMs: number,
    sinalDoChamador?: AbortSignal,
  ): Promise<{
    model?: string;
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ChamadaDeFerramenta[] }; finish_reason?: string }>;
    usage?: Uso;
  }> {
    const relogio = AbortSignal.timeout(tempoMs);
    const sinal = sinalDoChamador ? AbortSignal.any([sinalDoChamador, relogio]) : relogio;
    let resposta: Response;
    try {
      resposta = await fetch(`${URL_DA_FUSAI}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(corpo),
        signal: sinal,
      });
    } catch (e) {
      const abortado = e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
      throw new ErroDoProvedor(
        `falha de rede ao chamar a fusai: ${(e as Error).message}`,
        abortado ? 'A IA demorou demais para responder. Tente de novo.' : 'Não foi possível falar com o serviço de IA. Tente de novo em alguns minutos.',
        true,
      );
    }
    if (!resposta.ok) {
      const corpoDoErro = await resposta.text().catch(() => '');
      // O corpo vai para o log do servidor, sem nada com cara de chave.
      this.log.error(`fusai respondeu ${resposta.status} (${resposta.headers.get('x-fuse-request-id') ?? 'sem id'}): ${corpoDoErro.replace(/fai_[a-z]+_[A-Za-z0-9]+/g, '[chave]').slice(0, 400)}`);
      let codigo = '';
      let detalhe = '';
      try {
        const lido = JSON.parse(corpoDoErro) as { error?: { code?: string; message?: string } };
        codigo = lido.error?.code ?? '';
        detalhe = (lido.error?.message ?? '').replace(/fai_[a-z]+_[A-Za-z0-9]+/g, '[chave]').slice(0, 160);
      } catch {
        // Sem corpo legível: fica a mensagem pelo status.
      }
      throw new ErroDoProvedor(
        `fusai respondeu ${resposta.status}${codigo ? ` (${codigo})` : ''}`,
        mensagemDaFusai(resposta.status, codigo, detalhe),
        // 5xx e 429 passam; crédito, chave e modelo não: insistir só gasta.
        resposta.status >= 500 || resposta.status === 429,
      );
    }
    const dados = await resposta.json().catch(() => null);
    if (!dados) throw new ErroDoProvedor('fusai devolveu resposta ilegível', 'O serviço de IA devolveu uma resposta ilegível. Tente de novo.', true);
    return dados as Awaited<ReturnType<FusaiProvedor['pedir']>>;
  }
}

/** O que a tela mostra para cada falha da FusAI. */
export function mensagemDaFusai(status: number, codigo: string, detalhe = ''): string {
  if (codigo === 'insufficient_funds') return 'Acabaram os créditos de IA. Adicione créditos em Configurações → IA para continuar.';
  if (codigo === 'spend_limit_reached') return 'A chave de IA chegou ao limite de gasto do mês definido no painel da FusAI.';
  if (codigo === 'model_not_allowed') return 'O modelo de IA não está liberado no projeto da FusAI. Libere o DeepSeek Chat e o DeepSeek Reasoner em Projetos → Modelos permitidos.';
  if (codigo === 'account_suspended') return 'A conta da FusAI está suspensa. Fale com o suporte da FusAI.';
  if (status === 401 || codigo === 'invalid_api_key') return 'A chave da FusAI foi recusada. Confira a chave em Configurações → IA.';
  if (status === 403) return `A FusAI recusou o pedido${detalhe ? `: ${detalhe}` : '.'}`;
  if (status === 429) return 'O serviço de IA está recebendo pedidos demais. Tente em alguns minutos.';
  return `O serviço de IA falhou. Tente de novo em alguns minutos.${detalhe ? ` (FusAI: ${detalhe})` : ''}`;
}
