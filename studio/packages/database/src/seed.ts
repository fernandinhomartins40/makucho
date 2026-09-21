// ============================================================
// Seed — primeiro usuário e workspace.
//
// O banco sobe com 24 tabelas vazias, e todas as rotas exigem
// autenticação. Sem este seed não há como entrar no produto: não
// existe rota de registro público, por decisão — o Studio é para um
// cliente, não um SaaS aberto.
//
// Roda com `pnpm --filter @makucho/studio-database seed`, e é
// IDEMPOTENTE: rodar duas vezes não duplica nem sobrescreve senha.
// ============================================================

import * as argon2 from 'argon2';
import { PrismaClient } from './generated';

const prisma = new PrismaClient();

/**
 * Parâmetros do argon2id.
 *
 * Os mesmos que o auth usa ao verificar. Divergir aqui produziria um
 * hash que o login não aceita — e o erro apareceria como "senha
 * incorreta", que manda procurar no lugar errado.
 */
const ARGON2 = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

async function main() {
  const email = (process.env.SEED_EMAIL ?? '').trim().toLowerCase();
  const senha = process.env.SEED_PASSWORD ?? '';
  const nome = process.env.SEED_NAME ?? 'Administrador';
  const workspace = process.env.SEED_WORKSPACE ?? 'MAKUCHO';

  if (!email || !senha) {
    console.error(
      'informe SEED_EMAIL e SEED_PASSWORD.\n' +
        'exemplo: SEED_EMAIL=voce@exemplo.com SEED_PASSWORD="…" pnpm seed',
    );
    process.exit(1);
  }

  // Oito caracteres é pouco, mas é o mínimo que não bloqueia um
  // primeiro acesso legítimo. A política de senha real é da Fase 8.
  if (senha.length < 8) {
    console.error('a senha precisa de ao menos 8 caracteres.');
    process.exit(1);
  }

  const existente = await prisma.studioUser.findUnique({
    where: { email },
    include: { memberships: true },
  });

  if (existente) {
    // Não reescreve a senha: um seed que sobrescreve credencial
    // transforma um comando de setup em ferramenta de invasão.
    console.log(`usuário ${email} já existe — nada a fazer.`);
    console.log(`workspaces: ${existente.memberships.length}`);
    return;
  }

  const passwordHash = await argon2.hash(senha, ARGON2);

  const criado = await prisma.$transaction(async (tx) => {
    // O slug identifica o workspace em URLs e chaves de storage:
    // acentos e espacos virariam escape em toda referencia.
    const slug = workspace
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'workspace';

    const espaco =
      (await tx.workspace.findFirst()) ??
      (await tx.workspace.create({ data: { name: workspace, slug } }));

    const usuario = await tx.studioUser.create({
      data: { email, passwordHash, name: nome },
    });

    await tx.membership.create({
      data: { userId: usuario.id, workspaceId: espaco.id, role: 'OWNER' },
    });

    // A cota de 10 GB do ADR 0003 precisa existir antes do primeiro
    // upload: sem a linha, a checagem de espaço não tem contra o que
    // comparar.
    await tx.retentionSettings.upsert({
      where: { workspaceId: espaco.id },
      create: { workspaceId: espaco.id },
      update: {},
    });

    return { usuario, espaco };
  });

  console.log(`usuário criado: ${criado.usuario.email}`);
  console.log(`workspace: ${criado.espaco.name} (${criado.espaco.id})`);
  console.log('papel: OWNER');
}

main()
  .catch((e) => {
    console.error('falha no seed:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
