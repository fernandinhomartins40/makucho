// ============================================================
// MAKUCHO STUDIO - Da proposta da IA ao EditPlan (Fase 5b).
//
// A ultima etapa da cadeia da secao 22 do contexto mestre:
//
//     DeepSeek -> JSON -> parser -> Zod -> validadores -> COMPILADOR
//
// Aqui a proposta -- que so fala de tempos e papeis -- vira o plano
// que o preview e o render executam. E deliberadamente o compilador,
// e nao o modelo, quem decide codec, legenda, canvas e parametro de
// render: sao escolhas tecnicas com resposta certa, e pedi-las a um
// modelo e convidar variacao onde nao deveria haver nenhuma.
//
// O QUE ESTE MODULO PROTEGE
//
// `transcriptSegmentIds` e obrigatorio em todo clip, e e aqui que ele
// deixa de ser promessa e vira dado: cada clip recebe os IDs dos
// segmentos de transcricao que ele de fato cobre. Um trecho proposto
// que nao case com segmento nenhum e RECUSADO -- porque sem origem
// verificavel, a fala do resultado nao existe comprovadamente no
// bruto, e essa e a regra que o produto inteiro sustenta.
// ============================================================

import type { AiProposalV1, ProposedSegment } from './ai-proposal';
import type { EditPlanV1 } from './edit-plan';
import { editPlanV1Schema } from './edit-plan';

/** Um segmento da transcricao, com o ID que ele tem no banco. */
export interface SegmentoDaTranscricao {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  /** Menor confianca de palavra no segmento, 0 a 1. */
  minWordConfidence: number;
}

export interface EntradaDaCompilacao {
  proposta: AiProposalV1;
  projectId: string;
  sourceMediaId: string;
  sourceDurationMs: number;
  segmentos: readonly SegmentoDaTranscricao[];
  /** Estilo de legenda do Brand Profile; ha um padrao se faltar. */
  captionStyleId?: string;
}

export type ResultadoDaCompilacao =
  | { ok: true; plano: EditPlanV1; avisos: string[] }
  | { ok: false; erro: string };

/**
 * Sobreposicao minima para considerar que um clip cobre um segmento.
 *
 * Sem um piso, um clip que encosta um milissegundo no segmento
 * vizinho o reivindicaria como origem -- e a rastreabilidade viraria
 * ficcao. 200ms e o menor trecho em que da para reconhecer uma
 * palavra falada.
 */
const SOBREPOSICAO_MINIMA_MS = 200;

/** Tolerancia ao encostar a borda do clip no fim do original. */
const FOLGA_DE_BORDA_MS = 50;

/**
 * Compila a proposta em EditPlan.
 *
 * Nao lanca: devolve `ok: false` com o motivo. Uma proposta
 * incompilavel e informacao para o usuario ("a IA propos um trecho
 * que nao existe na gravacao"), nao um defeito do sistema.
 */
