'use client';

// ============================================================
// A etiqueta do que está selecionado: ícones, junto do elemento.
//
// Tocou num trecho, texto, imagem, som, narração ou legenda (na
// timeline ou no vídeo): aparece, logo acima dele, uma etiqueta pequena
// só com ícones -- editar, duplicar, excluir e o que é daquele tipo
// (dividir e velocidade num trecho, estilo num texto). Os ícones com
// mais opções (velocidade, "mais") abrem um mini menu. Copiar e colar
// valem entre itens do mesmo tipo e colam no cursor.
// ============================================================

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Icon } from '@phosphor-icons/react';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { VELOCIDADES_DO_TRECHO, agendaDoPlano, timelineOperationSchema, velocidadeDoTrecho } from '@makucho/studio-contracts';
import type { ItemDaTimeline } from '../timeline/camadas';
import {
  IconeRenomear,
  IconeCopiar,
  IconeLixeira,
  IconeDividir,
  IconeVelocidade,
  IconeMaisOpcoes,
  IconeFechar,
  IconeTexto,
  IconeVolume,
  IconeMudo,
  IconeCor,
  IconeCortar,
} from '../icones';

/** O que foi copiado: a operação de "adicionar" pronta, sem posição. */
export interface ItemCopiado {
  rotulo: string;
  criar: (inicioMs: number) => TimelineOperation | null;
}

export type Alvo = { tipo: 'clipe'; id: string } | { tipo: 'item'; item: ItemDaTimeline };

interface Props {
  plan: EditPlanV1;
  alvo: Alvo | null;
  posicaoMs: number;
  copiado: ItemCopiado | null;
  onCopiar: (c: ItemCopiado) => void;
  onOperacao: (op: TimelineOperation) => void;
  onOperacoes: (ops: TimelineOperation[]) => void;
  /** Abre as propriedades (com a aba de estilos, para textos). */
  onEditar: (estilos?: boolean) => void;
  /** Abre a cor do trecho. */
  onCor: () => void;
  onDesmarcar: () => void;
}

type Acao = { id: string; rotulo: string; Icone: Icon; fazer?: () => void; menu?: Array<{ rotulo: string; ativo?: boolean; fazer: () => void }>; perigo?: boolean; desligada?: boolean };

/** Uma operação montada à mão passa pelo schema (tira campos que não são dela). */
function op(bruta: Record<string, unknown>): TimelineOperation | null {
  const r = timelineOperationSchema.safeParse(bruta);
  return r.success ? r.data : null;
}

