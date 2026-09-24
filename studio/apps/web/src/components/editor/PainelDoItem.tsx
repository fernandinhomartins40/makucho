'use client';

// ============================================================
// Propriedades do item selecionado na timeline: legenda, corte
// (transição), elemento (título, chamada, destaque...) ou som.
//
// Cada ajuste vira uma operação do plano -- a mesma que a IA usa --, e
// a prévia e o render leem o mesmo plano: o que se ajusta aqui é o que
// sai no vídeo.
// ============================================================

import { useEffect, useState } from 'react';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import {
  ANIMACOES_DE_TEXTO,
  DECORACOES_DE_TEXTO,
  DURACAO_PADRAO_DA_TRANSICAO,
  FONTES_DE_VIDEO,
  TIPOS_DE_TRANSICAO,
} from '@makucho/studio-contracts';
import type { ItemDaTimeline } from '../timeline/camadas';
import { NOME_DO_ELEMENTO } from '../timeline/camadas';
import { IconeLixeira } from '../icones';
import { Segmentado } from './Inspector';

interface Props {
  plan: EditPlanV1;
  item: ItemDaTimeline;
  onOperacao: (op: TimelineOperation) => void;
  onOperacoes: (ops: TimelineOperation[]) => void;
  onFechar: () => void;
}

export const NOME_DA_TRANSICAO: Record<string, string> = {
  cut: 'Corte seco',
  fade: 'Esmaecer',
  dissolve: 'Dissolver',
  fadeblack: 'Pelo preto',
  slide: 'Deslizar',
  slideup: 'Subir',
  wipe: 'Cortina',
  smooth: 'Suave',
  zoom: 'Zoom',
  circle: 'Círculo',
  blur: 'Desfoque',
  pixelize: 'Pixels',
};

const NOME_DA_DECORACAO: Record<string, string> = {
  nenhuma: 'Nenhuma',
  contorno: 'Contorno',
  caixa: 'Caixa',
  sombra: 'Sombra',
  sublinhado: 'Sublinhado',
  marca_texto: 'Marca-texto',
};

const NOME_DA_ANIMACAO: Record<string, string> = {
  nenhuma: 'Nenhuma',
  pop: 'Pop',
  surgir: 'Surgir',
  deslizar: 'Deslizar',
};

const segundos = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',');
const paraMs = (texto: string) => Math.round(Number(texto.replace(',', '.')) * 1000);

export function PainelDoItem({ plan, item, onOperacao, onOperacoes, onFechar }: Props) {
  return (
    <div className="painel-do-item">
      <div className="linha entre" style={{ marginBottom: 'var(--e3)' }}>
        <strong style={{ fontSize: 15 }}>{titulo(plan, item)}</strong>
        <button type="button" className="botao botao--fantasma botao--pequeno" onClick={onFechar}>
          Voltar
        </button>
      </div>
      {item.tipo === 'legenda' && <Legenda item={item} onOperacao={onOperacao} onOperacoes={onOperacoes} onFechar={onFechar} />}
      {item.tipo === 'corte' && <Corte plan={plan} clipId={item.clipId} onOperacao={onOperacao} />}
      {item.tipo === 'elemento' && <Elemento plan={plan} overlayId={item.id} onOperacao={onOperacao} onFechar={onFechar} />}
      {item.tipo === 'som' && (
        <button
          type="button"
          className="botao botao--perigo botao--pequeno"
          onClick={() => {
            onOperacao({ op: 'remover_efeito_sonoro', soundEffectId: item.id });
            onFechar();
          }}
        >
          <IconeLixeira size={15} /> Remover efeito sonoro
        </button>
      )}
    </div>
  );
}

function titulo(plan: EditPlanV1, item: ItemDaTimeline): string {
  if (item.tipo === 'legenda') return item.manualId ? 'Legenda escrita à mão' : 'Legenda';
  if (item.tipo === 'corte') return 'Corte entre trechos';
  if (item.tipo === 'som') return 'Efeito sonoro';
  const o = plan.overlays.find((x) => x.id === item.id);
  return o ? (NOME_DO_ELEMENTO[o.component] ?? o.component) : 'Elemento';
}

