// Healthcheck do container web. Responde sem tocar na API: serve para
// o Docker saber que o Next subiu, mesmo com o backend ainda iniciando.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
}