export function compilarProposta(entrada: EntradaDaCompilacao): ResultadoDaCompilacao {
  const { proposta, segmentos, sourceDurationMs } = entrada;
  const avisos: string[] = [...proposta.warnings];

  if (segmentos.length === 0) {
    return { ok: false, erro: 'não há transcrição para ancorar os cortes' };
  }

  // A ordem dos clips na timeline e a ordem da proposta. O modelo
  // decide a narrativa; o compilador nao reordena por conta propria,
  // porque reordenar quebraria as dependencias que ele declarou.
  const clips: EditPlanV1['clips'] = [];
  let posicaoNaTimeline = 0;

  for (let i = 0; i < proposta.segments.length; i += 1) {
    const segmento = proposta.segments[i]!;

    const problema = conferirLimites(segmento, sourceDurationMs, i);
    if (problema) return { ok: false, erro: problema };

    const cobertos = segmentosCobertos(segmento, segmentos);

    if (cobertos.length === 0) {
      // O caso que o schema nao pega: tempos validos, dentro do
      // video, e ainda assim sem fala correspondente. Acontece quando
      // o modelo aponta para um trecho de silencio ou inventa um
      // intervalo plausivel.
      return {
        ok: false,
        erro:
          `o trecho ${i + 1} (${ms(segmento.sourceStartMs)}–${ms(segmento.sourceEndMs)}) ` +
          'não corresponde a nenhuma fala da transcrição',
      };
    }

    const duracao = segmento.sourceEndMs - segmento.sourceStartMs;

    clips.push({
      id: `clip-${i + 1}`,
      sourceStartMs: segmento.sourceStartMs,
      sourceEndMs: segmento.sourceEndMs,
      timelineStartMs: posicaoNaTimeline,
      role: segmento.role,
      transcriptSegmentIds: cobertos.map((s) => s.id),
      semanticRisk: segmento.semanticRisk,
      reason: segmento.reason,
    });

    // Clips encostados, sem intervalo: um buraco na timeline vira
    // quadro preto no resultado, e ninguem pediu por ele.
    posicaoNaTimeline += duracao;
  }

  if (clips.length === 0) {
    return { ok: false, erro: 'a proposta não resultou em nenhum trecho aproveitável' };
  }

  for (const papel of proposta.missingBlocks) {
    // A ausencia declarada vira aviso visivel. Declarar que falta e
    // obrigatorio; preencher e proibido -- entao o que resta e
    // contar para quem grava.
    avisos.push(`A gravação não tem um trecho de "${papel}". Grave esse bloco para incluí-lo.`);
  }

  const plano = {
    schemaVersion: '1.0' as const,
    projectId: entrada.projectId,
    sourceMediaId: entrada.sourceMediaId,
    sourceDurationMs,
    fps: 30 as const,
    canvas: { aspectRatio: '9:16' as const, width: 1080 as const, height: 1920 as const },
    // A duracao vem da SOMA dos clips, nao do alvo pedido: o schema
    // confere as duas e recusa divergencia acima de um frame. O alvo
    // orienta a escolha do modelo; o que vale e o que foi escolhido.
    targetDurationMs: posicaoNaTimeline,
    framework: proposta.framework,
    clips,
    captions: {
      enabled: true,
      styleId: entrada.captionStyleId ?? 'default',
      // Tres palavras por bloco: o suficiente para acompanhar a fala
      // sem que o olho precise ler mais do que o ouvido escuta.
      wordsPerBlock: 3,
      position: 'bottom' as const,
      highlightActiveWord: true,
      // Nenhuma correcao: a proposta nasce com o que o whisper ouviu.
      // Corrigir e decisao de quem revisa, e entra depois pela
      // operacao `editar_legenda`.
      corrections: [],
    },
    overlays: [],
    soundEffects: [],
    transitions: [],
    render: {
      fps: 30 as const,
      videoCodec: 'h264' as const,
      audioCodec: 'aac' as const,
      // CRF 23 e o meio da faixa util: abaixo o arquivo incha sem
      // ganho visivel no celular, acima aparece bloco na compressao.
      crf: 23,
      audioBitrateKbps: 128,
      // -14 LUFS e o alvo das plataformas sociais; acima disso elas
      // normalizam por conta propria e o resultado sai abafado.
      loudnessTargetLufs: -14,
    },
  };

  // O plano passa pelo proprio schema antes de sair: sobreposicao na
  // timeline, corte alem do original e soma divergente sao conferidos
  // la, e repetir essas regras aqui as faria divergir com o tempo.
  const conferido = editPlanV1Schema.safeParse(plano);
  if (!conferido.success) {
    return {
      ok: false,
      erro: `o plano gerado não passou na validação: ${conferido.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    };
  }

  return { ok: true, plano: conferido.data, avisos };
}

/** O trecho cabe dentro do vídeo? */
function conferirLimites(
  segmento: ProposedSegment,
  sourceDurationMs: number,
  indice: number,
): string | null {
  if (segmento.sourceEndMs > sourceDurationMs + FOLGA_DE_BORDA_MS) {
    // O schema nao pega este caso: ele nao conhece a duracao do
    // video. Um sourceEndMs alem do fim faz o FFmpeg produzir um clip
    // mudo e mais curto, sem erro -- a falha so apareceria no video
    // final, depois do render inteiro.
    return (
      `o trecho ${indice + 1} termina em ${ms(segmento.sourceEndMs)}, ` +
      `depois do fim da gravação (${ms(sourceDurationMs)})`
    );
  }
  return null;
}

/**
 * Quais segmentos da transcricao este trecho de fato cobre.
 *
 * E o que transforma `transcriptSegmentIds` de promessa em dado. Sem
 * isto, um clip poderia apontar para qualquer ID e a rastreabilidade
 * seria decorativa.
 */
function segmentosCobertos(
  proposto: ProposedSegment,
  segmentos: readonly SegmentoDaTranscricao[],
): SegmentoDaTranscricao[] {
  return segmentos.filter((s) => {
    const inicio = Math.max(proposto.sourceStartMs, s.startMs);
    const fim = Math.min(proposto.sourceEndMs, s.endMs);
    const sobreposicao = fim - inicio;

    if (sobreposicao <= 0) return false;

    // Um segmento curto pode ser coberto por inteiro sem atingir o
    // piso absoluto; nesse caso o que vale e a proporcao dele.
    return sobreposicao >= Math.min(SOBREPOSICAO_MINIMA_MS, (s.endMs - s.startMs) * 0.5);
  });
}

/** mm:ss para mensagem de usuário — milissegundo não diz nada a ninguém. */
function ms(valor: number): string {
  const total = Math.round(valor / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Confianca exibida no painel, derivada do risco.
 *
 * A secao 26.4 e explicita: o numero NAO vem do modelo. Modelos de
 * linguagem nao produzem confianca calibrada, e pedir um e convidar o
 * modelo a inventar. Isto e uma agregacao de julgamentos discretos,
 * nao uma probabilidade -- e a interface deve dizer isso quando o
 * numero e baixo, em vez de deixar supor que ha estatistica atras.
 */
export function confiancaDoPlano(plano: EditPlanV1): number {
  const peso = { low: 1.0, medium: 0.7, high: 0.35 } as const;

  const soma = plano.clips.reduce((total, clip) => total + peso[clip.semanticRisk], 0);
  return Math.round((soma / plano.clips.length) * 100);
}