// ---------- Legenda ----------

function Legenda({
  item,
  onOperacao,
  onOperacoes,
  onFechar,
}: {
  item: Extract<ItemDaTimeline, { tipo: 'legenda' }>;
  onOperacao: (op: TimelineOperation) => void;
  onOperacoes: (ops: TimelineOperation[]) => void;
  onFechar: () => void;
}) {
  const [texto, setTexto] = useState(item.texto);
  const [inicio, setInicio] = useState(segundos(item.inicioMs));
  const [duracao, setDuracao] = useState(segundos(item.fimMs - item.inicioMs));
  useEffect(() => {
    setTexto(item.texto);
    setInicio(segundos(item.inicioMs));
    setDuracao(segundos(item.fimMs - item.inicioMs));
  }, [item]);

  const salvar = () => {
    const limpo = texto.replace(/\s+/g, ' ').trim();
    if (!limpo) return;
    if (item.manualId) {
      onOperacao({
        op: 'editar_legenda_manual',
        legendaId: item.manualId,
        text: limpo,
        timelineStartMs: Math.max(0, paraMs(inicio)),
        durationMs: Math.max(200, paraMs(duracao)),
      });
      return;
    }
    if (limpo === item.texto) return;
    // Reescrever um bloco da fala: as palavras dele saem da tela e uma
    // legenda escrita entra no MESMO tempo -- a sincronia continua a
    // da fala.
    onOperacoes([
      { op: 'ocultar_legenda', wordIds: item.wordIds.slice(0, 80) },
      {
        op: 'adicionar_legenda',
        timelineStartMs: item.inicioMs,
        durationMs: Math.max(200, item.fimMs - item.inicioMs),
        text: limpo,
      },
    ]);
    onFechar();
  };

  return (
    <div className="pilha" style={{ gap: 'var(--e3)' }}>
      <label className="campo" style={{ marginBottom: 0 }}>
        <span className="campo__rotulo">Texto</span>
        <textarea className="campo__area" style={{ minHeight: 70 }} value={texto} maxLength={160} onChange={(e) => setTexto(e.target.value)} />
      </label>
      {item.manualId ? (
        <div className="linha" style={{ gap: 'var(--e2)' }}>
          <label className="campo crescer" style={{ marginBottom: 0 }}>
            <span className="campo__rotulo">Início (s)</span>
            <input className="campo__entrada" inputMode="decimal" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label className="campo crescer" style={{ marginBottom: 0 }}>
            <span className="campo__rotulo">Duração (s)</span>
            <input className="campo__entrada" inputMode="decimal" value={duracao} onChange={(e) => setDuracao(e.target.value)} />
          </label>
        </div>
      ) : (
        <p className="campo__ajuda">
          De {segundos(item.inicioMs)} s a {segundos(item.fimMs)} s, no tempo exato da fala. Ao reescrever, o tempo se mantém.
        </p>
      )}
      <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
        <button type="button" className="botao botao--pequeno" onClick={salvar}>
          Salvar
        </button>
        <button
          type="button"
          className="botao botao--perigo botao--pequeno"
          onClick={() => {
            if (item.manualId) onOperacao({ op: 'remover_legenda_manual', legendaId: item.manualId });
            else onOperacao({ op: 'ocultar_legenda', wordIds: item.wordIds.slice(0, 80) });
            onFechar();
          }}
        >
          <IconeLixeira size={15} /> Excluir legenda
        </button>
      </div>
    </div>
  );
}

// ---------- Corte / transição ----------

