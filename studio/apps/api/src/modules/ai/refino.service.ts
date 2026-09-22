// ============================================================
// Candidatos e refino (Fase 5d, chamadas #4 e #6).
//
// As duas últimas da seção 26, e as duas que operam sobre uma
// timeline JÁ MONTADA — ao contrário da #3, que monta do zero.
//
// NENHUMA DAS DUAS APLICA NADA.
//
// A #4 devolve candidatos; a #6 devolve ajustes. Os dois vão para a
// tela, e o que entra na timeline é uma operação disparada por um
// clique — a mesma `inserir`/`ajustar_corte` validada pelo contrato.
//
// Isso não é excesso de cuidado: é a diferença entre "a IA sugere" e
// "a IA decide". Um aprimoramento que reescreve a timeline tira do
// usuário a chance de discordar de uma parte só, e o plano (seção
// 26.3) exige que toda operação proposta seja reversível em um
// desfazer e que a tela mostre o que muda antes de aplicar.
//
// O QUE A IA NÃO FAZ AQUI
//
// Remover silêncio não precisa de IA: o worker-core já detecta com
// FFmpeg, é determinístico, mais barato e mais preciso. Os silêncios
// estão no banco como `DetectedRegion` desde a transcrição. A IA
// entra só no ajuste fino das bordas, onde a pergunta é "esse corte
// cai no meio de uma ideia?" — julgamento de linguagem, não medição.
// ============================================================

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  editPlanV1Schema,
  parseCandidatos,
  parseRefino,
} from '@makucho/studio-contracts';
import type { Candidatos, EditPlanV1, Refino } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import { AiService } from './ai.service';
import { PromptsService } from './prompts.service';

/**
 * Tetos de tokens.
 *
 * Três candidatos com motivo escrito cabem em 1500; vinte ajustes de
 * borda, em 2500. Sem teto, uma resposta que cresce sem fim segura a
 * requisição até o timeout.
 */
const MAX_TOKENS_CANDIDATOS = 1500;
const MAX_TOKENS_REFINO = 2500;

/**
 * Quantas palavras de contexto vão em volta de cada borda.
 *
 * É o que o modelo precisa para responder "esse corte cai no meio de
 * uma ideia?". Menos que isso não mostra a fronteira; muito mais
 * transforma o prompt na transcrição inteira, e a chamada passa a
 * custar como a #3 para fazer um décimo do trabalho.
 */
const PALAVRAS_DE_CONTEXTO = 8;

@Injectable()
export class RefinoService {
  private readonly log = new Logger(RefinoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: PromptsService,
  ) {}

  // ----------------------------------------------------------
  // #4 — propor candidatos
  // ----------------------------------------------------------

  /**
   * Procura trechos bons que ficaram de fora do corte atual.
   *
   * Devolve candidatos, não um plano. Quem decide é o usuário, e a
   * operação aplicada é a mesma `inserir` do contrato.
   */
  async candidatos(
    workspaceId: string,
    projectId: string,
  ): Promise<{ candidatos: Candidatos['candidates']; custoCentavos: number }> {
    const { plano, transcricao } = await this.contexto(workspaceId, projectId);

    const { texto: sistema, versao } = this.prompts.obter('propor_candidatos');

    const resposta = await this.ai.chamar({
      workspaceId,
      chamada: 'propor_candidatos',
      sistema,
      usuario: this.montarPedidoDeCandidatos(plano, transcricao),
      maxTokens: MAX_TOKENS_CANDIDATOS,
      projectId,
      promptVersion: versao,
    });

    const lido = parseCandidatos(resposta.texto, {
      duracaoDoOriginalMs: plano.sourceDurationMs,
      // Os trechos já na timeline: é o que impede propor repetido.
      jaUsados: plano.clips.map((c) => ({
        sourceStartMs: c.sourceStartMs,
        sourceEndMs: c.sourceEndMs,
      })),
    });

    if (!lido.ok) {
      this.log.warn(`candidatos inválidos: ${lido.erro}`);
      await this.ai.concluirAnalise(projectId, false, lido.erro);
      throw new BadRequestException(
        lido.recuperavel
          ? 'a resposta da IA veio incompleta; tente de novo'
          : 'a IA propôs trechos que não existem na gravação',
      );
    }

    await this.ai.concluirAnalise(projectId, true);

    // Cada candidato precisa dos segmentos de transcrição que cobre:
    // sem eles a operação `inserir` é recusada pelo contrato, e com
    // razão — fala sem origem comprovável.
    const comOrigem = lido.dados.candidates.map((c) => ({
      ...c,
      transcriptSegmentIds: transcricao.segments
        .filter((s) => s.startMs < c.sourceEndMs && s.endMs > c.sourceStartMs)
        .map((s) => s.id),
    }));

    // Um candidato sem segmento correspondente aponta para silêncio:
    // o JSON é válido, os tempos existem, e o clipe sairia mudo.
    const utilizaveis = comOrigem.filter((c) => c.transcriptSegmentIds.length > 0);

    if (utilizaveis.length < comOrigem.length) {
      this.log.warn(
        `${comOrigem.length - utilizaveis.length} candidato(s) descartado(s): sem fala correspondente`,
      );
    }

    return { candidatos: utilizaveis, custoCentavos: resposta.custoCentavos };
  }

