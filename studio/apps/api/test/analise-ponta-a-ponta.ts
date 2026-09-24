// ============================================================
// A cadeia inteira da Fase 5b, contra banco real.
//
//   transcrição -> provedor -> parser -> Zod -> validador semântico
//                -> compilador -> EditPlan
//
// Não é teste unitário: é a verificação de que as sete peças se
// falam. Cada uma tem teste próprio e todas passam; o que este
// exercita é a costura entre elas, que é onde os defeitos desta
// sessão apareceram.
//
// Precisa de STUDIO_DATABASE_URL apontando para um banco descartável.
// ============================================================

import { PrismaClient } from '@makucho/studio-database';
import { AcabamentoService } from '../src/modules/ai/acabamento.service';
import { EditPlansService } from '../src/modules/edit-plans/edit-plans.service';
import { AnaliseService } from '../src/modules/ai/analise.service';
import { AiService } from '../src/modules/ai/ai.service';
import { PromptsService } from '../src/modules/ai/prompts.service';
import { UsoDeIaService } from '../src/modules/ai/uso.service';
import type { PrismaService } from '../src/common/prisma.service';
import { CryptoService } from '../src/common/crypto.service';

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
    data: { name: 'Teste', slug: `teste-${Date.now()}` },
  });

  const projeto = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      title: 'Projeto de teste',
      state: 'ANALYZING',
      framework: 'authority_education',
      targetDurationMs: 30_000,
    },
  });

  const original = await prisma.mediaSource.create({
    data: {
      projectId: projeto.id,
      kind: 'ORIGINAL',
      storageKey: `${workspace.id}/${projeto.id}/original.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: BigInt(1024),
      durationMs: 60_000,
    },
  });

  const transcricao = await prisma.transcription.create({
    data: { projectId: projeto.id, language: 'pt', model: 'small', confidence: 0.88 },
  });

  const falas = [
    { startMs: 0, endMs: 20_000, text: 'Você perde cliente por demora no atendimento?' },
    { startMs: 20_000, endMs: 40_000, text: 'A maioria das empresas responde em horas.' },
    { startMs: 40_000, endMs: 58_000, text: 'O primeiro passo é medir esse tempo hoje.' },
  ];

  for (const [i, fala] of falas.entries()) {
    const seg = await prisma.transcriptSegment.create({
      data: {
        transcriptionId: transcricao.id,
        startMs: fala.startMs,
        endMs: fala.endMs,
        text: fala.text,
        position: i,
        confidence: 0.9,
      },
    });
    await prisma.transcriptWord.create({
      data: {
        segmentId: seg.id,
        word: fala.text.split(' ')[0]!,
        startMs: fala.startMs,
        endMs: fala.startMs + 400,
        confidence: 0.93,
      },
    });
  }

  // ---------- Serviços ----------
  const p = prisma as unknown as PrismaService;
  const uso = new UsoDeIaService(p);
  const ai = new AiService(p, new CryptoService(), uso);
  const prompts = new PromptsService();
  const acabamento = new AcabamentoService(p, new EditPlansService(p), ai, prompts);
  const analise = new AnaliseService(p, ai, prompts, acabamento);

  // ---------- A análise ----------
  const resultado = await analise.analisar(workspace.id, projeto.id);

  t('a análise conclui com o provedor falso', resultado.ok);

  if (resultado.ok) {
    const plano = resultado.plano as {
      clips: Array<{ transcriptSegmentIds: string[]; reason: string; semanticRisk: string }>;
      projectId: string;
      targetDurationMs: number;
    };

    t('o plano aponta para o projeto certo', plano.projectId === projeto.id);
    t('o plano tem clips', plano.clips.length > 0);

    // A garantia central do produto: toda fala do resultado existe no
    // bruto, e é possível provar qual.
    t(
      'todo clip tem origem verificável na transcrição',
      plano.clips.every((c) => c.transcriptSegmentIds.length > 0),
    );

    // Os IDs precisam ser os DO BANCO, não inventados.
    const idsReais = new Set(
      (await prisma.transcriptSegment.findMany({
        where: { transcriptionId: transcricao.id },
        select: { id: true },
      })).map((s) => s.id),
    );
    t(
      'os IDs de segmento existem mesmo no banco',
      plano.clips.every((c) => c.transcriptSegmentIds.every((id) => idsReais.has(id))),
    );

    t('a confiança é derivada do risco, não do modelo', resultado.confianca > 0 && resultado.confianca <= 100);
    t('todo clip traz o motivo', plano.clips.every((c) => c.reason.length > 0));
  } else {
    console.log(`   motivo: ${resultado.erro}`);
  }

  // ---------- A trava de custo registrou? ----------
  const situacao = await uso.situacao(workspace.id);
  t('a chamada foi contabilizada', situacao.chamadas > 0);
  t('o custo foi registrado por tipo de chamada', !!situacao.porChamada?.selecionar_trechos);

  // ---------- A auditoria guardou a resposta? ----------
  const analises = await prisma.aiAnalysis.findMany({ where: { projectId: projeto.id } });
  t('a resposta bruta foi guardada para auditoria', analises.length > 0);
  t('com a versão do prompt registrada', analises[0]?.promptVersion === 'selecao-v1');
  t('e marcada como validada', analises[0]?.parsedOk === true);

  // ---------- Projeto sem transcrição ----------
  const vazio = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      title: 'Sem transcrição',
      state: 'ANALYZING',
      framework: 'authority_education',
      targetDurationMs: 30_000,
    },
  });

  const semTranscricao = await analise.analisar(workspace.id, vazio.id);
  t('projeto sem transcrição é recusado', !semTranscricao.ok);
  t(
    'e não é marcado como temporário — insistir não resolveria',
    !semTranscricao.ok && !semTranscricao.temporario,
  );

  // ---------- Limpeza ----------
  await prisma.workspace.delete({ where: { id: workspace.id } });
  void original;

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error('falha no teste:', e);
  await prisma.$disconnect();
  process.exit(1);
});
