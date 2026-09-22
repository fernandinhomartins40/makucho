// ============================================================
// As chamadas #4 e #6 contra banco real (Fase 5d).
//
// O que este teste mede e a costura: o plano ativo lido do banco, os
// segmentos da transcricao virando `transcriptSegmentIds` do
// candidato, os silencios contados por MEDICAO e nao pelo modelo, e
// o isolamento entre workspaces.
//
// Precisa de STUDIO_DATABASE_URL apontando para um banco descartavel.
// ============================================================

import { PrismaClient } from '@makucho/studio-database';
import { aplicarOperacao, editPlanV1Schema } from '@makucho/studio-contracts';
import type { EditPlanV1 } from '@makucho/studio-contracts';
import { AiService } from '../src/modules/ai/ai.service';
import { PromptsService } from '../src/modules/ai/prompts.service';
import { RefinoService } from '../src/modules/ai/refino.service';
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
// 60s porque e a duracao que o provedor falso assume ao propor
// candidatos (ele nao recebe a duracao real). Com um video mais
// longo, o duble propoe num ponto onde a transcricao de teste nao tem
// segmento, e o servico descarta o candidato -- corretamente, mas o
// teste nunca chegaria a exercitar o caminho feliz.
const DURACAO = 60_000;

function planoDeTeste(projectId: string, mediaId: string): EditPlanV1 {
  return {
    schemaVersion: '1.0',
    projectId,
    sourceMediaId: mediaId,
    sourceDurationMs: DURACAO,
    fps: 30,
    canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
    targetDurationMs: 40_000,
    framework: 'authority_education',
    clips: [
      {
        id: 'c1',
        sourceStartMs: 0,
        sourceEndMs: 40_000,
        timelineStartMs: 0,
        role: 'hook',
        transcriptSegmentIds: ['placeholder'],
        semanticRisk: 'low',
        reason: 'Abre.',
      },
    ],
    captions: {
      enabled: true,
      styleId: 'padrao',
      wordsPerBlock: 3,
      position: 'bottom',
      highlightActiveWord: true,
      corrections: [],
    },
    overlays: [],
    soundEffects: [],
    transitions: [],
    render: {
      fps: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      crf: 23,
      audioBitrateKbps: 128,
      loudnessTargetLufs: -14,
    },
  };
}