function Corte({ plan, clipId, onOperacao }: { plan: EditPlanV1; clipId: string; onOperacao: (op: TimelineOperation) => void }) {
  const indice = plan.clips.findIndex((c) => c.id === clipId);
  const atual = plan.transitions.find((t) => t.beforeClipIndex === indice) ?? null;
  const tipo = atual?.type ?? 'cut';
  const duracao = atual?.durationMs ?? 400;

  return (
    <div className="pilha" style={{ gap: 'var(--e3)' }}>
      <p className="campo__ajuda" style={{ marginTop: 0 }}>
        Em vídeo falado o corte seco costuma ser a melhor escolha. Transição funciona na virada de assunto.
      </p>
      <div className="transicoes" role="radiogroup" aria-label="Tipo de transição">
        {TIPOS_DE_TRANSICAO.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tipo === t}
            className="transicoes__item"
            onClick={() => onOperacao({ op: 'definir_transicao', clipId, type: t, ...(t !== 'cut' ? { durationMs: atual?.durationMs ?? DURACAO_PADRAO_DA_TRANSICAO[t] } : {}) })}
          >
            {NOME_DA_TRANSICAO[t] ?? t}
          </button>
        ))}
      </div>
      {tipo !== 'cut' && (
        <label className="campo" style={{ marginBottom: 0 }}>
          <span className="campo__rotulo">
            Duração: {(duracao / 1000).toFixed(2).replace('.', ',')} s
          </span>
          <input
            type="range"
            className="deslizante"
            min={150}
            max={1500}
            step={50}
            value={duracao}
            onChange={(e) => onOperacao({ op: 'definir_transicao', clipId, type: tipo, durationMs: Number(e.target.value) })}
          />
        </label>
      )}
    </div>
  );
}

// ---------- Elemento (título, chamada, destaque...) ----------

