// ============================================================
// Tela inicial do studio.
//
// Fase 1: valida a rota de rede ponta a ponta (DNS, SSL, nginx,
// porta 3097) e mostra o estado da API. As telas do produto entram
// nas fases seguintes.
// ============================================================

async function verificarApi(): Promise<{ ok: boolean; detalhe: string }> {
  // No servidor falamos com a API pelo nome do servico, sem sair para
  // a internet.
  const url = `${process.env.INTERNAL_API_URL ?? 'http://studio-api:3001/api'}/health`;

  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, detalhe: `HTTP ${res.status}` };
    const dados = (await res.json()) as { services?: { database?: string } };
    return {
      ok: dados.services?.database === 'ok',
      detalhe: dados.services?.database === 'ok' ? 'banco conectado' : 'banco indisponivel',
    };
  } catch {
    return { ok: false, detalhe: 'sem resposta' };
  }
}

export const dynamic = 'force-dynamic';

export default async function Home() {
  const api = await verificarApi();

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <h1 style={{ color: 'var(--azul)', fontSize: 32, letterSpacing: -0.5 }}>
          MAKUCHO Studio
        </h1>
        <p style={{ color: 'var(--texto-suave)', marginTop: 12, lineHeight: 1.5 }}>
          Editor inteligente de videos. Em construcao.
        </p>

        <div
          style={{
            marginTop: 32,
            padding: 16,
            background: 'var(--superficie)',
            border: '1px solid var(--borda)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: api.ok ? '#22c55e' : '#ef4444',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 14, color: 'var(--texto-suave)' }}>
            API: {api.detalhe}
          </span>
        </div>
      </div>
    </main>
  );
}