export function EtiquetaDoItem({ plan, alvo, posicaoMs, copiado, onCopiar, onOperacao, onOperacoes, onEditar, onCor, onDesmarcar }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [lugar, setLugar] = useState<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => setMenu(null), [alvo]);

  // Onde o elemento está na tela (acompanha rolagem, zoom e o cursor).
  const seletor = !alvo ? null : alvo.tipo === 'clipe' ? `[data-arrastavel="clipe-${alvo.id}"]` : seletorDoItem(alvo.item);
  useLayoutEffect(() => {
    if (!seletor) return;
    let quadro = 0;
    const medir = () => {
      const el = document.querySelector<HTMLElement>(seletor);
      const area = document.querySelector<HTMLElement>('.timeline__rolagem')?.getBoundingClientRect();
      if (el && area) {
        const r = el.getBoundingClientRect();
        const w = ref.current?.offsetWidth ?? 220;
        const cx = Math.min(Math.max(r.left + r.width / 2, area.left + w / 2 + 4), area.right - w / 2 - 4);
        const cy = Math.max(area.top + 4, r.top) - 8;
        setLugar((l) => (l && Math.abs(l.x - cx) < 0.5 && Math.abs(l.y - cy) < 0.5 ? l : { x: cx, y: cy }));
      } else setLugar(null);
      quadro = requestAnimationFrame(medir);
    };
    medir();
    return () => cancelAnimationFrame(quadro);
  }, [seletor]);

  if (!alvo) return null;
  const acoes = acoesDo(alvo, { plan, posicaoMs, copiado, onCopiar, onOperacao, onOperacoes, onEditar, onCor, onDesmarcar });
  if (!acoes.length) return null;

  return (
    <div
      ref={ref}
      className="etiqueta-do-item"
      role="toolbar"
      aria-label="Ações do item selecionado"
      style={lugar ? { left: lugar.x, top: lugar.y } : { left: '50%', bottom: 16 }}
      data-solta={!lugar || undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {acoes.map((a) => (
        <div key={a.id} className="etiqueta-do-item__lugar">
          <button
            type="button"
            className="etiqueta-do-item__botao"
            data-perigo={a.perigo || undefined}
            disabled={a.desligada}
            aria-label={a.rotulo}
            title={a.rotulo}
            aria-expanded={a.menu ? menu === a.id : undefined}
            onClick={() => (a.menu ? setMenu((m) => (m === a.id ? null : a.id)) : a.fazer?.())}
          >
            <a.Icone size={17} />
          </button>
          {a.menu && menu === a.id && (
            <div className="etiqueta-do-item__menu" role="menu">
              {a.menu.map((m) => (
                <button
                  key={m.rotulo}
                  type="button"
                  role="menuitem"
                  aria-checked={m.ativo}
                  onClick={() => {
                    setMenu(null);
                    m.fazer();
                  }}
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function seletorDoItem(i: ItemDaTimeline): string {
  switch (i.tipo) {
    case 'legenda':
      return `[data-arrastavel="legenda-${i.manualId ?? i.id}"]`;
    case 'elemento':
      return `[data-arrastavel="elemento-${i.id}"]`;
    case 'corte':
      return '.corte[data-selecionado]';
    case 'trilha':
      return '[data-arrastavel="trilha-trilha"]';
    default:
      return `[data-arrastavel="${i.tipo}-${i.id}"]`;
  }
}

type Ctx = Omit<Props, 'alvo'>;

function acoesDo(alvo: Alvo, c: Ctx): Acao[] {
  const editar: Acao = { id: 'editar', rotulo: 'Editar', Icone: IconeRenomear, fazer: () => c.onEditar() };
  const fechar: Acao = { id: 'fechar', rotulo: 'Fechar', Icone: IconeFechar, fazer: c.onDesmarcar };

  // ---------- Trecho do vídeo ----------
  if (alvo.tipo === 'clipe') {
    const clip = c.plan.clips.find((x) => x.id === alvo.id);
    if (!clip) return [];
    const t = agendaDoPlano(c.plan).trechos.find((x) => x.clip.id === clip.id);
    const dentro = t ? c.posicaoMs - t.inicioMs : -1;
    const noCursor = t && dentro > 300 && dentro < t.duracaoMs - 300 ? clip.sourceStartMs + dentro * t.velocidade : null;
    const v = velocidadeDoTrecho(clip);
    return [
      editar,
      { id: 'dividir', rotulo: 'Dividir no cursor', Icone: IconeDividir, desligada: noCursor === null, fazer: () => noCursor !== null && c.onOperacao({ op: 'dividir_clipe', clipId: clip.id, sourceMs: Math.round(noCursor) }) },
      { id: 'cortar', rotulo: 'Cortar o começo até o cursor', Icone: IconeCortar, desligada: noCursor === null, fazer: () => noCursor !== null && c.onOperacao({ op: 'ajustar_corte', clipId: clip.id, sourceStartMs: Math.round(noCursor), sourceEndMs: clip.sourceEndMs }) },
      { id: 'duplicar', rotulo: 'Duplicar', Icone: IconeCopiar, fazer: () => c.onOperacao({ op: 'duplicar_clipe', clipId: clip.id }) },
      {
        id: 'velocidade',
        rotulo: `Velocidade (${String(v).replace('.', ',')}x)`,
        Icone: IconeVelocidade,
        menu: VELOCIDADES_DO_TRECHO.filter((s) => (clip.sourceEndMs - clip.sourceStartMs) / s >= 500).map((s) => ({
          rotulo: `${String(s).replace('.', ',')}x`,
          ativo: Math.abs(s - v) < 0.001,
          fazer: () => c.onOperacao({ op: 'definir_velocidade', clipId: clip.id, speed: s }),
        })),
      },
      {
        id: 'som',
        rotulo: 'Som do trecho',
        Icone: clip.audio?.muted ? IconeMudo : IconeVolume,
        menu: [
          { rotulo: clip.audio?.muted ? 'Ligar o som' : 'Deixar mudo', fazer: () => c.onOperacao({ op: 'ajustar_audio_do_clipe', clipId: clip.id, muted: clip.audio?.muted ? null : true }) },
          { rotulo: 'Mais baixo', fazer: () => c.onOperacao({ op: 'ajustar_audio_do_clipe', clipId: clip.id, gainDb: Math.max(-30, (clip.audio?.gainDb ?? 0) - 6) }) },
          { rotulo: 'Mais alto', fazer: () => c.onOperacao({ op: 'ajustar_audio_do_clipe', clipId: clip.id, gainDb: Math.min(12, (clip.audio?.gainDb ?? 0) + 6) }) },
        ],
      },
      { id: 'cor', rotulo: 'Cor', Icone: IconeCor, fazer: c.onCor },
      {
        id: 'excluir',
        rotulo: 'Tirar do vídeo',
        Icone: IconeLixeira,
        perigo: true,
        desligada: c.plan.clips.length <= 1,
        fazer: () => {
          c.onOperacao({ op: 'alternar_clipe', clipId: clip.id, enabled: false });
          c.onDesmarcar();
        },
      },
      fechar,
    ];
  }

  // ---------- Itens das faixas ----------
  const i = alvo.item;
  const criar = copiaveis(c.plan, i);
  const duracao = criar?.duracaoMs ?? 0;
  const inicio = criar?.inicioMs ?? 0;
  const remover = removerItem(c.plan, i);
  const mover = moverItem(i);

  const lista: Acao[] = [editar];
  if (i.tipo === 'elemento') lista.push({ id: 'estilo', rotulo: 'Estilo', Icone: IconeTexto, fazer: () => c.onEditar(true) });
  if (criar) {
    lista.push({
      id: 'duplicar',
      rotulo: 'Duplicar',
      Icone: IconeCopiar,
      fazer: () => {
        const o = criar.criar(inicio + duracao);
        if (o) c.onOperacao(o);
      },
    });
  }
  if (i.tipo === 'audio') {
    const clip = c.plan.clips.find((x) => x.id === i.id);
    lista.push({ id: 'mudo', rotulo: clip?.audio?.muted ? 'Ligar o som' : 'Deixar mudo', Icone: clip?.audio?.muted ? IconeMudo : IconeVolume, fazer: () => c.onOperacao({ op: 'ajustar_audio_do_clipe', clipId: i.id, muted: clip?.audio?.muted ? null : true }) });
  }
  const mais: Array<{ rotulo: string; fazer: () => void }> = [];
  if (criar) mais.push({ rotulo: 'Copiar', fazer: () => c.onCopiar({ rotulo: criar.rotulo, criar: criar.criar }) });
  if (c.copiado) {
    mais.push({
      rotulo: `Colar ${c.copiado.rotulo.toLowerCase()} no cursor`,
      fazer: () => {
        const o = c.copiado?.criar(Math.round(c.posicaoMs));
        if (o) c.onOperacao(o);
      },
    });
  }
  if (mover) mais.push({ rotulo: 'Trazer para o cursor', fazer: () => c.onOperacao(mover(Math.round(c.posicaoMs))) });
  if (mais.length) lista.push({ id: 'mais', rotulo: 'Mais opções', Icone: IconeMaisOpcoes, menu: mais });
  if (remover) {
    lista.push({
      id: 'excluir',
      rotulo: i.tipo === 'corte' ? 'Tirar a transição' : i.tipo === 'legenda' && !i.manualId ? 'Esconder esta legenda' : 'Excluir',
      Icone: IconeLixeira,
      perigo: true,
      fazer: () => {
        c.onOperacao(remover);
        c.onDesmarcar();
      },
    });
  }
  lista.push(fechar);
  return lista;
}

/** A receita de "adicionar outro igual" de cada item (para duplicar e copiar). */
function copiaveis(plan: EditPlanV1, i: ItemDaTimeline): { rotulo: string; inicioMs: number; duracaoMs: number; criar: (ms: number) => TimelineOperation | null } | null {
  if (i.tipo === 'elemento') {
    const o = plan.overlays.find((x) => x.id === i.id);
    if (!o || o.component === 'ProgressBar') return null;
    const { id: _id, ...resto } = o;
    return { rotulo: 'Texto', inicioMs: o.timelineStartMs, duracaoMs: o.durationMs, criar: (ms) => op({ ...resto, op: 'adicionar_overlay', timelineStartMs: ms }) };
  }
  if (i.tipo === 'midia') {
    const m = (plan.mediaLayers ?? []).find((x) => x.id === i.id);
    if (!m) return null;
    const { id: _id, ...resto } = m;
    return { rotulo: 'Imagem', inicioMs: m.timelineStartMs, duracaoMs: m.durationMs, criar: (ms) => op({ ...resto, op: 'adicionar_midia', timelineStartMs: ms }) };
  }
  if (i.tipo === 'som') {
    const s = plan.soundEffects.find((x) => x.id === i.id);
    if (!s) return null;
    return { rotulo: 'Som', inicioMs: s.timelineStartMs, duracaoMs: 600, criar: (ms) => op({ op: 'adicionar_efeito_sonoro', assetId: s.assetId, gainDb: s.gainDb, timelineStartMs: ms }) };
  }
  if (i.tipo === 'narracao') {
    const n = (plan.voiceovers ?? []).find((x) => x.id === i.id);
    if (!n) return null;
    return { rotulo: 'Narração', inicioMs: n.timelineStartMs, duracaoMs: n.durationMs, criar: (ms) => op({ op: 'adicionar_narracao', assetId: n.assetId, durationMs: n.durationMs, gainDb: n.gainDb, timelineStartMs: ms }) };
  }
  if (i.tipo === 'efeito') {
    const e = (plan.screenEffects ?? []).find((x) => x.id === i.id);
    if (!e) return null;
    return { rotulo: 'Efeito', inicioMs: e.timelineStartMs, duracaoMs: e.durationMs, criar: (ms) => op({ op: 'adicionar_efeito_de_tela', type: e.type, intensity: e.intensity, durationMs: e.durationMs, timelineStartMs: ms }) };
  }
  if (i.tipo === 'legenda') {
    const d = i.fimMs - i.inicioMs;
    return { rotulo: 'Legenda', inicioMs: i.inicioMs, duracaoMs: d, criar: (ms) => op({ op: 'adicionar_legenda', text: i.texto, durationMs: Math.max(200, Math.min(20_000, Math.round(d))), timelineStartMs: ms }) };
  }
  return null;
}

function removerItem(plan: EditPlanV1, i: ItemDaTimeline): TimelineOperation | null {
  switch (i.tipo) {
    case 'legenda':
      return i.manualId ? { op: 'remover_legenda_manual', legendaId: i.manualId } : i.wordIds.length ? { op: 'ocultar_legenda', wordIds: i.wordIds.slice(0, 80) } : null;
    case 'elemento':
      return { op: 'remover_overlay', overlayId: i.id };
    case 'midia':
      return { op: 'remover_midia', mediaId: i.id };
    case 'som':
      return { op: 'remover_efeito_sonoro', soundEffectId: i.id };
    case 'narracao':
      return { op: 'remover_narracao', narracaoId: i.id };
    case 'efeito':
      return { op: 'remover_efeito_de_tela', effectId: i.id };
    case 'corte':
      return { op: 'definir_transicao', clipId: i.clipId, type: 'cut' };
    case 'trilha':
      return plan.music ? { op: 'trocar_musica', assetId: null } : null;
    default:
      return null;
  }
}

function moverItem(i: ItemDaTimeline): ((ms: number) => TimelineOperation) | null {
  switch (i.tipo) {
    case 'elemento':
      return (ms) => ({ op: 'editar_overlay', overlayId: i.id, timelineStartMs: ms });
    case 'midia':
      return (ms) => ({ op: 'editar_midia', mediaId: i.id, timelineStartMs: ms });
    case 'som':
      return (ms) => ({ op: 'editar_efeito_sonoro', soundEffectId: i.id, timelineStartMs: ms });
    case 'narracao':
      return (ms) => ({ op: 'editar_narracao', narracaoId: i.id, timelineStartMs: ms });
    case 'efeito':
      return (ms) => ({ op: 'editar_efeito_de_tela', effectId: i.id, timelineStartMs: ms });
    case 'legenda':
      return i.manualId ? (ms) => ({ op: 'editar_legenda_manual', legendaId: i.manualId!, timelineStartMs: ms }) : null;
    default:
      return null;
  }
}
