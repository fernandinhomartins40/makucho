// ============================================================
// A mesma senha do portal no Studio: a conferência pergunta ao login do
// portal, aceita só os papéis de gestão e encerra a sessão aberta lá.
// ============================================================

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { conferirNoPortal } from '../src/modules/auth/senha-do-portal';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const CONTAS: Record<string, { senha: string; role: string; status?: string; emailDevolvido?: string }> = {
  'admin@x.com': { senha: 'certa-123', role: 'ADMIN' },
  'super@x.com': { senha: 'certa-123', role: 'SUPER_ADMIN' },
  'editor@x.com': { senha: 'certa-123', role: 'EDITOR' },
  'autor@x.com': { senha: 'certa-123', role: 'AUTHOR' },
  'suspenso@x.com': { senha: 'certa-123', role: 'ADMIN', status: 'SUSPENDED' },
  'outro@x.com': { senha: 'certa-123', role: 'ADMIN', emailDevolvido: 'intruso@x.com' },
};
const saidas: string[] = [];

async function main() {
  const servidor = createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      if (req.url === '/api/auth/logout') {
        saidas.push(String(req.headers.cookie ?? ''));
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        return;
      }
      if (req.url !== '/api/auth/login') return res.writeHead(404).end();
      const { email, password } = JSON.parse(corpo) as { email: string; password: string };
      const c = CONTAS[email];
      if (!c || c.senha !== password) return res.writeHead(401, { 'content-type': 'application/json' }).end('{"message":"E-mail ou senha incorretos"}');
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': ['makucho_access=AAA; HttpOnly; Path=/', 'makucho_refresh=RRR; HttpOnly; Path=/'] });
      res.end(JSON.stringify({ user: { email: c.emailDevolvido ?? email, name: 'Nome ' + email, role: c.role, status: c.status ?? 'ACTIVE' } }));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', () => ok()));
  const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`;

  const admin = await conferirNoPortal('Admin@X.com ', 'certa-123', url);
  t('admin do portal entra como dono do Studio (e-mail normalizado)', admin?.papel === 'OWNER' && admin.email === 'admin@x.com');
  t('a sessão aberta no portal é encerrada na hora', saidas.length === 1 && saidas[0] === 'makucho_access=AAA; makucho_refresh=RRR');
  t('superadmin também é dono', (await conferirNoPortal('super@x.com', 'certa-123', url))?.papel === 'OWNER');
  t('editor do portal entra como editor', (await conferirNoPortal('editor@x.com', 'certa-123', url))?.papel === 'EDITOR');
  t('autor do portal não entra', (await conferirNoPortal('autor@x.com', 'certa-123', url)) === null);
  t('conta suspensa não entra', (await conferirNoPortal('suspenso@x.com', 'certa-123', url)) === null);
  t('senha errada não entra', (await conferirNoPortal('admin@x.com', 'errada', url)) === null);
  t('e-mail que não existe não entra', (await conferirNoPortal('ninguem@x.com', 'certa-123', url)) === null);
  t('portal respondendo por outro e-mail: não aceita', (await conferirNoPortal('outro@x.com', 'certa-123', url)) === null);
  t('sem PORTAL_API_URL a conferência fica desligada', (await conferirNoPortal('admin@x.com', 'certa-123', '')) === null);
  servidor.close();
  t('portal fora do ar: não entra (e não quebra)', (await conferirNoPortal('admin@x.com', 'certa-123', url)) === null);

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  if (fail) process.exit(1);
}

void main();