async function main() {
  const w1 = await prisma.workspace.create({
    data: { name: 'Refino', slug: `refino-${Date.now()}` },
  });
  const w2 = await prisma.workspace.create({
    data: { name: 'Outro', slug: `refino-outro-${Date.now()}` },
  });

  const projeto = await prisma.project.create({
    data: { workspaceId: w1.id, title: 'Teste 5d', state: 'PROPOSAL_READY' },
  });

  const midia = await prisma.mediaSource.create({
    data: {
      projectId: projeto.id,
      kind: 'ORIGINAL',
      storageKey: `m/${projeto.id}/orig.mp4`,
      sizeBytes: 1024,
      durationMs: DURACAO,
      mimeType: 'video/mp4',
    },
  });

  // Transcrição com segmentos dentro E fora do corte: os de fora são
  // exatamente de onde os candidatos podem sair.
  const transcricao = await prisma.transcription.create({
    data: {
      projectId: projeto.id,
      language: 'pt',
      model: 'small',
      segments: {
        create: [
          { position: 0, startMs: 0, endMs: 20_000, text: 'Primeira parte do corte.' },
          { position: 1, startMs: 20_000, endMs: 40_000, text: 'Segunda parte do corte.' },
          // Os de fora cobrem 42-47s, que é onde o provedor falso
          // propõe: um candidato sem segmento correspondente aponta
          // para silêncio e é descartado — comportamento correto, mas
          // aqui o que se quer exercitar é o caminho feliz.
          { position: 2, startMs: 41_000, endMs: 48_000, text: 'Isto ficou de fora.' },
          { position: 3, startMs: 50_000, endMs: 58_000, text: 'Isto tambem ficou de fora.' },
        ],
      },
      // Silêncios detectados por MEDIÇÃO, na transcrição. A #6 os
      // conta; não os inventa.
      regions: {
        create: [
          { kind: 'silence', startMs: 48_000, endMs: 49_000 },
          { kind: 'silence', startMs: 58_000, endMs: 59_500 },
          // `speech` no meio de propósito: a contagem filtra por
          // `kind`, e sem uma região de outro tipo o filtro passaria
          // despercebido.
          { kind: 'speech', startMs: 0, endMs: 40_000 },
        ],
      },
    },
    include: { segments: true },
  });

  // Palavras: o refino precisa delas para ver onde a borda caiu.
  for (const seg of transcricao.segments) {
    await prisma.transcriptWord.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        segmentId: seg.id,
        startMs: seg.startMs + i * 1000,
        endMs: seg.startMs + i * 1000 + 900,
        word: `p${seg.position}_${i}`,
        confidence: 0.9,
      })),
    });
  }

  const plano = planoDeTeste(projeto.id, midia.id);
  plano.clips[0]!.transcriptSegmentIds = [transcricao.segments[0]!.id];

  await prisma.editPlan.create({
    data: {
      projectId: projeto.id,
      version: 1,
      origin: 'ai',
      isActive: true,
      document: plano as never,
    },
  });

  const prismaService = prisma as unknown as PrismaService;
  const uso = new UsoDeIaService(prismaService);
  const ai = new AiService(prismaService, new CryptoService(), uso);
  const servico = new RefinoService(prismaService, ai, new PromptsService());

  // ============================================================
  // #4 — candidatos
  // ============================================================

  const r4 = await servico.candidatos(w1.id, projeto.id);

  t('a chamada #4 devolve candidatos', Array.isArray(r4.candidatos));
  t('e contabiliza o custo', r4.custoCentavos >= 0);

  if (r4.candidatos.length > 0) {
    const c = r4.candidatos[0]!;

    // O ponto central: sem `transcriptSegmentIds`, a operação
    // `inserir` é recusada pelo contrato — fala sem origem.
    t('o candidato traz a origem na transcrição', c.transcriptSegmentIds.length > 0);
    t(
      'e os ids apontam para segmentos REAIS do banco',
      c.transcriptSegmentIds.every((id) => transcricao.segments.some((s) => s.id === id)),
    );
    t('o candidato cabe na gravação', c.sourceEndMs <= DURACAO);

    // O candidato não pode repetir o que já está na timeline.
    t(
      'e NÃO repete o que já está no corte',
      c.sourceStartMs >= 40_000 || c.sourceEndMs <= 0,
    );

    // A prova de que a peça se encaixa: o candidato vira uma
    // operação `inserir` aceita pelo contrato.
    const aplicado = aplicarOperacao(plano, {
      op: 'inserir',
      sourceStartMs: c.sourceStartMs,
      sourceEndMs: c.sourceEndMs,
      role: c.role,
      transcriptSegmentIds: c.transcriptSegmentIds,
      reason: c.reason,
      semanticRisk: c.semanticRisk,
    });

    t('o candidato vira uma operação `inserir` VÁLIDA', aplicado.ok);
    t('e a timeline ganha o trecho', aplicado.plan?.clips.length === 2);
    t(
      'e o plano resultante passa no schema',
      aplicado.plan !== undefined && editPlanV1Schema.safeParse(aplicado.plan).success,
    );
  }

  t(
    'com fala correspondente, o candidato sobrevive ao filtro',
    r4.candidatos.length === 1,
  );

  const usoC = await prisma.aiUsage.findFirst({
    where: {
      workspaceId: w1.id,
      period: new Date().toISOString().slice(0, 7),
      call: 'propor_candidatos',
    },
  });
  t('o uso da #4 foi registrado', usoC !== null);

  // ---------- Candidato que aponta para silêncio ----------
  //
  // O caso mais perigoso da #4, e o mesmo que a #3 já enfrentava: o
  // JSON é válido, os tempos existem na gravação, e o clipe sairia
  // MUDO. Só a conferência contra os segmentos pega.
  const semFala = await prisma.project.create({
    data: { workspaceId: w1.id, title: 'So silencio', state: 'PROPOSAL_READY' },
  });
  const midiaSemFala = await prisma.mediaSource.create({
    data: {
      projectId: semFala.id,
      kind: 'ORIGINAL',
      storageKey: `m/${semFala.id}/orig.mp4`,
      sizeBytes: 1024,
      durationMs: DURACAO,
      mimeType: 'video/mp4',
    },
  });
  const tSemFala = await prisma.transcription.create({
    data: {
      projectId: semFala.id,
      language: 'pt',
      model: 'small',
      // Fala apenas no início: onde o duble propõe (42-47s) não há
      // segmento nenhum.
      segments: {
        create: [{ position: 0, startMs: 0, endMs: 10_000, text: 'So o comeco tem fala.' }],
      },
    },
    include: { segments: true },
  });

  const planoSemFala = planoDeTeste(semFala.id, midiaSemFala.id);
  planoSemFala.clips[0]!.sourceEndMs = 10_000;
  planoSemFala.targetDurationMs = 10_000;
  planoSemFala.clips[0]!.transcriptSegmentIds = [tSemFala.segments[0]!.id];

  await prisma.editPlan.create({
    data: {
      projectId: semFala.id,
      version: 1,
      origin: 'ai',
      isActive: true,
      document: planoSemFala as never,
    },
  });

  const rSemFala = await servico.candidatos(w1.id, semFala.id);
  t(
    'candidato que aponta para silêncio é DESCARTADO',
    rSemFala.candidatos.length === 0,
  );

  // ============================================================
  // #6 — refino
  // ============================================================

  const r6 = await servico.refinar(w1.id, projeto.id);

  t('a chamada #6 devolve ajustes', Array.isArray(r6.ajustes));

  // Os silêncios vêm da MEDIÇÃO, não do modelo: dois no banco, dois
  // contados. Se viessem do modelo, o número seria outro.
  t('os silêncios vêm da medição, não do modelo', r6.silenciosRemoviveis === 2);

  if (r6.ajustes.length > 0) {
    const a = r6.ajustes[0]!;
    t('o ajuste aponta para um trecho que existe', a.clipIndex < plano.clips.length);
    t('e cabe na gravação', a.sourceEndMs <= DURACAO);
    t('e traz o motivo', a.reason.length > 0);

    // O ajuste vira `ajustar_corte`, a operação de sempre.
    const alvo = plano.clips[a.clipIndex]!;
    const aplicado = aplicarOperacao(plano, {
      op: 'ajustar_corte',
      clipId: alvo.id,
      sourceStartMs: a.sourceStartMs,
      sourceEndMs: a.sourceEndMs,
    });
    t('o ajuste vira uma operação `ajustar_corte` VÁLIDA', aplicado.ok);
  }

  const usoR = await prisma.aiUsage.findFirst({
    where: {
      workspaceId: w1.id,
      period: new Date().toISOString().slice(0, 7),
      call: 'refinar_cortes',
    },
  });
  t('o uso da #6 foi registrado', usoR !== null);

  // ============================================================
  // Isolamento e pré-condições
  // ============================================================

  let recusou = false;
  try {
    await servico.candidatos(w2.id, projeto.id);
  } catch {
    recusou = true;
  }
  t('projeto de outro workspace é recusado', recusou);

  // Projeto sem plano ativo: as duas chamadas operam sobre uma
  // timeline montada, e sem ela não há o que refinar.
  const semPlano = await prisma.project.create({
    data: { workspaceId: w1.id, title: 'Sem plano', state: 'ANALYZING' },
  });

  let semPlanoRecusou = false;
  let mensagem = '';
  try {
    await servico.refinar(w1.id, semPlano.id);
  } catch (e) {
    semPlanoRecusou = true;
    mensagem = e instanceof Error ? e.message : '';
  }
  t('projeto sem plano ativo é recusado', semPlanoRecusou);
  t('e a mensagem diz o que fazer', /análise|analise/i.test(mensagem));

  await prisma.workspace.deleteMany({ where: { id: { in: [w1.id, w2.id] } } });

  console.log(`\n${ok} ok, ${fail} falha(s)`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