  // ----------------------------------------------------------
  // #6 — refinar cortes
  // ----------------------------------------------------------

  /**
   * Propõe ajustes de borda nos cortes atuais.
   *
   * Devolve ajustes, não um plano novo: cada um vira uma operação
   * `ajustar_corte` que o usuário aplica — e desfaz — uma a uma.
   */
  async refinar(
    workspaceId: string,
    projectId: string,
  ): Promise<{
    ajustes: Refino['adjustments'];
    silenciosRemoviveis: number;
    custoCentavos: number;
  }> {
    const { plano, transcricao } = await this.contexto(workspaceId, projectId);

    // Os silêncios vêm da MEDIÇÃO, não do modelo. Já estão no banco
    // desde a transcrição, detectados pelo FFmpeg. Contá-los aqui é
    // só para a tela informar — removê-los é determinístico e não
    // custa chamada de IA.
    const silencios = await this.prisma.detectedRegion.count({
      where: { transcriptionId: transcricao.id, kind: 'silence' },
    });

    const { texto: sistema, versao } = this.prompts.obter('refinar_cortes');

    const resposta = await this.ai.chamar({
      workspaceId,
      chamada: 'refinar_cortes',
      sistema,
      usuario: this.montarPedidoDeRefino(plano, transcricao),
      maxTokens: MAX_TOKENS_REFINO,
      projectId,
      promptVersion: versao,
    });

    const lido = parseRefino(
      resposta.texto,
      plano.clips.map((c) => ({
        sourceStartMs: c.sourceStartMs,
        sourceEndMs: c.sourceEndMs,
      })),
      plano.sourceDurationMs,
    );

    if (!lido.ok) {
      this.log.warn(`refino inválido: ${lido.erro}`);
      await this.ai.concluirAnalise(projectId, false, lido.erro);
      throw new BadRequestException(
        lido.recuperavel
          ? 'a resposta da IA veio incompleta; tente de novo'
          : 'a IA propôs ajustes que não cabem nesta timeline',
      );
    }

    await this.ai.concluirAnalise(projectId, true);

    return {
      ajustes: lido.dados.adjustments,
      silenciosRemoviveis: silencios,
      custoCentavos: resposta.custoCentavos,
    };
  }

  // ----------------------------------------------------------
  // Contexto e montagem
  // ----------------------------------------------------------

