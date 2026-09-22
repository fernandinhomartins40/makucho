// ============================================================
// Upload de assets contra banco e disco REAIS.
//
// O teste de unidade usa dublês e mede a decisão do serviço. Este
// mede a costura: o arquivo chega ao disco, o registro ao banco, o
// hash deduplica de verdade, e o isolamento entre workspaces vale.
//
// Precisa de STUDIO_DATABASE_URL apontando para um banco descartável.
// ============================================================

import { PrismaClient } from '@makucho/studio-database';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssetsService } from '../src/modules/assets/assets.service';
import { StorageService } from '../src/common/storage.service';
import type { PrismaService } from '../src/common/prisma.service';
import type { TenantContext } from '../src/common/tenant';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const prisma = new PrismaClient();

/** PNG mínimo válido, com dimensões e canal alfa no cabeçalho. */
function png(largura = 320, altura = 240): Buffer {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(largura, 16);
  b.writeUInt32BE(altura, 20);
  b.writeUInt8(8, 24);
  b.writeUInt8(6, 25); // RGBA
  return b;
}

async function main() {
  // O storage aponta para um diretório temporário: o teste grava
  // arquivos de verdade, e não pode sujar o storage do projeto.
  const raiz = mkdtempSync(join(tmpdir(), 'assets-teste-'));
  process.env.STORAGE_DISK_PATH = raiz;

  const storage = new StorageService();
  const servico = new AssetsService(prisma as unknown as PrismaService, storage);

  const w1 = await prisma.workspace.create({
    data: { name: 'Um', slug: `assets-um-${Date.now()}` },
  });
  const w2 = await prisma.workspace.create({
    data: { name: 'Dois', slug: `assets-dois-${Date.now()}` },
  });

  const tenant = (id: string) =>
    ({ workspaceId: id, userId: 'u1', role: 'OWNER' }) as unknown as TenantContext;

  // ---------- Upload ----------
  const enviado = await servico.enviar(tenant(w1.id), {
    kind: 'LOGO',
    // Nome com "../" de propósito: ele NUNCA pode virar caminho.
    originalName: '../../../etc/passwd.png',
    mimeDeclarado: 'image/png',
    conteudo: png(),
  });

  t('o upload é aceito', Boolean(enviado.id));

  const noBanco = await prisma.asset.findUnique({ where: { id: enviado.id } });
  t('o registro foi gravado no banco', noBanco !== null);
  t('com o workspace certo', noBanco?.workspaceId === w1.id);
  t('as dimensões foram lidas do PNG', noBanco?.widthPx === 320 && noBanco?.heightPx === 240);
  t('o canal alfa foi detectado', noBanco?.hasAlpha === true);

  // O nome com "../" ficou como METADADO; a chave saiu de dados
  // controlados.
  t('o nome perigoso ficou só como metadado', noBanco?.originalName.includes('..') === true);
  t(
    'e a chave NÃO contém o nome do usuário',
    noBanco?.storageKey.startsWith(`assets/${w1.id}/logo/`) === true &&
      !noBanco!.storageKey.includes('passwd'),
  );
  t('a chave não escapa da raiz', !noBanco!.storageKey.includes('..'));

  // ---------- O arquivo no disco ----------
  const caminho = join(raiz, noBanco!.storageKey);
  t('o arquivo existe no disco', existsSync(caminho));
  t('com o conteúdo enviado', readFileSync(caminho).equals(png()));

  const servido = await servico.arquivo(tenant(w1.id), enviado.id);
  t('o asset é servível', servido.tamanho === png().byteLength);
  t('com o MIME real, não o declarado', servido.mimeType === 'image/png');

  // ---------- Deduplicação pelo hash do conteúdo ----------
  const denovo = await servico.enviar(tenant(w1.id), {
    kind: 'LOGO',
    // Outro nome, mesmo conteúdo.
    originalName: 'outro-nome.png',
    mimeDeclarado: 'image/png',
    conteudo: png(),
  });

  t('reenviar o mesmo conteúdo reaproveita o registro', denovo.id === enviado.id);
  t('e diz que já existia', denovo.jaExistia === true);

  const quantos = await prisma.asset.count({ where: { workspaceId: w1.id } });
  t('não duplicou bytes no disco', quantos === 1);

  // Conteúdo diferente gera registro novo.
  const outro = await servico.enviar(tenant(w1.id), {
    kind: 'LOGO',
    originalName: 'segundo.png',
    mimeDeclarado: 'image/png',
    conteudo: png(500, 500),
  });
  t('conteúdo diferente gera asset novo', outro.id !== enviado.id);

  // ---------- Isolamento entre workspaces ----------
  let vazou = true;
  try {
    await servico.arquivo(tenant(w2.id), enviado.id);
  } catch {
    vazou = false;
  }
  t('um workspace NÃO alcança o asset do outro', !vazou);

  const doOutro = await servico.listar(tenant(w2.id));
  t('e a listagem do outro workspace vem vazia', doOutro.length === 0);

  const doPrimeiro = await servico.listar(tenant(w1.id));
  t('a listagem do dono traz os dois assets', doPrimeiro.length === 2);

  const soLogo = await servico.listar(tenant(w1.id), 'LOGO');
  t('o filtro por tipo funciona', soLogo.length === 2);
  const soMusica = await servico.listar(tenant(w1.id), 'MUSIC');
  t('e não devolve tipo diferente', soMusica.length === 0);

  // ---------- SVG com script, contra o disco ----------
  const svgMalicioso = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/auth/me")</script></svg>',
  );
  let recusou = false;
  try {
    await servico.enviar(tenant(w1.id), {
      kind: 'LOGO',
      originalName: 'logo.svg',
      mimeDeclarado: 'image/svg+xml',
      conteudo: svgMalicioso,
    });
  } catch {
    recusou = true;
  }

  t('SVG com script é recusado', recusou);
  const depois = await prisma.asset.count({ where: { workspaceId: w1.id } });
  t('e NADA foi gravado no banco', depois === 2);

  // ---------- Remoção desativa, não apaga ----------
  await servico.remover(tenant(w1.id), enviado.id);

  const desativado = await prisma.asset.findUnique({ where: { id: enviado.id } });
  t('remover apenas desativa o registro', desativado?.isActive === false);
  // O arquivo fica: um vídeo antigo pode ter sido gerado com esta
  // logo, e apagar tornaria impossível saber com que marca ele foi
  // feito.
  t('o arquivo continua no disco', existsSync(caminho));
  t('mas sai da listagem', (await servico.listar(tenant(w1.id))).length === 1);

  let sumiu = false;
  try {
    await servico.arquivo(tenant(w1.id), enviado.id);
  } catch {
    sumiu = true;
  }
  t('e deixa de ser servível', sumiu);

  // Reenviar o mesmo arquivo reativa: remover foi reversível.
  const reativado = await servico.enviar(tenant(w1.id), {
    kind: 'LOGO',
    originalName: 'volta.png',
    mimeDeclarado: 'image/png',
    conteudo: png(),
  });
  t('reenviar reativa o asset removido', reativado.id === enviado.id);
  t(
    'e ele volta à listagem',
    (await servico.listar(tenant(w1.id))).some((a) => a.id === enviado.id),
  );

  // ---------- Cota ----------
  const cota = await servico.cota(tenant(w1.id));
  t('a cota soma os assets ativos', cota.usadoBytes > 0);
  t('e tem teto declarado', cota.quotaBytes > cota.usadoBytes);

  // ---------- Limpeza ----------
  await prisma.workspace.deleteMany({ where: { id: { in: [w1.id, w2.id] } } });
  rmSync(raiz, { recursive: true, force: true });

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
