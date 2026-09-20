import {
  scopedWhere,
  assertOwnership,
  assertCanWrite,
  assertIsOwner,
} from '../src/common/tenant';
import type { TenantContext } from '../src/common/tenant';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const alice: TenantContext = { userId: 'u1', workspaceId: 'ws-alice', role: 'OWNER' };
const bob: TenantContext = { userId: 'u2', workspaceId: 'ws-bob', role: 'EDITOR' };
const leitor: TenantContext = { userId: 'u3', workspaceId: 'ws-alice', role: 'VIEWER' };

// ============================================================
// Criterio de aceite da Fase 1: dois usuarios de workspaces
// distintos nao acessam dados um do outro.
// ============================================================

// --- O filtro sempre entra ---
t(
  'scopedWhere injeta o workspace do requisitante',
  scopedWhere(alice).workspaceId === 'ws-alice',
);

t(
  'scopedWhere preserva os demais criterios',
  (() => {
    const w = scopedWhere(alice, { state: 'DRAFT' });
    return w.workspaceId === 'ws-alice' && w.state === 'DRAFT';
  })(),
);

// O ponto central: um workspaceId vindo do cliente nao pode prevalecer
// sobre o do token. Se prevalecesse, bastaria trocar um campo no corpo
// da requisicao para ler dados de outro cliente.
t(
  'workspaceId do cliente nao sobrescreve o do token',
  scopedWhere(alice, { workspaceId: 'ws-bob' } as Record<string, unknown>).workspaceId ===
    'ws-alice',
);

// --- Posse de registro ja carregado ---
const projetoDaAlice = { workspaceId: 'ws-alice' };
const projetoDoBob = { workspaceId: 'ws-bob' };

t(
  'dono acessa o proprio registro',
  (() => {
    try { assertOwnership(alice, projetoDaAlice); return true; } catch { return false; }
  })(),
);

t(
  'alice NAO acessa registro do bob',
  (() => {
    try { assertOwnership(alice, projetoDoBob); return false; } catch { return true; }
  })(),
);

t(
  'bob NAO acessa registro da alice',
  (() => {
    try { assertOwnership(bob, projetoDaAlice); return false; } catch { return true; }
  })(),
);

// Responder 404 (e nao 403) evita confirmar que o recurso existe:
// com 403, um atacante mapeia IDs validos de outros clientes por
// tentativa e erro.
t(
  'recurso de outro workspace responde 404, nao 403',
  (() => {
    try { assertOwnership(alice, projetoDoBob); return false; }
    catch (e) { return (e as { status?: number }).status === 404; }
  })(),
);

t(
  'registro inexistente tambem responde 404',
  (() => {
    try { assertOwnership(alice, null); return false; }
    catch (e) { return (e as { status?: number }).status === 404; }
  })(),
);

// --- Papeis ---
t(
  'OWNER escreve',
  (() => { try { assertCanWrite(alice); return true; } catch { return false; } })(),
);

t(
  'EDITOR escreve',
  (() => { try { assertCanWrite(bob); return true; } catch { return false; } })(),
);

t(
  'VIEWER NAO escreve',
  (() => { try { assertCanWrite(leitor); return false; } catch { return true; } })(),
);

t(
  'VIEWER recusado com 403, nao 404',
  (() => {
    try { assertCanWrite(leitor); return false; }
    catch (e) { return (e as { status?: number }).status === 403; }
  })(),
);

t(
  'apenas OWNER em acao restrita',
  (() => {
    const owner = (() => { try { assertIsOwner(alice); return true; } catch { return false; } })();
    const editor = (() => { try { assertIsOwner(bob); return false; } catch { return true; } })();
    return owner && editor;
  })(),
);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
