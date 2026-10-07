// ============================================================
// MAKUCHO STUDIO - O vídeo rico: tudo o que o Studio tem, sem IA.
//
// Em produção os vídeos saíam só com as animações: nenhum efeito de tela,
// zero ou uma transição, poucos sons, zoom em 2 de 9 trechos. O Studio tem
// 17 efeitos de tela, dezenas de transições, 26 sons e o zoom por trecho --
// mas eles entravam só quando a pessoa clicava num pacote.
//
// Aqui, depois das animações, uma regra amarra o resto A ELAS, no tempo de
// cada cena (o que um editor faz à mão):
//
//   - efeito de tela pela cena: flash na palavra grande, vinheta no número,
//     fundo escuro atrás dos cards em volta, tremor na virada, contorno de
//     luz nas linhas de perspectiva e no texto 3D;
//   - som pela cena: whoosh na entrada, ding no número, notificação na
//     mensagem, digitação no comentário (a fala protegida);
//   - abertura e fechamento pela energia (flash ou íris);
//   - transições e zoom alternado, se o vídeo ainda está no corte seco;
//
// Só acrescenta: o que já existe (escolhido pela pessoa, pelo Kit ou pela
// IA) fica. Determinístico: o mesmo vídeo dá o mesmo acabamento.
// ============================================================

import type { EditPlanV1 } from './edit-plan';
import type { TimelineOperation } from './timeline';
import type { TipoDeEfeitoDeTela } from './efeitos-de-tela';
import type { TipoDeTransicao } from './edit-plan';
import { agendaDoPlano } from './agenda';
import { DURACAO_PADRAO_DA_TRANSICAO, aplicarOperacoes } from './timeline';
import { sugerirSons, type IntervaloDeFala } from './protecao-da-fala';
import { cenaDaComposicao } from './motion-presets';

export interface CenaNoVideo {
  preset: string;
  inicioMs: number;
  fimMs: number;
  layout: string;
}

export interface OpcoesDaRiqueza {
  cenas: readonly CenaNoVideo[];
  fala: readonly IntervaloDeFala[];
  energia: 'baixa' | 'media' | 'alta';
  comRosto: boolean;
  /** Vídeo de história ou depoimento: abre e fecha em íris, passagens pelo preto. */
  calmo?: boolean;
}

/** O efeito de tela que cada cena pede (tipo, intensidade, quanto da cena: 'batida' = só a entrada). */
const EFEITO_DA_CENA: Record<string, { tipo: TipoDeEfeitoDeTela; k: number; trecho: 'cena' | 'batida'; precisaDeRosto?: boolean; energico?: boolean }> = {
  cartaz: { tipo: 'flash', k: 0.35, trecho: 'batida', energico: true },
  impacto: { tipo: 'flash', k: 0.35, trecho: 'batida', energico: true },
  selo: { tipo: 'tremor', k: 0.35, trecho: 'batida', energico: true },
  numero_gigante: { tipo: 'vinheta', k: 0.5, trecho: 'cena' },
  placar: { tipo: 'vinheta', k: 0.45, trecho: 'cena' },
  contador: { tipo: 'vinheta', k: 0.4, trecho: 'cena' },
  anel: { tipo: 'vinheta', k: 0.4, trecho: 'cena' },
  preco: { tipo: 'flash', k: 0.3, trecho: 'batida', energico: true },
  pergunta: { tipo: 'vinheta', k: 0.45, trecho: 'cena' },
  mosaico: { tipo: 'fundo_escuro', k: 0.45, trecho: 'cena', precisaDeRosto: true },
  ladeando: { tipo: 'fundo_escuro', k: 0.4, trecho: 'cena', precisaDeRosto: true },
  mensagem: { tipo: 'fundo_escuro', k: 0.35, trecho: 'cena', precisaDeRosto: true },
  comentario: { tipo: 'fundo_escuro', k: 0.35, trecho: 'cena', precisaDeRosto: true },
  linha_do_tempo: { tipo: 'fundo_escuro', k: 0.35, trecho: 'cena', precisaDeRosto: true },
  hud: { tipo: 'contorno_luz', k: 0.8, trecho: 'cena', precisaDeRosto: true },
  profundidade: { tipo: 'contorno_luz', k: 0.8, trecho: 'cena', precisaDeRosto: true },
  selecao: { tipo: 'contorno_luz', k: 0.7, trecho: 'cena', precisaDeRosto: true },
  antes_depois: { tipo: 'tremor', k: 0.3, trecho: 'batida', energico: true },
  alerta: { tipo: 'tremor', k: 0.35, trecho: 'batida', energico: true },
  objeto: { tipo: 'vinheta', k: 0.35, trecho: 'cena' },
};