function Elemento({
  plan,
  overlayId,
  onOperacao,
  onFechar,
}: {
  plan: EditPlanV1;
  overlayId: string;
  onOperacao: (op: TimelineOperation) => void;
  onFechar: () => void;
}) {
  const o = plan.overlays.find((x) => x.id === overlayId);
  const [texto, setTexto] = useState(o?.text ?? '');
  const [inicio, setInicio] = useState(segundos(o?.timelineStartMs ?? 0));
  const [duracao, setDuracao] = useState(segundos(o?.durationMs ?? 0));
  useEffect(() => {
    setTexto(o?.text ?? '');
    setInicio(segundos(o?.timelineStartMs ?? 0));
    setDuracao(segundos(o?.durationMs ?? 0));
  }, [o?.id, o?.text, o?.timelineStartMs, o?.durationMs]);

  if (!o) return <p className="texto-secundario">Este elemento não existe mais.</p>;
  const temTexto = o.component !== 'LogoBug' && o.component !== 'ProgressBar' && o.component !== 'ImageOverlay';
  const destaque = o.component === 'Destaque';
  const e = o.style ?? {};
  const estilo = (mudanca: NonNullable<EditPlanV1['overlays'][number]['style']>) =>
    onOperacao({ op: 'editar_overlay', overlayId, style: mudanca });

  return (
    <div className="pilha" style={{ gap: 'var(--e3)' }}>
      {temTexto && (
        <label className="campo" style={{ marginBottom: 0 }}>
          <span className="campo__rotulo">Texto</span>
          <input
            className="campo__entrada"
            value={texto}
            maxLength={200}
            onChange={(ev) => setTexto(ev.target.value)}
            onBlur={() => texto.trim() && texto !== o.text && onOperacao({ op: 'editar_overlay', overlayId, text: texto.trim() })}
          />
        </label>
      )}
      <div className="linha" style={{ gap: 'var(--e2)' }}>
        <label className="campo crescer" style={{ marginBottom: 0 }}>
          <span className="campo__rotulo">Início (s)</span>
          <input
            className="campo__entrada"
            inputMode="decimal"
            value={inicio}
            onChange={(ev) => setInicio(ev.target.value)}
            onBlur={() => onOperacao({ op: 'editar_overlay', overlayId, timelineStartMs: Math.max(0, paraMs(inicio)) })}
          />
        </label>
        <label className="campo crescer" style={{ marginBottom: 0 }}>
          <span className="campo__rotulo">Duração (s)</span>
          <input
            className="campo__entrada"
            inputMode="decimal"
            value={duracao}
            onChange={(ev) => setDuracao(ev.target.value)}
            onBlur={() => onOperacao({ op: 'editar_overlay', overlayId, durationMs: Math.max(300, paraMs(duracao)) })}
          />
        </label>
      </div>

      {destaque && (
        <>
          <p className="campo__ajuda" style={{ marginTop: 0 }}>
            Arraste o texto na prévia para posicionar. Evite cobrir o rosto e a legenda.
          </p>
          <label className="campo" style={{ marginBottom: 0 }}>
            <span className="campo__rotulo">Fonte</span>
            <select className="campo__selecao" value={e.fontId ?? ''} onChange={(ev) => estilo({ fontId: ev.target.value || undefined })}>
              <option value="">Fonte de títulos da marca</option>
              {Object.entries(FONTES_DE_VIDEO).map(([id, f]) => (
                <option key={id} value={id}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="campo" style={{ marginBottom: 0 }}>
            <span className="campo__rotulo">Tamanho: {Math.round((e.sizeScale ?? 1) * 100)}%</span>
            <input
              type="range"
              className="deslizante"
              min={40}
              max={300}
              step={5}
              value={Math.round((e.sizeScale ?? 1) * 100)}
              onChange={(ev) => estilo({ sizeScale: Number(ev.target.value) / 100 })}
            />
          </label>
          <div className="linha" style={{ gap: 'var(--e3)' }}>
            <Cor rotulo="Cor do texto" valor={e.color ?? '#FFFFFF'} onTrocar={(v) => estilo({ color: v })} />
            <Cor rotulo="Cor de destaque" valor={e.accentColor ?? '#FFD400'} onTrocar={(v) => estilo({ accentColor: v })} />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <span className="campo__rotulo">Decoração</span>
            <div className="transicoes">
              {DECORACOES_DE_TEXTO.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={(e.decoration ?? 'contorno') === d}
                  className="transicoes__item"
                  onClick={() => estilo({ decoration: d })}
                >
                  {NOME_DA_DECORACAO[d]}
                </button>
              ))}
            </div>
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <span className="campo__rotulo">Entrada</span>
            <Segmentado
              rotulo="Animação de entrada"
              valor={e.animation ?? 'pop'}
              opcoes={ANIMACOES_DE_TEXTO.map((a) => [a, NOME_DA_ANIMACAO[a] ?? a] as const)}
              onTrocar={(v) => estilo({ animation: v as (typeof ANIMACOES_DE_TEXTO)[number] })}
            />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <span className="campo__rotulo">Posição rápida</span>
            <Segmentado
              rotulo="Posição do destaque"
              valor={(e.y ?? 0.3) < 0.4 ? 'topo' : (e.y ?? 0.3) > 0.6 ? 'baixo' : 'meio'}
              opcoes={[
                ['topo', 'Topo'],
                ['meio', 'Meio'],
                ['baixo', 'Acima da legenda'],
              ]}
              onTrocar={(v) => estilo({ x: 0.5, y: v === 'topo' ? 0.22 : v === 'meio' ? 0.45 : 0.62 })}
            />
          </div>
        </>
      )}

      <button
        type="button"
        className="botao botao--perigo botao--pequeno"
        style={{ justifySelf: 'start' }}
        onClick={() => {
          onOperacao({ op: 'remover_overlay', overlayId });
          onFechar();
        }}
      >
        <IconeLixeira size={15} /> Remover
      </button>
    </div>
  );
}

export function Cor({ rotulo, valor, onTrocar }: { rotulo: string; valor: string; onTrocar: (v: string) => void }) {
  return (
    <label className="campo crescer" style={{ marginBottom: 0 }}>
      <span className="campo__rotulo">{rotulo}</span>
      <span className="linha" style={{ gap: 'var(--e2)' }}>
        <input type="color" className="app-config__cor" value={valor} onChange={(e) => onTrocar(e.target.value.toUpperCase())} aria-label={rotulo} />
        <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>{valor}</span>
      </span>
    </label>
  );
}
