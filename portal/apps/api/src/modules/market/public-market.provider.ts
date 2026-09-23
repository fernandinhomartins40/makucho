import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { SettingsService } from '../settings/settings.service';
import type { CotacaoExterna, MarketDataProvider } from './market-data.provider';

/**
 * Cotações automáticas a partir de fontes públicas, sem cadastro manual.
 *
 * - Dólar, Euro, Bitcoin: AwesomeAPI (economia.awesomeapi.com.br), sem chave.
 * - Selic (meta, série 432) e IPCA 12 meses (série 13522): API SGS do
 *   Banco Central, sem chave.
 * - Ibovespa (^BVSP): brapi.dev quando há token — o salvo no painel
 *   (Mercado → Fonte do Ibovespa) ou, na falta dele, MARKET_DATA_API_KEY
 *   (plano gratuito: 15 mil req/mês); sem token, o endpoint de gráfico do
 *   Yahoo Finance, que é público mas não oficial e pode mudar sem aviso.
 *
 * Cada fonte é consultada isoladamente: a falha de uma não impede as
 * outras, e o indicador que falhar mantém o último valor gravado.
 */

type Fonte = (simbolo: string) => Promise<CotacaoExterna | null>;

const TIMEOUT_MS = 8000;

async function json<T>(url: string, headers: Record<string, string> = {}, timeoutMs = TIMEOUT_MS): Promise<T> {
  const resposta = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'MakuchoPortal/1.0', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resposta.ok) throw new Error(`${new URL(url).host} respondeu ${resposta.status}`);
  return (await resposta.json()) as T;
}

const numero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

