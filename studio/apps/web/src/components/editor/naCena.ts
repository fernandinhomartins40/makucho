// ============================================================
// O que há no vídeo, sem timeline (editor prático).
//
// Sem as faixas, a pessoa escolhe o que mudar pelo que vê no quadro
// parado (itensNaCena) ou pela lista de tudo o que o vídeo tem
// (itensDoVideo): o trecho, a legenda, os textos, as imagens, a
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
  /** Onde o item está no vídeo. */
  inicioMs: number;
  fimMs: number;
}

/** Um som dura um instante: vale como "na tela" um pouco antes e depois. */
const JANELA_DO_SOM_MS = 700;
/** O corte é um ponto: aparece para quem parou perto dele. */
const JANELA_DO_CORTE_MS = 500;

const curto = (texto: string | undefined | null) => {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 26 ? `${t.slice(0, 24)}…` : t;
};

/** A chave de um alvo: a mesma de `ItemNaCena.chave`. */
export function chaveDoAlvo(alvo: Alvo): string {
  if (alvo.tipo === 'clipe') return `clipe-${alvo.id}`;
  return alvo.item.tipo === 'trilha' ? 'trilha' : `${alvo.item.tipo}-${alvo.item.id}`;
}

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

/** Os trechos do vídeo, na ordem em que tocam. */
function trechos(plan: EditPlanV1, desligados: readonly string[]): ItemNaCena[] {
  return agendaDoPlano(plan, [...desligados]).trechos.map((t, n) => ({
    chave: `clipe-${t.clip.id}`,
    rotulo: 'Vídeo',
    detalhe: `trecho ${n + 1}`,
    Icone: IconeVideo,
    alvo: { tipo: 'clipe', id: t.clip.id },
    inicioMs: t.inicioMs,
    fimMs: t.inicioMs + t.duracaoMs,
  }));
}

/** Tudo o que foi posto sobre o vídeo (menos a legenda da fala, que são centenas de blocos). */
function sobreOVideo(plan: EditPlanV1): ItemNaCena[] {
  const lista: ItemNaCena[] = [];

  for (const o of plan.overlays) {
    lista.push({
      chave: `elemento-${o.id}`,
      rotulo: NOME_DO_ELEMENTO[o.component] ?? 'Elemento',
      ...(o.text ? { detalhe: curto(o.text) } : {}),
      Icone: o.component === 'LogoBug' ? IconeMarca : o.component === 'ImageOverlay' ? IconeMidia : IconeTexto,
      alvo: { tipo: 'item', item: { tipo: 'elemento', id: o.id } },
      inicioMs: o.timelineStartMs,
      fimMs: o.timelineStartMs + o.durationMs,
    });
  }

  for (const m of plan.mediaLayers ?? []) {
    const animacao = m.kind === 'html' || m.kind === 'cena';
    const sticker = m.kind === 'sticker' ? definicaoDoSticker(m.assetId)?.rotulo : undefined;
    lista.push({
      chave: `midia-${m.id}`,
      rotulo: animacao ? 'Animação' : m.kind === 'sticker' ? 'Enfeite' : m.kind === 'video' ? 'Vídeo por cima' : 'Imagem',
      ...(sticker ? { detalhe: sticker } : {}),
      Icone: animacao ? IconeAnimacao : m.kind === 'sticker' ? IconeSticker : IconeMidia,
      alvo: { tipo: 'item', item: { tipo: 'midia', id: m.id } },
      inicioMs: m.timelineStartMs,
      fimMs: m.timelineStartMs + m.durationMs,
    });
  }

  for (const e of plan.screenEffects ?? []) {
    lista.push({
      chave: `efeito-${e.id}`,
      rotulo: 'Efeito',
      detalhe: definicaoDoEfeitoDeTela(e.type)?.rotulo ?? e.type,
      Icone: IconeEfeito,
      alvo: { tipo: 'item', item: { tipo: 'efeito', id: e.id } },
      inicioMs: e.timelineStartMs,
      fimMs: e.timelineStartMs + e.durationMs,
    });
  }

  for (const c of cortes(plan)) {
    if (!c.transicao || c.transicao.type === 'cut') continue;
    lista.push({
      chave: `corte-${c.clipId}`,
      rotulo: 'Transição',
      detalhe: NOME_DA_TRANSICAO[c.transicao.type] ?? c.transicao.type,
      Icone: IconeTransicao,
      alvo: { tipo: 'item', item: { tipo: 'corte', id: c.clipId, clipId: c.clipId, ms: c.ms } },
      inicioMs: Math.max(0, c.ms - JANELA_DO_CORTE_MS),
      fimMs: c.ms + JANELA_DO_CORTE_MS,
    });
  }

  for (const s of plan.soundEffects) {
    lista.push({
      chave: `som-${s.id}`,
      rotulo: 'Som',
      detalhe: NOME_DO_SOM[s.assetId] ?? 'do seu acervo',
      Icone: IconeSom,
      alvo: { tipo: 'item', item: { tipo: 'som', id: s.id } },
      inicioMs: s.timelineStartMs,
      fimMs: s.timelineStartMs + (s.durationMs ?? JANELA_DO_SOM_MS),
    });
  }

  for (const n of plan.voiceovers ?? []) {
    lista.push({
      chave: `narracao-${n.id}`,
      rotulo: 'Narração',
      Icone: IconeMicrofone,
      alvo: { tipo: 'item', item: { tipo: 'narracao', id: n.id } },
      inicioMs: n.timelineStartMs,
      fimMs: n.timelineStartMs + n.durationMs,
    });
  }

  if (plan.music) {
    const inicio = plan.music.timelineStartMs ?? 0;
    lista.push({
      chave: 'trilha',
      rotulo: 'Música',
      Icone: IconeTrilha,
      alvo: { tipo: 'item', item: { tipo: 'trilha', id: 'trilha' } },
      inicioMs: inicio,
      fimMs: plan.music.durationMs !== undefined ? inicio + plan.music.durationMs : Number.POSITIVE_INFINITY,
    });
  }

  return lista;
}

