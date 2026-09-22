// ============================================================
// As chamadas #1 e #2 contra banco real (Fase 5c).
//
// O teste unitário usa dublês de Prisma e mede a decisão do serviço.
// Este mede a costura: perfil de comunicação lido do banco, uso de IA
// contabilizado na tabela certa, roteiro gerado entrando pela mesma
// porta que um escrito à mão.
//
// Precisa de STUDIO_DATABASE_URL apontando para um banco descartável.
// ============================================================

import { PrismaClient } from '@makucho/studio-database';
import { scriptInputSchema } from '@makucho/studio-contracts';
import { AiService } from '../src/modules/ai/ai.service';
import { PromptsService } from '../src/modules/ai/prompts.service';
import { RoteiroService } from '../src/modules/ai/roteiro.service';
import { UsoDeIaService } from '../src/modules/ai/uso.service';
import { CryptoService } from '../src/common/crypto.service';
import type { PrismaService } from '../src/common/prisma.service';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const prisma = new PrismaClient();

async function main() {
  // ---------- Cenário ----------
  const workspace = await prisma.workspace.create({
    data: { name: 'Teste 5c', slug: `teste-5c-${Date.now()}` },
  });

  // Perfil com palavra banida e uma faixa de duração própria: é o que
  // distingue "o prompt leu o perfil" de "o prompt usou o padrão".
  await prisma.communicationProfile.create({
    data: {
      workspaceId: workspace.id,
      tone: 'provocativo',
      energy: 'alta',
      sentenceLen: 'curtas',
      preferredOpening: 'hook',
      allowedHooks: ['contrarian', 'dor'],
      allowedFrameworks: ['authority_education', 'pas'],
      selfIntroPolicy: 'nunca',
      storytellingLevel: 'moderado',
      humorLevel: 'nenhum',
      allowProfanity: false,
      ctaStyle: 'natural',
      targetDurationMinMs: 30_000,
      targetDurationMaxMs: 50_000,
      cutAggressiveness: 'alta',
      bannedWords: ['gurusinho'],
      removableFillers: [],
    },
  });

  const prismaService = prisma as unknown as PrismaService;
  const uso = new UsoDeIaService(prismaService);
  const ai = new AiService(prismaService, new CryptoService(), uso);
  const servico = new RoteiroService(prismaService, ai, new PromptsService());

  // ============================================================
  // #1 — gerar roteiro
  // ============================================================

  const gerado = await servico.gerar(workspace.id, {
    tema: 'demora no atendimento por WhatsApp',
  });

  t('o roteiro volta do serviço', gerado.roteiro.blocks.length >= 4);
  t(
    'e passa no scriptInputSchema -- a MESMA porta do roteiro manual',
    scriptInputSchema.safeParse(gerado.roteiro).success,
  );

  // O perfil do banco tem faixa 30s-50s: o meio é 40s, e o padrão
  // seria 60s. Se voltasse 60s, o perfil não teria sido lido.
  t(
    'a duração vem do perfil DO BANCO, não do padrão',
    gerado.roteiro.targetDurationMs === 40_000,
  );

  // ---------- O roteiro gerado é salvável ----------
  //
  // O ponto inteiro da #1: a tela salva pela rota de sempre. Se isso
  // falhar, existem dois formatos de roteiro no produto.
  const entrada = scriptInputSchema.parse(gerado.roteiro);
  const salvo = await prisma.script.create({
    data: {
      workspaceId: workspace.id,
      title: entrada.title,
      mode: entrada.mode,
      framework: entrada.framework,
      targetDurationMs: entrada.targetDurationMs,
      blocks: {
        create: entrada.blocks.map((b) => ({
          // MAIUSCULA porque o enum do Prisma e maiusculo e o do
          // contrato e minusculo. Quem converte e o ScriptsService;
          // aqui a escrita e direta, entao a conversao vem junto.
          role: b.role.toUpperCase() as never,
          goal: b.goal,
          text: b.text,
          position: b.position,
        })),
      },
    },
    include: { blocks: true },
  });

  t('o roteiro gerado é gravável sem conversão', salvo.blocks.length === entrada.blocks.length);
  t('e tem hook', salvo.blocks.some((b) => b.role === 'HOOK'));

  // ---------- O custo foi contabilizado ----------
  const periodo = new Date().toISOString().slice(0, 7);
  const usoGravado = await prisma.aiUsage.findFirst({
    where: { workspaceId: workspace.id, period: periodo, call: 'gerar_roteiro' },
  });

  t('o uso da #1 foi registrado na tabela', usoGravado !== null);
  t('com pelo menos uma chamada contada', (usoGravado?.calls ?? 0) >= 1);

  // ============================================================
  // #2 — sugestões
  // ============================================================

  const sugerido = await servico.sugerir(workspace.id, salvo.id);

  t('as sugestões voltam sem erro', Array.isArray(sugerido.sugestoes));
  t(
    'e cada índice aponta para um bloco que existe',
    sugerido.sugestoes.every((s) => s.blockIndex < salvo.blocks.length),
  );

  if (sugerido.sugestoes.length > 0) {
    t('cada sugestão traz o texto reescrito', sugerido.sugestoes.every((s) => s.replacementText));
  }

  const usoSugestoes = await prisma.aiUsage.findFirst({
    where: { workspaceId: workspace.id, period: periodo, call: 'sugerir_melhorias' },
  });
  t('o uso da #2 foi registrado', usoSugestoes !== null);

  // ---------- Isolamento entre workspaces ----------
  const outro = await prisma.workspace.create({
    data: { name: 'Outro', slug: `outro-5c-${Date.now()}` },
  });

  let recusou = false;
  try {
    await servico.sugerir(outro.id, salvo.id);
  } catch {
    recusou = true;
  }
  t('um roteiro de outro workspace é recusado', recusou);

  // ---------- O teto de gasto ----------
  //
  // Com o limite em zero, a chamada não pode acontecer. A #2 não
  // lança — devolve o motivo —, e é exatamente isso que a tela
  // precisa para não mostrar erro vermelho sem ninguém ter clicado.
  await prisma.aiCredential.create({
    data: {
      workspaceId: workspace.id,
      provider: 'deepseek',
      encryptedKey: 'x',
      iv: 'x',
      authTag: 'x',
      // Os primeiros caracteres da chave, que a tela mostra para a
      // pessoa reconhecer qual cadastrou sem revelar o resto.
      keyPrefix: 'sk-tes',
      isActive: true,
      monthlyLimitCents: 0,
    },
  });

  // Passa do intervalo mínimo de 20s sem esperar: outro roteiro.
  const outroScript = await prisma.script.create({
    data: {
      workspaceId: workspace.id,
      title: 'Segundo',
      mode: 'BULLETS',
      framework: 'authority_education',
      targetDurationMs: 40_000,
      blocks: { create: [{ role: 'HOOK', goal: 'g', text: 'Texto do hook.', position: 0 }] },
    },
  });

  const bloqueado = await servico.sugerir(workspace.id, outroScript.id);
  t('com o teto em zero, a #2 não devolve sugestão', bloqueado.sugestoes.length === 0);
  t('e diz o motivo em vez de lançar', (bloqueado.indisponivel ?? '').length > 0);

  // ---------- Limpeza ----------
  await prisma.workspace.deleteMany({ where: { id: { in: [workspace.id, outro.id] } } });

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
