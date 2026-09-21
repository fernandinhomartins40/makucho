// ============================================================
// Tela inicial — a jornada da seção 16 do contexto mestre.
//
// A ação principal é uma só: "+ NOVO VÍDEO". Tudo o mais é
// secundário, porque o produto existe para transformar uma gravação
// em um vídeo pronto — não para navegar por menus.
// ============================================================

import Link from 'next/link';

async function estadoDaApi(): Promise<'ok' | 'degradado' | 'fora'> {
  const url = `${process.env.INTERNAL_API_URL ?? 'http://studio-api:3001/api'}/health`;

  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!res.ok) return 'degradado';
    const dados = (await res.json()) as { services?: { database?: string } };
    return dados.services?.database === 'ok' ? 'ok' : 'degradado';
  } catch {
    return 'fora';
  }
}

export const dynamic = 'force-dynamic';

export default async function Home() {
  const api = await estadoDaApi();

  return (
    <main className="conteudo">
      <div className="linha entre" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ color: 'var(--azul)' }}>MAKUCHO Studio</h1>
          <p style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
            Seus vídeos, editados por IA
          </p>
        </div>

        <span className="etiqueta" title={`API: ${api}`}>
          <span
            className="ponto"
            style={{
              background:
                api === 'ok' ? 'var(--verde)' : api === 'degradado' ? 'var(--amarelo)' : 'var(--vermelho)',
            }}
          />
          {api === 'ok' ? 'no ar' : api === 'degradado' ? 'instável' : 'offline'}
        </span>
      </div>

      {/* A ação principal, em destaque: o produto existe para isto. */}
      <Link
        href="/editor"
        className="botao botao-largo"
        style={{ minHeight: 56, fontSize: 16, marginBottom: 24 }}
      >
        + Novo vídeo
      </Link>

      <h2 style={{ fontSize: 13, color: 'var(--texto-suave)' }}>COMO FUNCIONA</h2>

      <div className="pilha" style={{ marginBottom: 24 }}>
        {[
          {
            passo: '1',
            titulo: 'Planeje o roteiro',
            texto: 'Hook, problema, autoridade e CTA — a estrutura que segura quem assiste.',
            href: '/roteiros',
          },
          {
            passo: '2',
            titulo: 'Grave com teleprompter',
            texto: 'O texto sobe no ritmo da sua fala, com a intenção de cada bloco à vista.',
            href: '/teleprompter',
          },
          {
            passo: '3',
            titulo: 'A IA monta o vídeo',
            texto: 'Ela escolhe os trechos fortes e explica cada escolha. Você ajusta o que quiser.',
            href: '/editor',
          },
        ].map((item) => (
          <Link key={item.passo} href={item.href} className="cartao cartao-clicavel">
            <div className="linha" style={{ alignItems: 'flex-start' }}>
              <span
                aria-hidden
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  background: 'var(--azul)',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {item.passo}
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
                  {item.titulo}
                </div>
                <p style={{ fontSize: 12, color: 'var(--texto-suave)', lineHeight: 1.45 }}>
                  {item.texto}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Honestidade sobre o estado: o plano (seção 14) pede estados
          verdadeiros, e prometer o que não existe é pior que avisar. */}
      <div className="aviso aviso-atencao" style={{ marginBottom: 0 }}>
        O envio de vídeo e a análise por IA estão em construção. A estrutura de
        edição já funciona com um exemplo.
      </div>
    </main>
  );
}
