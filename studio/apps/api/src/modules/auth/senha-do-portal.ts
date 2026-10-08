// ============================================================
// A mesma senha do portal no Studio.
//
// Os bancos continuam separados (ADR 0002/0004: vazar um não compromete o
// outro). Quando a senha não confere no Studio, ele PERGUNTA ao portal,
// pela rede interna da VPS (makucho-net), usando o login do próprio
// portal: valem as regras de lá (bloqueio por tentativas, conta suspensa,
// auditoria). Se o portal aceita, a sessão que ele abriu é encerrada na
// hora -- o Studio só queria saber se a senha confere.
//
// Só os papéis de gestão do portal entram: SUPER_ADMIN e ADMIN viram dono
// do Studio; EDITOR, editor. AUTHOR não entra.
//
// PORTAL_API_URL (ex.: http://makucho-api:3001/api) liga a conferência;
// sem ela, o Studio só aceita a própria senha.
// ============================================================

export type PapelNoStudio = 'OWNER' | 'EDITOR';

export interface ContaDoPortal {
  email: string;
  nome: string;
  papel: PapelNoStudio;
}

const PAPEL_DO_PORTAL: Record<string, PapelNoStudio | undefined> = {
  SUPER_ADMIN: 'OWNER',
  ADMIN: 'OWNER',
  EDITOR: 'EDITOR',
};

/** Os cookies que o portal devolveu, para encerrar a sessão que ele abriu. */
function cookiesDe(resposta: Response): string {
  const lista = (resposta.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  return lista.map((c) => c.split(';')[0]).join('; ');
}

/**
 * A conta do portal, se o e-mail e a senha conferem lá e o papel dá acesso
 * ao Studio; `null` em qualquer outro caso (senha errada, papel sem
 * acesso, portal fora do ar, conferência desligada).
 */
export async function conferirNoPortal(email: string, senha: string, url = process.env.PORTAL_API_URL): Promise<ContaDoPortal | null> {
  if (!url) return null;
  const base = url.replace(/\/+$/, '');
  email = email.trim().toLowerCase();
  try {
    const resposta = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'makucho-studio' },
      body: JSON.stringify({ email, password: senha }),
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (resposta.status !== 200) return null;
    const corpo = (await resposta.json().catch(() => null)) as { user?: { email?: string; name?: string; role?: string; status?: string } } | null;
    // A sessão do portal não é usada: encerra (sem esperar além do necessário).
    const cookies = cookiesDe(resposta);
    if (cookies) {
      await fetch(`${base}/auth/logout`, { method: 'POST', headers: { cookie: cookies, 'user-agent': 'makucho-studio' }, redirect: 'error', signal: AbortSignal.timeout(5000) }).catch(() => undefined);
    }
    const u = corpo?.user;
    const papel = PAPEL_DO_PORTAL[u?.role ?? ''];
    if (!u?.email || !papel || (u.status && u.status !== 'ACTIVE')) return null;
    // O portal respondeu por OUTRO e-mail? Não aceita (nunca deveria acontecer).
    if (u.email.trim().toLowerCase() !== email) return null;
    return { email: u.email.trim().toLowerCase(), nome: u.name?.trim() || u.email, papel };
  } catch {
    return null;
  }
}
