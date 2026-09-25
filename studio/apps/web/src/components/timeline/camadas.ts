// ============================================================
// O que a timeline mostra além dos trechos -- tudo o que a IA (ou a
// pessoa) aplicou, cada coisa no seu tempo:
//
//   legendas   os blocos que vão aparecer na tela, pela MESMA função
//              que gera o .ass da prévia e do render (montarBlocos):
//              o que está na faixa é o que sai no vídeo;
//   cortes     cada emenda entre trechos, com a transição dela (ou
//              corte seco) -- clicável para trocar tipo e duração;
//   elementos  título, chamada, textos de destaque, logo, barra;
//   efeitos    o zoom de cada trecho e os efeitos sonoros.
// ============================================================

import { corEhNeutra, definicaoDaAparencia, montarBlocos, resolverEstiloDaLegenda } from '@makucho/studio-contracts';
import type { Agenda, EditPlanV1, PalavraDaTranscricao } from '@makucho/studio-contracts';
import { NOME_DO_EFEITO, NOME_DO_SOM, NOME_DA_TRANSICAO } from '../biblioteca/catalogo';

export type AbaDoElemento = 'estilos' | 'texto' | 'fundo' | 'animacao';

export type ItemDaTimeline =
  | { tipo: 'legenda'; id: string; wordIds: string[]; manualId?: string; inicioMs: number; fimMs: number; texto: string }
  | { tipo: 'corte'; id: string; clipId: string; ms: number }
  /** `aba`: a aba do painel que abre junto (clique duplo = Estilos). */
  | { tipo: 'elemento'; id: string; aba?: AbaDoElemento }
  | { tipo: 'som'; id: string }
  /** Um efeito de tela (vinheta, flash...) da faixa Efeitos. */
  | { tipo: 'efeito'; id: string }
  /** O som de um trecho (id = id do trecho), separado da imagem. */
  | { tipo: 'audio'; id: string }
  | { tipo: 'trilha'; id: 'trilha' };

export interface BlocoNaFaixa {
  id: string;
  inicioMs: number;
  fimMs: number;
  texto: string;
  wordIds: string[];
  manualId?: string;
}

export interface CorteNaFaixa {
  /** O trecho que ENTRA: é onde a transição mora no plano. */
  clipId: string;
  ms: number;
  transicao: EditPlanV1['transitions'][number] | null;
}

export interface EfeitoNaFaixa {
  id: string;
  inicioMs: number;
  fimMs: number;
  rotulo: string;
  /** Zoom: seleciona o trecho; som: seleciona o efeito. */
  alvo: { tipo: 'clipe'; clipId: string } | { tipo: 'som'; id: string };
}

export const NOME_DO_ELEMENTO: Record<string, string> = {
  HookTitle: 'Título',
  CTA: 'Chamada',
  Destaque: 'Destaque',
  LogoBug: 'Logo',
  ProgressBar: 'Barra de progresso',
  LowerThird: 'Rodapé',
  QuoteCard: 'Citação',
  StatCard: 'Número',
  ImageOverlay: 'Imagem',
};

export const COR_DO_ELEMENTO: Record<string, string> = {
  HookTitle: '#7c3aed',
  CTA: '#db2777',
  Destaque: '#f59e0b',
  LogoBug: '#475569',
  ProgressBar: '#475569',
  ImageOverlay: '#0891b2',
};

export function blocosDeLegenda(plan: EditPlanV1, palavras: readonly PalavraDaTranscricao[]): BlocoNaFaixa[] {
  if (!plan.captions.enabled) return [];
  const estilo = resolverEstiloDaLegenda(plan.captions.styleId);
  return montarBlocos({ plano: plan, estilo, palavras }).map((b) => ({
    id: b.manualId ?? `lg-${b.wordIds?.[0] ?? b.inicioMs}`,
    inicioMs: b.inicioMs,
    fimMs: b.fimMs,
    texto: b.palavras.map((p) => p.texto).join(' '),
    wordIds: b.wordIds ?? [],
    ...(b.manualId ? { manualId: b.manualId } : {}),
  }));
}

