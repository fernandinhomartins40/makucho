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
  analisarFechamento,
  aplicarOperacao,
  catalogoDeEstilosParaIa,
  compilarProposta,
  confiancaDoPlano,
  detectarRetomadas,
  hasBlockingIssues,
  parseAiProposal,
  removerRetomadasEscolhidas,
  editPlanV1Schema,
  tirarPausas,
  validateSemanticSafety,
} from '@makucho/studio-contracts';
import type {
  AnaliseDaIa,
  CommunicationProfileInput,
  EditPlanV1,
  ContextoDoAcabamento,
  SegmentoDaTranscricao,
  SemanticIssue,
} from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import { AcabamentoService } from './acabamento.service';
import { AiService } from './ai.service';
import { PromptsService } from './prompts.service';
import { RoteiroService } from './roteiro.service';

/** Silêncio a partir do qual a pausa antes de uma linha é anotada. */
const PAUSA_ANOTADA_MS = 700;
/** Confiança de palavra abaixo da qual a linha é marcada. */
const CONFIANCA_BAIXA = 0.6;

/**
 * Teto de tokens da resposta.
 *
 * Sessenta segmentos é o máximo que o schema aceita, e cada um ocupa
 * perto de 120 tokens com o motivo escrito. 8000 cobre o pior caso
 * com folga; sem teto, uma resposta que cresce sem fim seguraria a
 * requisição até o timeout.
 */
// Com raciocinio ligado, os tokens de pensamento contam na saida: o
// teto sobe para a resposta nao ser cortada no meio do JSON.
const MAX_TOKENS = 16000;

/** Sem raciocinio, a resposta e so o JSON: 60 trechos cabem com folga. */
const MAX_TOKENS_SEM_RACIOCINIO = 6000;