/** O som que marca a entrada de cada cena (os sons embutidos do Studio). */
const SOM_DA_CENA: Record<string, string> = {
  numero_gigante: 'sfx-ding',
  contador: 'sfx-ding',
  anel: 'sfx-ding',
  preco: 'sfx-ding',
  placar: 'sfx-riser',
  barras: 'sfx-riser',
  linha: 'sfx-riser',
  mensagem: 'sfx-notificacao',
  notificacao: 'sfx-notificacao',
  comentario: 'sfx-digitar',
  busca: 'sfx-digitar',
  chat: 'sfx-pop',
  mosaico: 'sfx-pop',
  ladeando: 'sfx-pop',
  objeto: 'sfx-pop',
  icone: 'sfx-pop',
  lista: 'sfx-click',
  passos: 'sfx-click',
  ranking: 'sfx-tambor',
  selo: 'sfx-soco',
  alerta: 'sfx-erro',
  pergunta: 'sfx-whoosh-grave',
  janela: 'sfx-swipe',
  linha_do_tempo: 'sfx-swipe',
  selecao: 'sfx-camera',
  hud: 'sfx-zap',
  profundidade: 'sfx-whoosh-grave',
  cartaz: 'sfx-whoosh',
  frase: 'sfx-whoosh',
  citacao: 'sfx-whoosh',
  versus: 'sfx-swipe',
  antes_depois: 'sfx-swipe',
  termo: 'sfx-click',
};

const DURACAO_DO_SOM_PADRAO = 600;

/**
 * As operações que deixam o vídeo rico, sobre o plano que já tem as
 * animações. Vazio quando não há o que acrescentar.
 */
export function operacoesDeRiqueza(plano: EditPlanV1, o: OpcoesDaRiqueza): TimelineOperation[] {
  const ops: TimelineOperation[] = [];
  const agenda = agendaDoPlano(plano);
  const total = agenda.duracaoMs;
  if (total < 1500) return ops;
  const efeitos: Array<{ tipo: string; ini: number; fim: number }> = (plano.screenEffects ?? []).map((e) => ({ tipo: e.type, ini: e.timelineStartMs, fim: e.timelineStartMs + e.durationMs }));
  const efeito = (tipo: TipoDeEfeitoDeTela, ini: number, dur: number, k: number) => {
    const fim = ini + dur;
    // O mesmo tipo não se sobrepõe; e nunca três efeitos ao mesmo tempo.
    if (efeitos.some((e) => e.tipo === tipo && e.ini < fim && e.fim > ini)) return;
    if (efeitos.filter((e) => e.ini < fim && e.fim > ini).length >= 2) return;
    efeitos.push({ tipo, ini, fim });
    ops.push({ op: 'adicionar_efeito_de_tela', type: tipo, timelineStartMs: Math.max(0, Math.round(ini)), durationMs: Math.max(100, Math.round(dur)), intensity: k });
  };

  // 1. Abertura e fechamento.
  if (!efeitos.some((e) => e.ini < 300)) {
    if (o.calmo) efeito('iris_abrir', 0, 700, 1);
    else if (o.energia !== 'baixa') efeito('flash', 0, 450, 0.7);
  }
  if (o.calmo && total > 4000 && !efeitos.some((e) => e.tipo === 'iris_fechar')) efeito('iris_fechar', total - 700, 700, 1);

  // 2. O efeito de cada cena, no tempo dela.
  for (const c of o.cenas) {
    const def = EFEITO_DA_CENA[c.preset];
    if (!def || (def.precisaDeRosto && !o.comRosto) || (def.energico && o.energia === 'baixa')) continue;
    // Cena que toma a tela inteira esconde o vídeo: o efeito não aparece.
    if (c.layout === 'tela_cheia') continue;
    const dur = c.fimMs - c.inicioMs;
    if (def.trecho === 'batida') efeito(def.tipo, c.inicioMs + 120, def.tipo === 'flash' ? 320 : 420, def.k);
    else efeito(def.tipo, c.inicioMs, dur, def.k);
  }

  // 3. Transições, se o vídeo ainda está todo no corte seco.
  const temTransicao = plano.transitions.some((t) => t.type !== 'cut');
  if (!temTransicao && agenda.trechos.length > 1) {
    const tipo: TipoDeTransicao = o.calmo ? 'fadeblack' : o.energia === 'alta' ? 'zoom_desfoque' : 'smooth';
    agenda.trechos.slice(1).forEach((t, i) => {
      // Uma sim, uma não: o corte seco também é ritmo.
      if (i % 2 === 1) return;
      ops.push({ op: 'definir_transicao', clipId: t.clip.id, type: tipo, durationMs: DURACAO_PADRAO_DA_TRANSICAO[tipo] });
    });
  }

  // 4. Zoom alternado nos trechos que o vídeo mostra (fora das cenas que cobrem o rosto).
  const cobertos = o.cenas.filter((c) => c.layout !== 'cartao');
  const comZoom = agenda.trechos.filter((t) => (t.clip.effect ?? 'nenhum') !== 'nenhum').length;
  if (agenda.trechos.length && comZoom / agenda.trechos.length < 0.4) {
    agenda.trechos.forEach((t, i) => {
      if ((t.clip.effect ?? 'nenhum') !== 'nenhum' || i % 2 === 0) return;
      const fim = t.inicioMs + t.duracaoMs;
      if (cobertos.some((c) => c.inicioMs < fim && c.fimMs > t.inicioMs)) return;
      ops.push({ op: 'definir_efeito', clipId: t.clip.id, effect: o.calmo || o.energia === 'baixa' ? 'zoom_lento' : 'punch_in' });
    });
  }

  // 5. Os sons: a entrada de cada cena e o que os efeitos e as transições pedem (fala protegida).
  const simulado = aplicarOperacoes(plano, ops as never);
  const base = simulado.ok && simulado.plan ? simulado.plan : plano;
  const daCena = o.cenas.filter((c) => SOM_DA_CENA[c.preset]).map((c) => ({ assetId: SOM_DA_CENA[c.preset]!, ms: c.inicioMs }));
  const ocupados = [...base.soundEffects.map((s) => s.timelineStartMs)];
  for (const s of [...sugerirSonsDasCenas(daCena, o.fala, ocupados, total), ...sugerirSons(base, o.fala)]) {
    if (ocupados.some((x) => Math.abs(x - s.timelineStartMs) < 700)) continue;
    if (ocupados.length >= 40) break;
    ocupados.push(s.timelineStartMs);
    ops.push({ op: 'adicionar_efeito_sonoro', assetId: s.assetId, timelineStartMs: s.timelineStartMs, gainDb: s.gainDb });
  }
  return ops;
}