export function cortes(plan: EditPlanV1): CorteNaFaixa[] {
  const porClipe = new Map(plan.transitions.map((t) => [t.beforeClipIndex, t]));
  const lista: CorteNaFaixa[] = [];
  let acumulado = 0;
  plan.clips.forEach((c, i) => {
    if (i > 0) lista.push({ clipId: c.id, ms: acumulado, transicao: porClipe.get(i) ?? null });
    acumulado += c.sourceEndMs - c.sourceStartMs;
  });
  return lista;
}

export function efeitos(plan: EditPlanV1): EfeitoNaFaixa[] {
  const lista: EfeitoNaFaixa[] = [];
  let acumulado = 0;
  for (const c of plan.clips) {
    const dur = c.sourceEndMs - c.sourceStartMs;
    if (c.effect) {
      lista.push({
        id: `fx-${c.id}`,
        inicioMs: acumulado,
        fimMs: acumulado + dur,
        rotulo: NOME_DO_EFEITO[c.effect] ?? c.effect,
        alvo: { tipo: 'clipe', clipId: c.id },
      });
    }
    acumulado += dur;
  }
  for (const s of plan.soundEffects) {
    lista.push({
      id: s.id,
      inicioMs: s.timelineStartMs,
      fimMs: s.timelineStartMs + 450,
      rotulo: NOME_DO_SOM[s.assetId] ?? 'Som',
      alvo: { tipo: 'som', id: s.id },
    });
  }
  return lista;
}

/** Os textos de tela (título, destaque...) e os elementos gráficos. */
export const COMPONENTES_DE_TEXTO = new Set(['HookTitle', 'CTA', 'Destaque', 'LowerThird', 'QuoteCard', 'StatCard']);

export interface RecursosDoTrecho {
  efeito: string | null;
  /** Filtro de cor (ou "Cor" quando só há ajustes). */
  cor: string | null;
  transicao: string | null;
  legendas: number;
  textos: number;
  elementos: number;
  sons: number;
  audio: string | null;
}

/**
 * Tudo o que está aplicado em cada trecho, pelo tempo: é o que o card
 * do trecho mostra, para a pessoa ver de relance o que a IA fez ali.
 */
export function recursosPorTrecho(
  plan: EditPlanV1,
  agenda: Agenda,
  blocos: readonly BlocoNaFaixa[],
): Map<string, RecursosDoTrecho> {
  const mapa = new Map<string, RecursosDoTrecho>();
  const transicaoAntes = new Map(plan.transitions.map((t) => [t.beforeClipIndex, t]));
  const cruza = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0;

  for (const t of agenda.trechos) {
    const ini = t.inicioMs;
    const fim = t.inicioMs + t.duracaoMs;
    const tr = transicaoAntes.get(t.indiceNoPlano);
    const a = t.clip.audio;
    const audio = a?.muted
      ? 'Mudo'
      : [
          a?.gainDb ? `${a.gainDb > 0 ? '+' : ''}${a.gainDb} dB` : '',
          a?.leadMs ? 'J' : '',
          a?.tailMs ? 'L' : '',
          a?.fadeInMs || a?.fadeOutMs ? 'fade' : '',
        ]
          .filter(Boolean)
          .join(' ') || null;
    mapa.set(t.clip.id, {
      efeito: t.clip.effect ? (NOME_DO_EFEITO[t.clip.effect] ?? t.clip.effect) : null,
      cor: t.clip.color && !corEhNeutra(t.clip.color) ? (definicaoDaAparencia(t.clip.color.look)?.rotulo ?? 'Cor') : null,
      transicao: tr && tr.type !== 'cut' ? (NOME_DA_TRANSICAO[tr.type] ?? tr.type) : null,
      legendas: blocos.filter((b) => cruza(ini, fim, b.inicioMs, b.fimMs)).length,
      textos: plan.overlays.filter((o) => COMPONENTES_DE_TEXTO.has(o.component) && cruza(ini, fim, o.timelineStartMs, o.timelineStartMs + o.durationMs)).length,
      elementos: plan.overlays.filter((o) => !COMPONENTES_DE_TEXTO.has(o.component) && cruza(ini, fim, o.timelineStartMs, o.timelineStartMs + o.durationMs)).length,
      sons: plan.soundEffects.filter((e) => e.timelineStartMs >= ini && e.timelineStartMs < fim).length,
      audio,
    });
  }
  return mapa;
}
