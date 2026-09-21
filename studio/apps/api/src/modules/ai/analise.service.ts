// ============================================================
// Seleção de trechos e risco semântico (Fase 5b, chamadas #3 e #5).
//
// O coração do produto. A cadeia completa da seção 22 do contexto
// mestre acontece aqui:
//
//   transcrição -> DeepSeek -> parser -> Zod -> validador semântico
//                -> compilador -> EditPlan
//
// As chamadas #3 e #5 são uma só requisição, como a seção 26.7
// prevê: o modelo que escolhe o trecho é o mesmo que avalia o risco
// dele, e separar em duas chamadas dobraria o custo para obter um
// julgamento pior — a segunda perderia o contexto da escolha.
//
// NENHUMA falha aqui é terminal. O projeto volta para um estado de
// onde dá para tentar de novo, porque a gravação continua válida:
// o que falhou foi a análise, não o vídeo.
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import {
  compilarProposta,
  confiancaDoPlano,
  hasBlockingIssues,
  parseAiProposal,
  validateSemanticSafety,
} from '@makucho/studio-contracts';
import type { SegmentoDaTranscricao, SemanticIssue } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import { AiService } from './ai.service';
import { PromptsService } from './prompts.service';

/**
 * Teto de tokens da resposta.
 *
 * Sessenta segmentos é o máximo que o schema aceita, e cada um ocupa
 * perto de 120 tokens com o motivo escrito. 8000 cobre o pior caso
 * com folga; sem teto, uma resposta que cresce sem fim seguraria a
 * requisição até o timeout.
 */
const MAX_TOKENS = 8000;

@Injectable()
export class AnaliseService {
  private readonly log = new Logger(AnaliseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: PromptsService,
  ) {}

