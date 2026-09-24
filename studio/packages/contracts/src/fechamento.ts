// ============================================================
// MAKUCHO STUDIO - O vídeo termina concluindo o assunto?
//
// A queixa: a IA encerrava vídeos no meio da explicação. Duas causas,
// dois diagnósticos, conferidos AQUI (determinístico, sem token) e não
// só pedidos no prompt:
//
//   meio_da_frase  o último trecho acaba antes do fim da frase -- o
//                  corte cai dentro da linha, ou a linha não termina
//                  em ponto;
//   sem_conclusao  o último trecho é de abertura ou contexto (gancho,
//                  problema, apresentação...): o vídeo para antes de
//                  entregar o que prometeu.
//
// Para cada caso, as saídas com MATERIAL QUE EXISTE -- nunca uma
// conclusão inventada: estender o último trecho até o fim da frase, ou
// usar outro trecho da gravação que fecha a ideia. Sem nenhum, o
// editor oferece gravar uma conclusão.
// ============================================================

import type { EditPlanV1 } from './edit-plan';

export interface SegmentoDoFechamento {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export type ProblemaDeFechamento = 'meio_da_frase' | 'sem_conclusao';

export interface CandidatoAFinal {
  segmentIds: string[];
  startMs: number;
  endMs: number;
  texto: string;
}

export interface AnaliseDeFechamento {
  problema: ProblemaDeFechamento | null;
  mensagem: string;
  /** Estender o último trecho até o fim da frase (a saída mais natural). */
  estender?: { clipId: string; sourceStartMs: number; sourceEndMs: number; acrescimo: string };
  /** Outros trechos da gravação que fecham a ideia. */
  candidatos: CandidatoAFinal[];
}

/** Fim de frase: ponto, exclamação, interrogação ou reticências. */
const FIM_DE_FRASE = /[.!?…]["”')\]]*\s*$/;

/** Frases que costumam fechar um vídeo falado. */
const MARCAS_DE_FECHAMENTO =
  /\b(ent[aã]o|por isso|resumindo|em resumo|no fim|no final|o segredo|lembr|coment|segue|siga|salv|compartilh|manda pra|link|fa[cç]a isso|comece|experimente|agora voc[eê]|[eé] isso|conclus)/i;

/** Papéis que abrem ou preparam: terminar num deles é parar no meio. */
const PAPEIS_DE_ABERTURA = new Set(['hook', 'problem', 'context', 'curiosity_gap', 'introduction', 'pattern_interrupt']);

/** Quanto a extensão pode acrescentar ao vídeo. */
const EXTENSAO_MAXIMA_MS = 15_000;
/** Folga para considerar que o corte acabou no fim da linha. */
const FOLGA_MS = 250;

export function terminaFrase(texto: string): boolean {
  return FIM_DE_FRASE.test(texto.trim());
}

export function analisarFechamento(
  plano: EditPlanV1,
  segmentos: readonly SegmentoDoFechamento[],
  desligados: readonly string[] = [],
): AnaliseDeFechamento {
  const fora = new Set(desligados);
  const ativos = plano.clips.filter((c) => !fora.has(c.id));
  const ultimo = ativos[ativos.length - 1];
  const ordenados = [...segmentos].sort((a, b) => a.startMs - b.startMs);
  const vazio: AnaliseDeFechamento = { problema: null, mensagem: '', candidatos: [] };
  if (!ultimo || ordenados.length === 0) return vazio;

  const cobre = (c: { sourceStartMs: number; sourceEndMs: number }, s: SegmentoDoFechamento) =>
    Math.min(c.sourceEndMs, s.endMs) - Math.max(c.sourceStartMs, s.startMs) > 0;
  const usados = new Set(ordenados.filter((s) => ativos.some((c) => cobre(c, s))).map((s) => s.id));

  const doUltimo = ordenados.filter((s) => cobre(ultimo, s));
  const final = doUltimo[doUltimo.length - 1];
  if (!final) return vazio;

  // ---------- Termina no meio da frase? ----------
  const cortadoDentro = ultimo.sourceEndMs < final.endMs - FOLGA_MS;
  const linhaAberta = !terminaFrase(final.text);
  let problema: ProblemaDeFechamento | null = cortadoDentro || linhaAberta ? 'meio_da_frase' : null;

  let estender: AnaliseDeFechamento['estender'];
  if (problema === 'meio_da_frase') {
    // Da linha final em diante, até a primeira que fecha a frase --
    // sem passar por fala já usada em outro trecho (repetiria).
    const inicio = ordenados.indexOf(final);
    const acrescimo: string[] = [];
    for (let i = inicio; i < ordenados.length; i += 1) {
      const s = ordenados[i]!;
      if (i > inicio && usados.has(s.id)) break;
      if (s.endMs - ultimo.sourceEndMs > EXTENSAO_MAXIMA_MS) break;
      if (i > inicio || cortadoDentro) acrescimo.push(s.text);
      if (terminaFrase(s.text)) {
        if (s.endMs > ultimo.sourceEndMs + FOLGA_MS) {
          estender = {
            clipId: ultimo.id,
            sourceStartMs: ultimo.sourceStartMs,
            sourceEndMs: Math.min(s.endMs, plano.sourceDurationMs),
            acrescimo: acrescimo.join(' ').slice(0, 240),
          };
        }
        break;
      }
    }
    // A frase só acaba em fala que já está no vídeo (ou longe demais):
    // ao menos terminar a LINHA, em vez de cortar no meio da palavra.
    if (!estender && cortadoDentro) {
      estender = {
        clipId: ultimo.id,
        sourceStartMs: ultimo.sourceStartMs,
        sourceEndMs: Math.min(final.endMs, plano.sourceDurationMs),
        acrescimo: final.text.slice(0, 240),
      };
    }
  } else if (PAPEIS_DE_ABERTURA.has(ultimo.role) && !MARCAS_DE_FECHAMENTO.test(final.text)) {
    problema = 'sem_conclusao';
  }

  if (!problema) return vazio;

  // ---------- Outros finais possíveis ----------
  // Linhas NÃO usadas, que fecham frase; primeiro as que soam como
  // fechamento, depois as mais para o fim da gravação.
  const candidatos = ordenados
    .filter((s) => !usados.has(s.id) && terminaFrase(s.text) && s.text.split(/\s+/).length >= 4)
    .map((s) => ({ s, nota: (MARCAS_DE_FECHAMENTO.test(s.text) ? 2 : 0) + s.startMs / Math.max(1, plano.sourceDurationMs) }))
    .sort((a, b) => b.nota - a.nota)
    .slice(0, 3)
    .map(({ s }) => ({ segmentIds: [s.id], startMs: s.startMs, endMs: s.endMs, texto: s.text }));

  const mensagem =
    problema === 'meio_da_frase'
      ? 'O vídeo termina no meio de uma frase: quem assiste fica sem o fim da ideia.'
      : 'O vídeo termina antes de concluir o assunto: o último trecho ainda está apresentando o tema.';

  return { problema, mensagem, ...(estender ? { estender } : {}), candidatos };
}
