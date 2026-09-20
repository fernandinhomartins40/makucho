import { NextResponse } from 'next/server';

/**
 * Healthcheck do container (secao 37).
 *
 * O HEALTHCHECK do web.Dockerfile e o do compose consultam este
 * endereco. Sem ele o Docker recebia 404, marcava o container como
 * unhealthy mesmo com o portal servindo normalmente, e o deploy
 * abortava no bloco que espera os servicos ficarem saudaveis.
 *
 * Responde sem tocar na API: o objetivo e dizer se este processo
 * atende requisicoes, nao se as dependencias estao no ar. Um
 * healthcheck que depende do banco derruba o container do frontend
 * quando o problema esta em outro lugar.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'web',
    timestamp: new Date().toISOString(),
  });
}