/** O que está na tela no instante `ms`: é o que a bandeja oferece para tocar e mudar. */
export function itensNaCena(plan: EditPlanV1, ms: number, palavras: readonly PalavraDaTranscricao[], desligados: readonly string[]): ItemNaCena[] {
  const lista: ItemNaCena[] = [];

  const doVideo = trechos(plan, desligados);
  const trecho = doVideo.find((t) => ms >= t.inicioMs && ms < t.fimMs) ?? doVideo[doVideo.length - 1];
  if (trecho) lista.push({ ...trecho, detalhe: 'este trecho' });

  const legenda = legendaNoInstante(plan, palavras, ms);
  if (legenda) {
    lista.push({ chave: `legenda-${legenda.id}`, rotulo: 'Legenda', detalhe: curto(legenda.texto), Icone: IconeLegenda, alvo: { tipo: 'item', item: legenda }, inicioMs: legenda.inicioMs, fimMs: legenda.fimMs });
  }

  for (const i of sobreOVideo(plan)) {
    // O som é um instante: vale também um pouco antes dele.
    const folga = i.alvo.tipo === 'item' && i.alvo.item.tipo === 'som' ? JANELA_DO_SOM_MS : 0;
    if (ms >= i.inicioMs - folga && ms < i.fimMs) lista.push(i);
  }
  return lista;
}

/** Tudo o que o vídeo tem, na ordem do tempo: a lista que faz as vezes das faixas. */
export function itensDoVideo(plan: EditPlanV1, desligados: readonly string[]): ItemNaCena[] {
  return [...trechos(plan, desligados), ...sobreOVideo(plan).sort((a, b) => a.inicioMs - b.inicioMs)];
}

/** O item de um alvo já escolhido (para o nome e o tempo dele na bandeja), esteja ou não na tela. */
export function itemDoAlvo(plan: EditPlanV1, alvo: Alvo, desligados: readonly string[]): ItemNaCena | null {
  if (alvo.tipo === 'item' && alvo.item.tipo === 'legenda') {
    const l = alvo.item;
    return { chave: chaveDoAlvo(alvo), rotulo: 'Legenda', detalhe: curto(l.texto), Icone: IconeLegenda, alvo, inicioMs: l.inicioMs, fimMs: l.fimMs };
  }
  const chave = chaveDoAlvo(alvo);
  return itensDoVideo(plan, desligados).find((i) => i.chave === chave) ?? null;
}
