// ============================================================
// Primeiro acesso e convite, contra banco real.
//
// As duas rotas que dão acesso ao produto, e o que elas precisam
// RECUSAR:
//
//   - o primeiro acesso se fecha depois do primeiro usuário;
//   - dois cadastros simultâneos não podem passar os dois;
//   - só OWNER convida — senão um EDITOR escala o próprio acesso;
//   - convite não reescreve senha de quem já existe: seria uma
//     tomada de conta disfarçada.
//
// Precisa de STUDIO_DATABASE_URL apontando para um banco descartável.
// ============================================================

import { PrismaClient } from '@makucho/studio-database';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/modules/auth/auth.service';
import type { PrismaService } from '../src/common/prisma.service';
import type { TenantContext } from '../src/common/tenant';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const prisma = new PrismaClient();

async function recusa(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'erro';
  }
}

async function main() {
  const jwt = new JwtService({ secret: 'teste-secret-com-32-caracteres-ok-mesmo' });
  const auth = new AuthService(prisma as unknown as PrismaService, jwt);

  // Banco zerado: é o estado de quem acabou de instalar.
  await prisma.studioUser.deleteMany();
  await prisma.workspace.deleteMany();

  // ---------- Primeiro acesso ----------

  t('com o banco vazio, o primeiro acesso é oferecido', await auth.precisaDePrimeiroAcesso());

  const senhaCurta = await recusa(() =>
    auth.criarPrimeiroAcesso({
      email: 'dono@exemplo.com',
      senha: 'curta',
      nome: 'Dono',
      workspace: 'MAKUCHO',
    }),
  );
  t('senha curta é recusada', senhaCurta !== null);
  t('e a recusa diz o mínimo', (senhaCurta ?? '').includes('12'));

  const primeiro = await auth.criarPrimeiroAcesso({
    email: 'Dono@Exemplo.com ',
    senha: 'SenhaForteDoDono2026',
    nome: 'Dono',
    workspace: 'MAKUCHO',
  });

  t('o primeiro acesso cria o usuário', Boolean(primeiro.user.id));
  // E-mail normalizado: sem isso "Dono@" e "dono@" seriam contas
  // diferentes, e o login falharia por maiúscula.
  t('o e-mail é normalizado', primeiro.user.email === 'dono@exemplo.com');
  t('e ele nasce OWNER', primeiro.membership.role === 'OWNER');

  const cota = await prisma.retentionSettings.findUnique({
    where: { workspaceId: primeiro.membership.workspaceId },
  });
  // Sem a cota, a checagem de espaço do primeiro upload não tem
  // contra o que comparar.
  t('a cota do workspace é criada junto', cota !== null);

  // ---------- A rota se fecha ----------

  t('depois do primeiro, o setup deixa de ser oferecido', !(await auth.precisaDePrimeiroAcesso()));

  const segundo = await recusa(() =>
    auth.criarPrimeiroAcesso({
      email: 'invasor@exemplo.com',
      senha: 'OutraSenhaForte2026',
      nome: 'Invasor',
      workspace: 'Outro',
    }),
  );
  t('um segundo primeiro-acesso é RECUSADO', segundo !== null);
  t('e a recusa orienta a pedir convite', /convite/i.test(segundo ?? ''));

  const quantos = await prisma.studioUser.count();
  t('e nada foi criado', quantos === 1);

  // ---------- Convite ----------

  const dono: TenantContext = {
    userId: primeiro.user.id,
    workspaceId: primeiro.membership.workspaceId,
    role: 'OWNER',
  };

  const convidado = await auth.convidar(dono, {
    email: 'editor@exemplo.com',
    senha: 'SenhaDoEditor2026',
    nome: 'Editor',
    role: 'EDITOR',
  });

  t('o OWNER consegue convidar', Boolean(convidado.id));
  t('com o papel pedido', convidado.role === 'EDITOR');

  // O convidado entra no MESMO workspace: um convite que cria
  // workspace novo seria outro produto.
  const vinculo = await prisma.membership.findFirst({
    where: { userId: convidado.id },
  });
  t('e no MESMO workspace de quem convidou', vinculo?.workspaceId === dono.workspaceId);

  // A senha do convidado funciona: se o hash divergisse do que o
  // login espera, o erro apareceria como "senha incorreta" e
  // mandaria procurar no lugar errado.
  const entrou = await auth.validateUser('editor@exemplo.com', 'SenhaDoEditor2026');
  t('e a senha do convidado funciona no login', entrou.user.id === convidado.id);

  // ---------- As recusas do convite ----------

  const porEditor: TenantContext = {
    userId: convidado.id,
    workspaceId: dono.workspaceId,
    role: 'EDITOR',
  };

  const escalada = await recusa(() =>
    auth.convidar(porEditor, {
      email: 'promovido@exemplo.com',
      senha: 'SenhaQualquer2026',
      nome: 'Promovido',
      role: 'OWNER',
    }),
  );
  // Sem isto, um EDITOR criaria um OWNER e escalaria o próprio
  // acesso pela porta da frente.
  t('um EDITOR NÃO pode convidar', escalada !== null);

  const repetido = await recusa(() =>
    auth.convidar(dono, {
      email: 'editor@exemplo.com',
      senha: 'SenhaNovaQualquer2026',
      nome: 'Outro',
      role: 'VIEWER',
    }),
  );
  t('convidar um e-mail que já existe é recusado', repetido !== null);

  // O ponto: a senha do existente NÃO foi reescrita. Seria uma
  // tomada de conta disfarçada de convite.
  const aindaEntra = await auth.validateUser('editor@exemplo.com', 'SenhaDoEditor2026');
  t('e a senha de quem já existia continua valendo', aindaEntra.user.id === convidado.id);

  const curtaNoConvite = await recusa(() =>
    auth.convidar(dono, {
      email: 'novo@exemplo.com',
      senha: 'curta',
      nome: 'Novo',
      role: 'VIEWER',
    }),
  );
  t('senha curta também é recusada no convite', curtaNoConvite !== null);

  // ---------- Limpeza ----------
  await prisma.studioUser.deleteMany();
  await prisma.workspace.deleteMany();

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