  /** O plano ativo e a transcrição, validados. */
  private async contexto(workspaceId: string, projectId: string) {
    const projeto = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });
    if (!projeto) throw new BadRequestException('projeto não encontrado');

    const versao = await this.prisma.editPlan.findFirst({
      where: { projectId, isActive: true },
      orderBy: { version: 'desc' },
    });

    if (!versao) {
      throw new BadRequestException(
        'este projeto ainda não tem uma proposta de edição; peça a análise da IA antes',
      );
    }

    // O plano vem do banco como JSON e passa pelo schema de novo: é
    // a mesma porta de sempre, e um plano corrompido não pode virar
    // prompt.
    const conferido = editPlanV1Schema.safeParse(versao.document);
    if (!conferido.success) {
      throw new BadRequestException('o plano salvo não passou na validação');
    }

    const transcricao = await this.prisma.transcription.findUnique({
      where: { projectId },
      include: {
        segments: {
          orderBy: { position: 'asc' },
          include: { words: { orderBy: { startMs: 'asc' } } },
        },
      },
    });

    if (!transcricao || transcricao.segments.length === 0) {
      throw new BadRequestException('este projeto ainda não tem transcrição');
    }

    return { plano: conferido.data, transcricao };
  }

  private montarPedidoDeCandidatos(
    plano: EditPlanV1,
    transcricao: { segments: Array<{ startMs: number; endMs: number; text: string }> },
  ): string {
    // Somente os segmentos que NÃO estão na timeline: o modelo não
    // precisa ler o que já foi escolhido, e mandar tudo dobraria o
    // custo da chamada para transportar informação que ele deve
    // ignorar.
    const deFora = transcricao.segments.filter(
      (s) => !plano.clips.some((c) => s.startMs < c.sourceEndMs && s.endMs > c.sourceStartMs),
    );

    const jaNaTimeline = plano.clips
      .map((c, i) => `[${i}] ${c.role} ${c.sourceStartMs}-${c.sourceEndMs}ms: ${c.reason}`)
      .join('\n');

    const sobrando = deFora
      .map((s) => `${s.startMs}-${s.endMs}ms: ${s.text}`)
      .join('\n');

    return [
      `DURAÇÃO DA GRAVAÇÃO: ${plano.sourceDurationMs}ms`,
      `FRAMEWORK: ${plano.framework}`,
      '',
      'JÁ NA TIMELINE (não proponha estes de novo):',
      jaNaTimeline || '(nenhum)',
      '',
      'TRECHOS QUE FICARAM DE FORA:',
      sobrando || '(nenhum: toda a fala já está no corte)',
      '',
      'Devolva apenas o JSON. Lista vazia é resposta válida.',
    ].join('\n');
  }

  private montarPedidoDeRefino(
    plano: EditPlanV1,
    transcricao: {
      segments: Array<{
        startMs: number;
        endMs: number;
        text: string;
        words: Array<{ startMs: number; endMs: number; word: string }>;
      }>;
    },
  ): string {
    const palavras = transcricao.segments.flatMap((s) => s.words);

    const trechos = plano.clips.map((c, i) => {
      // As palavras em volta de cada borda são o que permite ver onde
      // o corte caiu. Sem elas o modelo só tem números, e "esse corte
      // cai no meio de uma ideia?" é uma pergunta sobre texto.
      const antes = palavras
        .filter((p) => p.endMs <= c.sourceStartMs)
        .slice(-PALAVRAS_DE_CONTEXTO)
        .map((p) => p.word)
        .join(' ');

      const dentro = palavras
        .filter((p) => p.startMs >= c.sourceStartMs && p.endMs <= c.sourceEndMs)
        .map((p) => p.word)
        .join(' ');

      const depois = palavras
        .filter((p) => p.startMs >= c.sourceEndMs)
        .slice(0, PALAVRAS_DE_CONTEXTO)
        .map((p) => p.word)
        .join(' ');

      return [
        `[${i}] ${c.sourceStartMs}-${c.sourceEndMs}ms (${c.role})`,
        `  antes do corte:  …${antes}`,
        `  no trecho:       ${dentro}`,
        `  depois do corte: ${depois}…`,
      ].join('\n');
    });

    return [
      `DURAÇÃO DA GRAVAÇÃO: ${plano.sourceDurationMs}ms`,
      '',
      'TRECHOS DA TIMELINE, com as palavras em volta de cada borda:',
      trechos.join('\n\n'),
      '',
      'Devolva apenas o JSON. Lista vazia é resposta válida.',
    ].join('\n');
  }
}
