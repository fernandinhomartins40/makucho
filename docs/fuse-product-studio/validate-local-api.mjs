import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, '')];
    }),
);

const base = 'http://localhost:3001/api';
const results = [];
let cookies = '';
async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(cookies ? { cookie: cookies } : {}),
      ...init.headers,
    },
  });
  if (response.headers.getSetCookie().length) {
    cookies = response.headers.getSetCookie().map((item) => item.split(';')[0]).join('; ');
  }
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, body };
}

let tagId;
const unique = Date.now().toString(36);
try {
  const anonymous = await request('/auth/me');
  results.push(['anonymous me', anonymous.status]);
  const anonymousWrite = await request('/tags', {
    method: 'POST',
    body: JSON.stringify({ name: 'Tentativa anônima de validação' }),
  });
  results.push(['anonymous write denied', anonymousWrite.status]);
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }),
  });
  results.push(['login', login.status, login.body?.user?.role]);
  if (login.status !== 200) throw new Error('Login local falhou');
  const me = await request('/auth/me');
  results.push(['authenticated me', me.status, me.body?.role]);
  const created = await request('/tags', {
    method: 'POST',
    body: JSON.stringify({ name: `Validação local ${unique}` }),
  });
  tagId = created.body?.id;
  results.push(['create tag', created.status, Boolean(tagId)]);
  if (!tagId) throw new Error('Criação local da tag falhou');
  const updated = await request(`/tags/${tagId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: `Validação revisada ${unique}` }),
  });
  results.push(['update tag', updated.status, updated.body?.name]);
  const listed = await request(`/tags?search=${encodeURIComponent(unique)}`);
  results.push(['read persisted tag', listed.status, Array.isArray(listed.body) && listed.body.some((tag) => tag.id === tagId)]);
  const audited = await request('/audit?page=1&perPage=20&resource=tag');
  results.push(['audit trail', audited.status, JSON.stringify(audited.body).includes(tagId)]);
} finally {
  if (tagId) {
    const deleted = await request(`/tags/${tagId}`, { method: 'DELETE' });
    results.push(['delete local test tag', deleted.status]);
    const afterDelete = await request(`/tags?search=${encodeURIComponent(unique)}`);
    results.push(['test tag absent after delete', afterDelete.status, !JSON.stringify(afterDelete.body).includes(tagId)]);
  }
  console.log(JSON.stringify(results));
}
