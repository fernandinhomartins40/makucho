// ============================================================
// O que está na tela AGORA (editor prático).
//
// Sem timeline, a pessoa escolhe o que mudar pelo que vê no quadro
// parado: o trecho do vídeo, a legenda, os textos, as imagens, a
// animação, a música. Cada entrada devolve o mesmo alvo que a timeline
// seleciona -- daí em diante, etiqueta e propriedades são as de sempre.
// ============================================================

import type { Icon } from '@phosphor-icons/react';
import type { EditPlanV1, PalavraDaTranscricao } from '@makucho/studio-contracts';
import { agendaDoPlano, definicaoDoEfeitoDeTela, definicaoDoSticker } from '@makucho/studio-contracts';
import { NOME_DO_ELEMENTO, blocosDeLegenda, cortes, type ItemDaTimeline } from '../timeline/camadas';
import { NOME_DA_TRANSICAO, NOME_DO_SOM } from '../biblioteca/catalogo';
import type { Alvo } from './EtiquetaDoItem';
import {
  IconeVideo,
  IconeLegenda,
  IconeTexto,
  IconeMidia,
  IconeAnimacao,
  IconeSticker,
  IconeEfeito,
  IconeSom,
  IconeMicrofone,
  IconeTrilha,
  IconeTransicao,
  IconeMarca,
} from '../icones';

export interface ItemNaCena {
  chave: string;
  rotulo: string;
  /** O texto do item (legenda, título), para distinguir dois do mesmo tipo. */
  detalhe?: string;
  Icone: Icon;
  alvo: Alvo;
}

/** Um som dura um instante: vale como "na tela" um pouco antes e depois. */
const JANELA_DO_SOM_MS = 700;
/** O corte é um ponto: aparece para quem parou perto dele. */
const JANELA_DO_CORTE_MS = 500;

const curto = (texto: string | undefined | null) => {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 26 ? `${t.slice(0, 24)}…` : t;
};

/** A legenda (da fala ou escrita à mão) que está na tela em `ms`, como a timeline a seleciona. */
export function legendaNoInstante(plan: EditPlanV1, palavras: readonly PalavraDaTranscricao[], ms: number): Extract<ItemDaTimeline, { tipo: 'legenda' }> | null {
  const blocos = blocosDeLegenda(plan, palavras);
  const i = blocos.findIndex((b) => ms >= b.inicioMs && ms < b.fimMs);
  const b = blocos[i];
  if (!b) return null;
  const proxima = blocos[i + 1]?.wordIds[0];
  return {
    tipo: 'legenda',
    id: b.id,
    wordIds: b.wordIds,
    inicios: b.inicios,
    ...(proxima && !b.manualId ? { proximaWordId: proxima } : {}),
    ...(b.manualId ? { manualId: b.manualId } : {}),
    inicioMs: b.inicioMs,
    fimMs: b.fimMs,
    texto: b.texto,
  };
}

export function itensNaCena(plan: EditPlanV1, ms: number, palavras: readonly PalavraDaTranscricao[], desligados: readonly string[]): ItemNaCena[] {
  const dentro = (inicio: number, duracao: number) => ms >= inicio && ms < inicio + duracao;
  const lista: ItemNaCena[] = [];

  const agenda = agendaDoPlano(plan, [...desligados]);
  const trecho = agenda.trechos.find((t) => dentro(t.inicioMs, t.duracaoMs)) ?? agenda.trechos[agenda.trechos.length - 1];
  if (trecho) lista.push({ chave: `clipe-${trecho.clip.id}`, rotulo: 'Vídeo', detalhe: 'este trecho', Icone: IconeVideo, alvo: { tipo: 'clipe', id: trecho.clip.id } });

  const legenda = legendaNoInstante(plan, palavras, ms);
  if (legenda) lista.push({ chave: `legenda-${legenda.id}`, rotulo: 'Legenda', detalhe: curto(legenda.texto), Icone: IconeLegenda, alvo: { tipo: 'item', item: legenda } });

  for (const o of plan.overlays) {
    if (!dentro(o.timelineStartMs, o.durationMs)) continue;
    const logo = o.component === 'LogoBug';
    lista.push({
      chave: `elemento-${o.id}`,
      rotulo: NOME_DO_ELEMENTO[o.component] ?? 'Elemento',
      ...(o.text ? { detalhe: curto(o.text) } : {}),
      Icone: logo ? IconeMarca : o.component === 'ImageOverlay' ? IconeMidia : IconeTexto,
      alvo: { tipo: 'item', item: { tipo: 'elemento', id: o.id } },
    });
  }

  for (const m of plan.mediaLayers ?? []) {
    if (!dentro(m.timelineStartMs, m.durationMs)) continue;
    const animacao = m.kind === 'html' || m.kind === 'cena';
    lista.push({
      chave: `midia-${m.id}`,
      rotulo: animacao ? 'Animação' : m.kind === 'sticker' ? 'Enfeite' : m.kind === 'video' ? 'Vídeo por cima' : 'Imagem',
      ...(m.kind === 'sticker' && definicaoDoSticker(m.assetId)?.rotulo ? { detalhe: definicaoDoSticker(m.assetId)!.rotulo } : {}),
      Icone: animacao ? IconeAnimacao : m.kind === 'sticker' ? IconeSticker : IconeMidia,
      alvo: { tipo: 'item', item: { tipo: 'midia', id: m.id } },
    });
  }

  for (const e of plan.screenEffects ?? []) {
    if (!dentro(e.timelineStartMs, e.durationMs)) continue;
    lista.push({ chave: `efeito-${e.id}`, rotulo: 'Efeito', detalhe: definicaoDoEfeitoDeTela(e.type)?.rotulo ?? e.type, Icone: IconeEfeito, alvo: { tipo: 'item', item: { tipo: 'efeito', id: e.id } } });
  }

  for (const c of cortes(plan)) {
    if (!c.transicao || c.transicao.type === 'cut' || Math.abs(ms - c.ms) > JANELA_DO_CORTE_MS) continue;
    lista.push({ chave: `corte-${c.clipId}`, rotulo: 'Transição', detalhe: NOME_DA_TRANSICAO[c.transicao.type] ?? c.transicao.type, Icone: IconeTransicao, alvo: { tipo: 'item', item: { tipo: 'corte', id: c.clipId, clipId: c.clipId, ms: c.ms } } });
  }

  for (const s of plan.soundEffects) {
    if (Math.abs(ms - s.timelineStartMs) > JANELA_DO_SOM_MS) continue;
    lista.push({ chave: `som-${s.id}`, rotulo: 'Som', detalhe: NOME_DO_SOM[s.assetId] ?? 'do seu acervo', Icone: IconeSom, alvo: { tipo: 'item', item: { tipo: 'som', id: s.id } } });
  }

  for (const n of plan.voiceovers ?? []) {
    if (!dentro(n.timelineStartMs, n.durationMs)) continue;
    lista.push({ chave: `narracao-${n.id}`, rotulo: 'Narração', Icone: IconeMicrofone, alvo: { tipo: 'item', item: { tipo: 'narracao', id: n.id } } });
  }

  if (plan.music) lista.push({ chave: 'trilha', rotulo: 'Música', Icone: IconeTrilha, alvo: { tipo: 'item', item: { tipo: 'trilha', id: 'trilha' } } });

  return lista;
}