@Injectable()
export class AnaliseService {
  private readonly log = new Logger(AnaliseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: PromptsService,
    private readonly acabamento: AcabamentoService,
    private readonly roteiros: RoteiroService,
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
    opcoes: { semCache?: boolean } = {},
  ): Promise<
    | {
        ok: true;
        plano: unknown;
        avisos: string[];
        confianca: number;
        problemas: SemanticIssue[];
        /** O que a IA entendeu do vídeo (assunto, promessa, estrutura). */
        entendimento?: AnaliseDaIa;
      }
    | { ok: false; erro: string; temporario: boolean }
  > {
    const transcricao = await this.prisma.transcription.findUnique({
      where: { projectId },
      include: {
        segments: {
          orderBy: { position: 'asc' },
          include: { words: { select: { id: true, startMs: true, endMs: true, word: true, confidence: true } } },
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
      select: {
        title: true,
        objective: true,
        framework: true,
        targetDurationMs: true,
        // O roteiro de onde a gravação saiu é o melhor resumo do assunto:
        // a IA entende o que a pessoa QUERIA dizer antes de ler o que disse.
        script: {
          select: {
            title: true,
            framework: true,
            blocks: { orderBy: { position: 'asc' }, select: { role: true, goal: true, text: true } },
          },
        },
      },
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

    const { texto: instrucoes, versao } = this.prompts.obter('selecionar_trechos');
    // O catalogo de estilos vem do codigo: um estilo novo aparece para
    // a IA sem ninguem editar o prompt, e o prefixo continua identico
    // entre chamadas -- elegivel ao cache do provedor.
    const sistema = `${instrucoes}\n\n## Estilos de legenda (captionPreset: descrição)\n${catalogoDeEstilosParaIa()}`;
    const acabamento = await this.acabamento.contexto(workspaceId);

    const perfil = await this.roteiros.perfilDe(workspaceId).catch(() => null);
    const retomadas = detectarRetomadas(segmentos);

    const usuario = this.montarEntrada({
      segmentos,
      retomadas,
      framework: projeto?.framework ?? projeto?.script?.framework,
      duracaoAlvoMs: projeto?.targetDurationMs,
      duracaoDaGravacaoMs: original.durationMs,
      acabamento,
      perfil,
      titulo: projeto?.title,
      objetivo: projeto?.objective,
      roteiro: projeto?.script ?? null,
    });

    // ---------- Duas tentativas: barata, e com raciocinio so se precisar ----------
    //
    // Medido no mesmo video: sem raciocinio, a selecao sai em 2,5 s por
    // ~US$ 0,001 e escolhe os MESMOS trechos que com raciocinio alto
    // (25 s, ~US$ 0,007 -- os tokens de pensamento sao 90% da conta). Com
    // raciocinio "baixo" o gasto e o mesmo do alto. Entao a primeira
    // tentativa vai sem raciocinio; so uma resposta que nao passa no
    // contrato ou no compilador paga a segunda, com raciocinio.
    const tentar = async (raciocinio: 'desligado' | 'high', semCache: boolean) => {
      let resposta;
      try {
        resposta = await this.ai.chamar({
          workspaceId,
          projectId,
          chamada: 'selecionar_trechos',
          sistema,
          usuario,
          maxTokens: raciocinio === 'desligado' ? MAX_TOKENS_SEM_RACIOCINIO : MAX_TOKENS,
          promptVersion: versao,
          semCache,
          raciocinio,
        });
      } catch (e) {
        const publico =
          e && typeof e === 'object' && 'publico' in e
            ? String((e as { publico: unknown }).publico)
            : e instanceof Error
              ? e.message
              : 'a análise falhou';
        // Erro de provedor ou de limite: nao adianta a segunda tentativa.
        return { tipo: 'provedor' as const, erro: publico };
      }

      const lidaCrua = parseAiProposal(resposta.texto);
      if (!lidaCrua.ok) {
        const lida = lidaCrua;
        await this.ai.concluirAnalise(projectId, false, lida.error);
        this.log.warn(`proposta recusada no projeto ${projectId} (${raciocinio}): ${lida.error}`);
        return {
          tipo: 'invalida' as const,
          erro: 'A IA devolveu uma resposta que não pôde ser lida. Tente de novo.',
          temporario: lida.repairable,
        };
      }

      // A mesma fala escolhida duas vezes (a tentativa e a retomada):
      // fica a última. É mecânico, e o modelo sem raciocínio erra.
      const semRetomada = removerRetomadasEscolhidas(lidaCrua.proposal, segmentos, retomadas);
      const lida = { ...lidaCrua, proposal: semRetomada.proposta };
      if (semRetomada.removidos > 0) {
        this.log.log(`projeto ${projectId}: ${semRetomada.removidos} trecho(s) repetido(s) removido(s)`);
      }

      const compilado = compilarProposta({
        proposta: lida.proposal,
        projectId,
        sourceMediaId: original.id,
        sourceDurationMs: original.durationMs!,
        segmentos,
        acabamento,
      });
      if (!compilado.ok) {
        await this.ai.concluirAnalise(projectId, false, compilado.erro);
        this.log.warn(`compilação recusada no projeto ${projectId} (${raciocinio}): ${compilado.erro}`);
        return { tipo: 'invalida' as const, erro: `A proposta da IA não pôde ser usada: ${compilado.erro}`, temporario: true };
      }

      return { tipo: 'ok' as const, lida, compilado };
    };

    let tentativa = await tentar('desligado', Boolean(opcoes.semCache));
    if (tentativa.tipo === 'invalida') {
      this.log.log(`projeto ${projectId}: segunda tentativa, com raciocínio`);
      tentativa = await tentar('high', true);
    }
    if (tentativa.tipo === 'provedor') return { ok: false, erro: tentativa.erro, temporario: true };
    if (tentativa.tipo === 'invalida') return { ok: false, erro: tentativa.erro, temporario: tentativa.temporario };

    const { lida, compilado } = tentativa;

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

    await this.ai.concluirAnalise(projectId, true);

    const avisos = [...compilado.avisos];

    // ---------- O vídeo termina concluindo o assunto? ----------
    //
    // Conferido aqui, sem token, e não só pedido no prompt: um corte
    // final no meio da frase é estendido até o fim dela (com a fala que
    // existe); faltando conclusão, o editor mostra as opções.
    let plano = compilado.plano as EditPlanV1;
    const fechamento = analisarFechamento(
      plano,
      segmentos.map((sg) => ({ id: sg.id, startMs: sg.startMs, endMs: sg.endMs, text: sg.text })),
    );
    if (fechamento.problema === 'meio_da_frase' && fechamento.estender) {
      const estendido = aplicarOperacao(plano, {
        op: 'ajustar_corte',
        clipId: fechamento.estender.clipId,
        sourceStartMs: fechamento.estender.sourceStartMs,
        sourceEndMs: fechamento.estender.sourceEndMs,
      });
      if (estendido.ok && estendido.plan) {
        plano = estendido.plan;
        avisos.push('O último trecho foi estendido até o fim da frase, para o vídeo não terminar no meio da ideia.');
      }
    }
    // ---------- Cortes na fala, sem silêncio nas pontas ----------
    //
    // Os trechos vêm dos segmentos do Whisper, que trazem o respiro antes
    // e a pausa depois da frase. Emendados, esses silêncios viravam uma
    // pausa perceptível em cada corte. Aqui cada trecho encosta na fala
    // (com folga para a sílaba não sair cortada); o que está no tempo da
    // timeline acompanha.
    const palavras = transcricao.segments.flatMap((sg) =>
      sg.words.map((w) => ({ id: w.id, startMs: w.startMs, endMs: w.endMs, word: w.word })),
    );
    const apertado = tirarPausas(plano, palavras);
    if (apertado.removidoMs >= 150 && editPlanV1Schema.safeParse(apertado.plano).success) {
      plano = apertado.plano;
      this.log.log(`projeto ${projectId}: ${apertado.removidoMs} ms de silêncio tirados das pontas dos trechos`);
    }

    const depois = analisarFechamento(
      plano,
      segmentos.map((sg) => ({ id: sg.id, startMs: sg.startMs, endMs: sg.endMs, text: sg.text })),
    );
    if (depois.problema) avisos.push(`${depois.mensagem} Veja as opções no editor.`);

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
      plano,
      avisos,
      entendimento: lida.proposal.analysis,
      // O número não vem do modelo (seção 26.4): é agregação dos
      // riscos que ele classificou, não uma probabilidade.
      confianca: confiancaDoPlano(compilado.plano),
      problemas,
    };
  }

  /**
   * O que vai no prompt do usuário.
   *
   * A transcrição SEGMENTADA (as palavras servem à legenda, não à
   * escolha, e multiplicariam o custo), com o que um editor anotaria
   * na margem -- pausa antes da linha, "esta refaz aquela", palavra mal
   * ouvida -- e o contexto que faz a IA entender o assunto: o roteiro
   * de onde a gravação saiu, o perfil de quem fala e o que o Kit de
   * marca já decide. Tudo em poucas centenas de tokens.
   */
  private montarEntrada(e: {
    segmentos: readonly SegmentoDaTranscricao[];
    retomadas: ReadonlyMap<number, number>;
    framework?: string | null;
    duracaoAlvoMs?: number | null;
    duracaoDaGravacaoMs: number;
    acabamento?: ContextoDoAcabamento;
    perfil?: CommunicationProfileInput | null;
    titulo?: string | null;
    objetivo?: string | null;
    roteiro?: { title: string; blocks: Array<{ role: string; goal: string | null; text: string }> } | null;
  }): string {
    const linhas = e.segmentos.map((s, i) => {
      const notas: string[] = [];
      const anterior = e.segmentos[i - 1];
      if (anterior && s.startMs - anterior.endMs >= PAUSA_ANOTADA_MS) {
        notas.push(`(pausa ${((s.startMs - anterior.endMs) / 1000).toFixed(1)}s)`);
      }
      const refaz = e.retomadas.get(i);
      if (refaz !== undefined) notas.push(`⟲ refaz #${refaz}`);
      if (s.minWordConfidence < CONFIANCA_BAIXA) notas.push('?confiança baixa');
      return `#${i} [${s.startMs}–${s.endMs}]${notas.length ? ` ${notas.join(' ')}` : ''} ${s.text}`;
    });

    const contexto: string[] = [];
    const titulo = e.titulo && !/^vídeo sem título$/i.test(e.titulo) ? e.titulo : null;
    if (titulo) contexto.push(`Título do projeto: ${titulo}`);
    if (e.objetivo) contexto.push(`Objetivo: ${e.objetivo}`);
    if (e.roteiro) {
      contexto.push(`Roteiro de origem: "${e.roteiro.title}"`);
      for (const b of e.roteiro.blocks.slice(0, 8)) {
        contexto.push(`  - ${b.role}${b.goal ? ` (${b.goal})` : ''}: ${b.text.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }

    const p = e.perfil;
    if (p) {
      contexto.push(
        `Perfil do criador: tom ${p.tone}, energia ${p.energy}, ganchos preferidos ${p.allowedHooks.join('/') || 'livres'}, ` +
          `auto-apresentação ${p.selfIntroPolicy}, estilo de CTA ${p.ctaStyle}, agressividade de corte ${p.cutAggressiveness}.`,
      );
      if (p.removableFillers.length) contexto.push(`Muletas deste criador (corte): ${p.removableFillers.slice(0, 15).join(', ')}`);
      if (p.bannedWords.length) contexto.push(`Palavras que não podem aparecer: ${p.bannedWords.slice(0, 15).join(', ')}`);
    }

    // O que o Kit de marca já decide a IA não decide: seria gastar
    // tokens numa escolha que o acabamento descarta.
    const prefs = e.acabamento?.preferencias ?? {};
    const marca: string[] = [];
    marca.push(prefs.captionPreset ? `estilo de legenda FIXO (${prefs.captionPreset}): omita captionPreset` : 'estilo de legenda: escolha');
    marca.push(prefs.transicaoPadrao ? `transição FIXA (${prefs.transicaoPadrao}): omita transitions` : 'transições: escolha nas viradas');
    if (e.acabamento?.logoAssetId) marca.push('tem logo no canto');
    if (e.acabamento?.musicaAssetId) marca.push('tem trilha de fundo');

    const pedido = e.duracaoAlvoMs ?? (p ? Math.round((p.targetDurationMinMs + p.targetDurationMaxMs) / 2) : 60_000);
    // O alvo nunca passa da gravação: com 20 s gravados e 60 s pedidos,
    // a IA tentaria "esticar" e manteria o que devia sair. Aí o alvo é
    // cortar o que não serve -- uns 85% do que foi gravado, no máximo.
    const alvo = Math.min(pedido, Math.round(e.duracaoDaGravacaoMs * 0.85));

    return [
      `Framework: ${e.framework ?? 'authority_education'}`,
      `Duração alvo: ${Math.round(alvo / 1000)} s (gravação: ${Math.round(e.duracaoDaGravacaoMs / 1000)} s)`,
      `Kit de marca: ${marca.join('; ')}.`,
      ...(contexto.length ? ['', ...contexto] : []),
      '',
      'Transcrição (#linha [início–fim em ms] notas texto):',
      ...linhas,
    ].join('\n');
  }
}
