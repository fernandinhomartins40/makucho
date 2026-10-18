// ============================================================
// A cotação do dólar, para mostrar em reais o gasto da IA cobrada em
// dólar (a DeepSeek direta). O Studio guarda o gasto em dólar -- é o
// que o provedor cobra --, e a tela mostra em reais pela cotação do dia.
//
// Fontes, nesta ordem: Frankfurter (BCE, sem chave) e AwesomeAPI (que
// recusa por cota a partir do IP compartilhado da VPS). Sem nenhuma, a
// última cotação lida; sem ela, STUDIO_COTACAO_DOLAR ou um valor padrão
// -- a tela diz de onde veio.
// ============================================================

import { Logger } from '@nestjs/common';

export interface CotacaoDoDolar {
  /** Quantos reais vale um dólar. */
  reaisPorDolar: number;
  /** Data da cotação (AAAA-MM-DD), quando a fonte informa. */
  data: string | null;
  fonte: 'frankfurter' | 'awesomeapi' | 'padrao';
}

const VALIDADE_MS = 6 * 60 * 60_000;
const log = new Logger('CotacaoDoDolar');
let guardada: { cotacao: CotacaoDoDolar; em: number } | null = null;
let buscando: Promise<CotacaoDoDolar> | null = null;

const plausivel = (v: number) => Number.isFinite(v) && v > 1 && v < 20;

async function frankfurter(): Promise<CotacaoDoDolar> {
  const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=BRL', { signal: AbortSignal.timeout(6000) });
  const j = (await r.json()) as { date?: string; rates?: { BRL?: number } };
  const v = Number(j.rates?.BRL);
  if (!r.ok || !plausivel(v)) throw new Error(`frankfurter ${r.status}`);
  return { reaisPorDolar: v, data: j.date ?? null, fonte: 'frankfurter' };
}

async function awesomeapi(): Promise<CotacaoDoDolar> {
  const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', { signal: AbortSignal.timeout(6000) });
  const j = (await r.json()) as { USDBRL?: { bid?: string; create_date?: string } };
  const v = Number(j.USDBRL?.bid);
  if (!r.ok || !plausivel(v)) throw new Error(`awesomeapi ${r.status}`);
  return { reaisPorDolar: v, data: j.USDBRL?.create_date?.slice(0, 10) ?? null, fonte: 'awesomeapi' };
}

function padrao(): CotacaoDoDolar {
  const v = Number(process.env.STUDIO_COTACAO_DOLAR);
  return { reaisPorDolar: plausivel(v) ? v : 5.5, data: null, fonte: 'padrao' };
}

/** A cotação do dia (guardada por 6 h). Nunca falha. */
export async function cotacaoDoDolar(): Promise<CotacaoDoDolar> {
  if (guardada && Date.now() - guardada.em < VALIDADE_MS) return guardada.cotacao;
  buscando ??= (async () => {
    for (const fonte of [frankfurter, awesomeapi]) {
      try {
        const c = await fonte();
        guardada = { cotacao: c, em: Date.now() };
        return c;
      } catch (e) {
        log.warn(`cotação indisponível (${fonte.name}): ${e instanceof Error ? e.message : e}`);
      }
    }
    // Sem fonte agora: a última lida vale mais que o padrão.
    return guardada?.cotacao ?? padrao();
  })().finally(() => {
    buscando = null;
  });
  return buscando;
}