/** O som de entrada de cada cena, um pouco antes dela (o whoosh "puxa" a cena), mais baixo que a fala. */
function sugerirSonsDasCenas(pedidos: ReadonlyArray<{ assetId: string; ms: number }>, fala: readonly IntervaloDeFala[], ocupados: readonly number[], total: number) {
  const saida: Array<{ assetId: string; timelineStartMs: number; gainDb: number }> = [];
  for (const p of pedidos) {
    const ms = Math.max(0, Math.round(p.ms - (p.assetId.includes('whoosh') || p.assetId === 'sfx-swipe' ? 150 : 0)));
    if (ms >= total - 200) continue;
    if ([...ocupados, ...saida.map((s) => s.timelineStartMs)].some((x) => Math.abs(x - ms) < 700)) continue;
    // Por cima da fala, o som fica mais baixo (não briga com a voz).
    const sobreAFala = fala.some((f) => f.inicioMs < ms + DURACAO_DO_SOM_PADRAO && f.fimMs > ms);
    saida.push({ assetId: p.assetId, timelineStartMs: ms, gainDb: sobreAFala ? -14 : -9 });
  }
  return saida;
}

/** A fala em intervalos, a partir das palavras (segundos): junta as que estão a menos de 0,6 s. */
export function intervalosDaFala(palavras: ReadonlyArray<{ s: number }>): IntervaloDeFala[] {
  const saida: IntervaloDeFala[] = [];
  for (const p of palavras) {
    const ini = Math.round(p.s * 1000);
    const ult = saida[saida.length - 1];
    if (ult && ini - ult.fimMs < 600) ult.fimMs = ini + 400;
    else saida.push({ inicioMs: ini, fimMs: ini + 400 });
  }
  return saida;
}

/** As cenas de motion do plano (as animações prontas), no tempo do vídeo. */
export function cenasDoPlano(plano: EditPlanV1): CenaNoVideo[] {
  return (plano.mediaLayers ?? []).flatMap((m) => {
    const cena = m.kind === 'html' && m.composicao ? cenaDaComposicao(m.composicao) : null;
    return cena ? [{ preset: cena.preset, inicioMs: m.timelineStartMs, fimMs: m.timelineStartMs + m.durationMs, layout: m.composicao!.layout }] : [];
  });
}