@Injectable()
export class PublicMarketProvider implements MarketDataProvider {
  readonly nome = 'automático';
  private readonly logger = new Logger('MarketData');
  private readonly tokenAmbiente: string | undefined;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly settings: SettingsService,
  ) {
    this.tokenAmbiente = config.get('market', { infer: true }).apiKey?.trim() || undefined;
  }

  /** O token do painel vale mais que o do ambiente; lido a cada sincronização. */
  async tokenBrapi(): Promise<{ token: string; origem: 'painel' | 'ambiente' } | null> {
    const doPainel = await this.settings.obterSegredo('market.brapiToken').catch(() => null);
    if (doPainel) return { token: doPainel, origem: 'painel' };
    return this.tokenAmbiente ? { token: this.tokenAmbiente, origem: 'ambiente' } : null;
  }

  /** Consulta o Ibovespa com o token informado, para validar antes de salvar. */
  async testarBrapi(token: string): Promise<{ ok: true; valor: number } | { ok: false; mensagem: string }> {
    try {
      const resposta = await fetch('https://brapi.dev/api/quote/%5EBVSP', {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as {
        message?: string;
        results?: Array<{ regularMarketPrice?: number }>;
      };
      const valor = numero(corpo.results?.[0]?.regularMarketPrice);
      if (resposta.ok && valor !== null) return { ok: true, valor };
      return { ok: false, mensagem: corpo.message ?? `A brapi respondeu ${resposta.status}` };
    } catch (erro) {
      return { ok: false, mensagem: erro instanceof Error ? erro.message : 'Não foi possível falar com a brapi' };
    }
  }

  /** Qual fonte atende cada símbolo (pelo código gravado no indicador). */
  private fonte(simbolo: string): Fonte | null {
    const s = simbolo.toUpperCase();
    if (s.includes('IBOV') || s === '^BVSP') return (x) => this.ibovespa(x);
    if (s.includes('USD') && !s.includes('BTC')) return (x) => this.moeda(x, 'USD-BRL');
    if (s.includes('EUR')) return (x) => this.moeda(x, 'EUR-BRL');
    if (s.includes('BTC')) return (x) => this.moeda(x, 'BTC-USD');
    if (s.includes('SELIC')) return (x) => this.serieBcb(x, 432);
    if (s.includes('IPCA')) return (x) => this.serieBcb(x, 13522);
    return null;
  }

  async cotacoes(simbolos: string[]): Promise<CotacaoExterna[]> {
    const tarefas = simbolos
      .map((simbolo) => ({ simbolo, fonte: this.fonte(simbolo) }))
      .filter((t): t is { simbolo: string; fonte: Fonte } => t.fonte !== null);

    const resultados = await Promise.allSettled(tarefas.map((t) => t.fonte(t.simbolo)));
    const cotacoes: CotacaoExterna[] = [];
    resultados.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) cotacoes.push(r.value);
      else if (r.status === 'rejected') {
        this.logger.warn(
          `Sem cotação para ${tarefas[i]!.simbolo}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        );
      }
    });
    return cotacoes;
  }

  private async moeda(simbolo: string, par: string): Promise<CotacaoExterna | null> {
    const chave = par.replace('-', '');
    const dados = await json<Record<string, { bid: string; pctChange: string; varBid: string; timestamp: string }>>(
      `https://economia.awesomeapi.com.br/json/last/${par}`,
    );
    const c = dados[chave];
    const valor = numero(c?.bid);
    if (!c || valor === null) return null;
    return {
      symbol: simbolo,
      value: valor,
      changePercent: numero(c.pctChange),
      changeAbsolute: numero(c.varBid),
      quotedAt: numero(c.timestamp) ? new Date(Number(c.timestamp) * 1000) : null,
      source: 'AwesomeAPI',
    };
  }

  private async ibovespa(simbolo: string): Promise<CotacaoExterna | null> {
    const brapi = await this.tokenBrapi();
    if (brapi) {
      // Token vencido ou limite mensal estourado: cai para o Yahoo abaixo.
      const dados = await json<{
        results?: Array<{ regularMarketPrice: number; regularMarketChangePercent: number; regularMarketChange: number; regularMarketTime: string }>;
      }>('https://brapi.dev/api/quote/%5EBVSP', { Authorization: `Bearer ${brapi.token}` }).catch((erro: unknown) => {
        this.logger.warn(`brapi indisponível, usando Yahoo: ${erro instanceof Error ? erro.message : String(erro)}`);
        return { results: undefined };
      });
      const r = dados.results?.[0];
      if (r && numero(r.regularMarketPrice) !== null) {
        return {
          symbol: simbolo,
          value: r.regularMarketPrice,
          changePercent: numero(r.regularMarketChangePercent),
          changeAbsolute: numero(r.regularMarketChange),
          quotedAt: r.regularMarketTime ? new Date(r.regularMarketTime) : null,
          source: 'brapi',
        };
      }
    }

    const dados = await json<{
      chart?: { result?: Array<{ meta: { regularMarketPrice: number; chartPreviousClose?: number; previousClose?: number; regularMarketTime?: number } }> };
    }>('https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=1d&interval=1d', {
      // Sem User-Agent de navegador o Yahoo responde 429.
      'User-Agent': 'Mozilla/5.0 (compatible; MakuchoPortal/1.0)',
    });
    const meta = dados.chart?.result?.[0]?.meta;
    const valor = numero(meta?.regularMarketPrice);
    if (!meta || valor === null) return null;
    const anterior = numero(meta.chartPreviousClose ?? meta.previousClose);
    return {
      symbol: simbolo,
      value: valor,
      changePercent: anterior ? ((valor - anterior) / anterior) * 100 : null,
      changeAbsolute: anterior ? valor - anterior : null,
      quotedAt: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : null,
      source: 'Yahoo Finance',
    };
  }

  /** Taxas do Banco Central: a variação é em pontos percentuais, não em %. */
  private async serieBcb(simbolo: string, serie: number): Promise<CotacaoExterna | null> {
    const dados = await json<Array<{ data: string; valor: string }>>(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/2?formato=json`,
      {},
      // A API do Banco Central costuma demorar mais que as outras.
      15000,
    );
    const atual = dados.at(-1);
    const anterior = dados.length > 1 ? dados.at(-2) : undefined;
    const valor = numero(atual?.valor);
    if (!atual || valor === null) return null;
    const valorAnterior = numero(anterior?.valor);
    return {
      symbol: simbolo,
      value: valor,
      changePercent: null,
      changeAbsolute: valorAnterior === null ? null : Number((valor - valorAnterior).toFixed(4)),
      // A data da série é a vigência (Selic) ou o mês de referência (IPCA),
      // não o momento da consulta: registramos a hora da sincronização.
      quotedAt: null,
      source: 'Banco Central',
    };
  }
}
