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

import { montarBlocos, resolverEstiloDaLegenda } from '@makucho/studio-contracts';
import type { EditPlanV1, PalavraDaTranscricao } from '@makucho/studio-contracts';

export type AbaDoElemento = 'estilos' | 'texto' | 'fundo' | 'animacao';

export type ItemDaTimeline =
  | { tipo: 'legenda'; id: string; wordIds: string[]; manualId?: string; inicioMs: number; fimMs: number; texto: string }
  | { tipo: 'corte'; id: string; clipId: string; ms: number }
  /** `aba`: a aba do painel que abre junto (clique duplo = Estilos). */
  | { tipo: 'elemento'; id: string; aba?: AbaDoElemento }
  | { tipo: 'som'; id: string };

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

const NOME_DO_EFEITO: Record<string, string> = {
  punch_in: 'Zoom rápido',
  zoom_lento: 'Zoom lento',
};

const NOME_DO_SOM: Record<string, string> = {
  'sfx-whoosh': 'Whoosh',
  'sfx-pop': 'Pop',
  'sfx-click': 'Clique',
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