  /**
   * Analisa a transcrição e produz um EditPlan.
   *
   * Devolve o plano e os avisos; quem chama persiste e muda o estado.
   * Separar assim deixa o serviço testável sem banco de projeto.
   */
  async analisar(
    workspaceId: string,
    projectId: string,
  ): Promise<
    | { ok: true; plano: unknown; avisos: string[]; confianca: number; problemas: SemanticIssue[] }
    | { ok: false; erro: string; temporario: boolean }
  > {
    const transcricao = await this.prisma.transcription.findUnique({
      where: { projectId },
      include: {
        segments: {
          orderBy: { position: 'asc' },
          include: { words: { select: { confidence: true } } },
        },
      },
    });

    if (!transcricao || transcricao.segments.length === 0) {
      return {
        ok: false,
        erro: 'este projeto ainda não tem transcrição para analisar',
        temporario: false,
      };
    }

    const original = await this.prisma.mediaSource.findFirst({
      where: { projectId, kind: 'ORIGINAL' },
      orderBy: { createdAt: 'desc' },
    });

    if (!original?.durationMs) {
      return { ok: false, erro: 'o vídeo original não foi encontrado', temporario: false };
    }

    const projeto = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { framework: true, targetDurationMs: true },
    });

    const segmentos: SegmentoDaTranscricao[] = transcricao.segments.map((s) => ({
      id: s.id,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
      // A MENOR confiança de palavra, não a média: cortar por um
      // timestamp incerto desloca o corte para dentro da sílaba
      // vizinha, e uma única palavra ruim basta para isso.
      minWordConfidence: s.words.length
        ? Math.min(...s.words.map((w) => w.confidence))
        : (s.confidence ?? 1),
    }));

    const { texto: sistema, versao } = this.prompts.obter('selecionar_trechos');

    let resposta;
    try {
      resposta = await this.ai.chamar({
        workspaceId,
        projectId,
        chamada: 'selecionar_trechos',
        sistema,
        usuario: this.montarEntrada(segmentos, projeto?.framework, projeto?.targetDurationMs),
        maxTokens: MAX_TOKENS,
        promptVersion: versao,
      });
    } catch (e) {
      const publico =
        e && typeof e === 'object' && 'publico' in e
          ? String((e as { publico: unknown }).publico)
          : e instanceof Error
            ? e.message
            : 'a análise falhou';

      // Erro de provedor ou de limite: o projeto volta a um estado de
      // onde dá para tentar, e a gravação continua intacta.
      return { ok: false, erro: publico, temporario: true };
    }

    // ---------- Parser e Zod ----------
    const lida = parseAiProposal(resposta.texto);

    if (!lida.ok) {
      await this.ai.concluirAnalise(projectId, false, lida.error);
      this.log.warn(`proposta recusada no projeto ${projectId}: ${lida.error}`);

      return {
        ok: false,
        erro: 'A IA devolveu uma resposta que não pôde ser lida. Tente de novo.',
        // Erro de sintaxe costuma passar numa segunda tentativa;
        // violação de schema é erro de conteúdo e insistir não ajuda.
        temporario: lida.repairable,
      };
    }

    // ---------- Validador semântico ----------
    //
    // Confere por conta própria o que o modelo declarou. Confiar na
    // autoavaliação dele seria deixar o validado validar a si mesmo.
    const textos = lida.proposal.segments.map((seg) => {
      const cobertos = segmentos.filter(
        (s) => Math.min(seg.sourceEndMs, s.endMs) - Math.max(seg.sourceStartMs, s.startMs) > 0,
      );
      return {
        text: cobertos.map((s) => s.text).join(' '),
        minWordConfidence: cobertos.length
          ? Math.min(...cobertos.map((s) => s.minWordConfidence))
          : 1,
      };
    });

    const problemas = validateSemanticSafety(lida.proposal.segments, textos);

    // ---------- Compilador ----------
    const compilado = compilarProposta({
      proposta: lida.proposal,
      projectId,
      sourceMediaId: original.id,
      sourceDurationMs: original.durationMs,
      segmentos,
    });

    if (!compilado.ok) {
      await this.ai.concluirAnalise(projectId, false, compilado.erro);
      this.log.warn(`compilação recusada no projeto ${projectId}: ${compilado.erro}`);

      return {
        ok: false,
        erro: `A proposta da IA não pôde ser usada: ${compilado.erro}`,
        temporario: true,
      };
    }

    await this.ai.concluirAnalise(projectId, true);

    const avisos = [...compilado.avisos];

    // Os problemas bloqueantes viram aviso visível, não recusa: o
    // plano é uma proposta para o usuário revisar, e esconder o que
    // ele precisa olhar seria pior que mostrá-lo com ressalva.
    if (hasBlockingIssues(problemas)) {
      avisos.push(
        'Alguns trechos precisam da sua confirmação antes de exportar — veja os marcados na timeline.',
      );
    }

    return {
      ok: true,
      plano: compilado.plano,
      avisos,
      // O número não vem do modelo (seção 26.4): é agregação dos
      // riscos que ele classificou, não uma probabilidade.
      confianca: confiancaDoPlano(compilado.plano),
      problemas,
    };
  }

  /**
   * O que vai no prompt do usuário.
   *
   * Só a transcrição SEGMENTADA, como a seção 26.7 manda: as
   * `TranscriptWord` servem à legenda, não à escolha do trecho, e
   * mandá-las multiplicaria o custo por dez sem melhorar a decisão.
   */
  private montarEntrada(
    segmentos: readonly SegmentoDaTranscricao[],
    framework?: string | null,
    duracaoAlvoMs?: number | null,
  ): string {
    const linhas = segmentos.map(
      (s) => `[${s.startMs}–${s.endMs}] ${s.text}`,
    );

    return [
      `Framework: ${framework ?? 'authority_education'}`,
      `Duração alvo: ${Math.round((duracaoAlvoMs ?? 60_000) / 1000)} segundos`,
      '',
      'Transcrição (tempos em milissegundos):',
      ...linhas,
    ].join('\n');
  }
}
