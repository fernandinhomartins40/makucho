import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { obterIp } from '../../modules/audit/audit.service';

/**
 * Identificador de sessao para metricas (secoes 25 e 41).
 *
 * Combina IP + user agent + um segredo do servidor + a data. O resultado
 * distingue visitantes durante um dia sem que nada possa ser revertido para
 * o IP original, e a troca diaria impede montar um historico de longo prazo
 * de uma mesma pessoa. Isso e o que a LGPD chama de dado anonimizado.
 */
export function hashDeSessao(request: Request, segredo: string): string {
  const ip = obterIp(request);
  const ua = String(request.headers['user-agent'] ?? '');
  const dia = new Date().toISOString().slice(0, 10);

  return createHash('sha256').update(`${ip}|${ua}|${segredo}|${dia}`).digest('hex').slice(0, 64);
}

/** Referrer saneado: so a origem + caminho, sem query string. */
export function normalizarReferrer(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor) return null;
  try {
    const url = new URL(valor);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // A query string costuma carregar identificadores de campanha e, as
    // vezes, dados pessoais; guardamos apenas origem e caminho.
    return `${url.origin}${url.pathname}`.slice(0, 600);
  } catch {
    return null;
  }
}
