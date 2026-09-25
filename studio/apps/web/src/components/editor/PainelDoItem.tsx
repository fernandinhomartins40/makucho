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
import type { CurvaDeKeyframe, EditPlanV1, KeyframeDaMidia, KeyframeDoTexto, MarcaDoVideo, TimelineOperation } from '@makucho/studio-contracts';
import {
  ANIMACOES_DURANTE,
  CATEGORIAS_DE_EFEITO_DE_TELA,
  EFEITOS_DE_TELA,
  DURACAO_PADRAO_DA_TRANSICAO,
  ENTRADAS_DE_TEXTO,
  FONTES_DE_VIDEO,
  FORMAS_DE_FUNDO,
  PRESETS_DE_TEXTO,
  SAIDAS_DE_TEXTO,
  TEXTOS_DE_TELA,
  CURVAS_DE_KEYFRAME,
  LAYOUTS_DE_MIDIA,
  NOME_DO_LAYOUT,
  KEN_BURNS,
  NOME_DO_KEN_BURNS,
  ENTRADAS_DE_MIDIA,
  LOOPS_DE_MIDIA,
  SAIDAS_DE_MIDIA,
  NOME_DA_ENTRADA_DE_MIDIA,
  NOME_DO_LOOP_DE_MIDIA,
  NOME_DA_SAIDA_DE_MIDIA,
  comKeyframeDaMidia,
  definicaoDoSticker,
  padraoDaCaixa,
  comKeyframe,
  estadoDoTexto,
  semKeyframe,
  agendaDoPlano,
  definicaoDoEfeitoDeTela,
  resolverEstiloDoTexto,
} from '@makucho/studio-contracts';
import type { AbaDoElemento, ItemDaTimeline } from '../timeline/camadas';
import { AmostraDeTexto } from './AmostraDeTexto';
import { EscolhaDeFonte } from './EscolhaDeFonte';
import { EstilosDeTexto } from './EstilosDeTexto';
import { NOME_DO_ELEMENTO } from '../timeline/camadas';
import { IconeLixeira, IconeTocar, IconeMudo } from '../icones';
import { NOME_DA_TRANSICAO, NOME_DO_SOM, SONS, TRANSICOES } from '../biblioteca/catalogo';
import { Segmentado } from './Inspector';

interface Props {
  plan: EditPlanV1;
  item: ItemDaTimeline;
  onOperacao: (op: TimelineOperation) => void;
  onOperacoes: (ops: TimelineOperation[]) => void;
  onFechar: () => void;
  marca?: MarcaDoVideo;
  /** Cursor da timeline: onde os pontos de movimento são postos. */
  posicaoMs?: number;
  onSeek?: (ms: number) => void;
}

export { NOME_DA_TRANSICAO };

const segundos = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',');
const paraMs = (texto: string) => Math.round(Number(texto.replace(',', '.')) * 1000);

export function PainelDoItem({ plan, item, onOperacao, onOperacoes, onFechar, marca, posicaoMs = 0, onSeek }: Props) {
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
      {item.tipo === 'elemento' && (
        <Elemento
          plan={plan}
          overlayId={item.id}
          abaPedida={item.aba}
          marca={marca}
          onOperacao={onOperacao}
          onFechar={onFechar}
          posicaoMs={posicaoMs}
          onSeek={onSeek}
        />
      )}
      {item.tipo === 'som' && <EfeitoSonoro plan={plan} id={item.id} onOperacao={onOperacao} onOperacoes={onOperacoes} onFechar={onFechar} />}
      {item.tipo === 'audio' && <SomDoTrecho plan={plan} clipId={item.id} onOperacao={onOperacao} />}
      {item.tipo === 'trilha' && <TrilhaDeFundo plan={plan} onOperacao={onOperacao} onFechar={onFechar} />}
      {item.tipo === 'efeito' && <EfeitoDeTelaDoItem plan={plan} id={item.id} onOperacao={onOperacao} onFechar={onFechar} />}
      {item.tipo === 'midia' && <MidiaDoItem plan={plan} id={item.id} onOperacao={onOperacao} onFechar={onFechar} posicaoMs={posicaoMs} onSeek={onSeek} />}
    </div>
  );
}

function titulo(plan: EditPlanV1, item: ItemDaTimeline): string {
  if (item.tipo === 'legenda') return item.manualId ? 'Legenda escrita à mão' : 'Legenda';
  if (item.tipo === 'corte') return 'Corte entre trechos';
  if (item.tipo === 'som') return 'Efeito sonoro';
  if (item.tipo === 'audio') return 'Som do trecho';
  if (item.tipo === 'trilha') return 'Trilha de fundo';
  if (item.tipo === 'midia') {
    const m = plan.mediaLayers?.find((x) => x.id === item.id);
    return m ? (m.kind === 'sticker' ? `Sticker: ${definicaoDoSticker(m.assetId)?.rotulo ?? ''}` : m.kind === 'video' ? 'Vídeo sobreposto' : 'Imagem sobreposta') : 'Mídia';
  }
  if (item.tipo === 'efeito') {
    const e = plan.screenEffects?.find((x) => x.id === item.id);
    return e ? `Efeito: ${definicaoDoEfeitoDeTela(e.type)?.rotulo ?? e.type}` : 'Efeito';
  }
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
        Em vídeo falado o corte seco costuma ser a melhor escolha. Transição funciona na virada de assunto. Ela usa o movimento real dos
        dois trechos (nada congela) e o som cruza junto.
      </p>
      <div className="demos demos--compacto" role="radiogroup" aria-label="Tipo de transição">
        {TRANSICOES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tipo === t.id}
            className="demo-cartao"
            title={`${t.descricao} ${t.quando}`}
            onClick={() =>
              onOperacao({ op: 'definir_transicao', clipId, type: t.id, ...(t.id !== 'cut' ? { durationMs: atual?.durationMs ?? DURACAO_PADRAO_DA_TRANSICAO[t.id] } : {}) })
            }
          >
            <span className={`demo demo--transicao demo--${t.id}`} aria-hidden>
              <span className="demo__a">A</span>
              <span className="demo__b">B</span>
            </span>
            <span className="demo-cartao__nome">{t.rotulo}</span>
          </button>
        ))}
      </div>
      {tipo !== 'cut' && (
        <Deslizante
          rotulo="Duração"
          valor={duracao}
          min={150}
          max={1500}
          passo={50}
          unidade=" ms"
          onSoltar={(v) => onOperacao({ op: 'definir_transicao', clipId, type: tipo, durationMs: v })}
        />
      )}
    </div>
  );
}

// ---------- Som do trecho ----------

/**
 * O som de um trecho, independente da imagem: volume, mudo, fades e o
 * J/L-cut. A timeline mostra a mesma coisa na faixa Áudio (a forma de
 * onda muda com o volume e os fades).
 */
function SomDoTrecho({ plan, clipId, onOperacao }: { plan: EditPlanV1; clipId: string; onOperacao: (op: TimelineOperation) => void }) {
  const clip = plan.clips.find((c) => c.id === clipId);
  if (!clip) return <p className="texto-secundario">Este trecho não existe mais.</p>;
  const a = clip.audio ?? {};
  const ajustar = (m: Omit<Extract<TimelineOperation, { op: 'ajustar_audio_do_clipe' }>, 'op' | 'clipId'>) =>
    onOperacao({ op: 'ajustar_audio_do_clipe', clipId, ...m });
  const peca = agendaDoPlano(plan).audio.find((p) => p.clipId === clipId);

  return (
    <div className="pilha" style={{ gap: 'var(--e3)' }}>
      <p className="campo__ajuda" style={{ marginTop: 0 }}>
        O som deste trecho, separado da imagem. Nos cortes ele já cruza sozinho com o vizinho (sem estalo nem respiração cortada).
      </p>
      <Segmentado
        rotulo="Som do trecho"
        valor={a.muted ? 'mudo' : 'ligado'}
        opcoes={[
          ['ligado', 'Som ligado'],
          ['mudo', 'Mudo'],
        ]}
        onTrocar={(v) => ajustar({ muted: v === 'mudo' ? true : null })}
      />
      {!a.muted && (
        <>
          <Deslizante rotulo="Volume" valor={a.gainDb ?? 0} min={-30} max={12} passo={1} unidade=" dB" onSoltar={(v) => ajustar({ gainDb: v === 0 ? null : v })} />
          <div className="linha" style={{ gap: 'var(--e3)' }}>
            <div className="crescer">
              <Deslizante rotulo="Entrada suave" valor={a.fadeInMs ?? 0} min={0} max={3000} passo={50} unidade=" ms" onSoltar={(v) => ajustar({ fadeInMs: v || null })} />
            </div>
            <div className="crescer">
              <Deslizante rotulo="Saída suave" valor={a.fadeOutMs ?? 0} min={0} max={3000} passo={50} unidade=" ms" onSoltar={(v) => ajustar({ fadeOutMs: v || null })} />
            </div>
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <span className="campo__rotulo">Som além da imagem (J/L-cut)</span>
            <p className="campo__ajuda" style={{ marginTop: 0 }}>
              “Antes” faz a fala deste trecho começar sobre o fim do anterior; “depois”, continuar sobre o começo do próximo. Também dá para
              puxar as bordas do bloco na faixa Áudio.
            </p>
          </div>
          <div className="linha" style={{ gap: 'var(--e3)' }}>
            <div className="crescer">
              <Deslizante rotulo="Antes" valor={a.leadMs ?? 0} min={0} max={3000} passo={50} unidade=" ms" onSoltar={(v) => ajustar({ leadMs: v || null })} />
            </div>
            <div className="crescer">
              <Deslizante rotulo="Depois" valor={a.tailMs ?? 0} min={0} max={3000} passo={50} unidade=" ms" onSoltar={(v) => ajustar({ tailMs: v || null })} />
            </div>
          </div>
          {peca && (
            <p className="campo__ajuda">
              Toca de {segundos(peca.inicioMs)} s a {segundos(peca.inicioMs + peca.duracaoMs)} s da timeline.
            </p>
          )}
        </>
      )}
      <button
        type="button"
        className="botao botao--fantasma botao--pequeno"
        style={{ justifySelf: 'start' }}
        onClick={() => onOperacao({ op: 'ajustar_audio_do_clipe', clipId, gainDb: null, muted: null, fadeInMs: null, fadeOutMs: null, leadMs: null, tailMs: null })}
      >
        Voltar ao som original
      </button>
    </div>
  );
}

// ---------- Efeito sonoro ----------

function EfeitoSonoro({
  plan,
  id,
  onOperacao,
  onOperacoes,
  onFechar,
}: {
  plan: EditPlanV1;
  id: string;
  onOperacao: (op: TimelineOperation) => void;
  onOperacoes: (ops: TimelineOperation[]) => void;
  onFechar: () => void;
}) {
  const e = plan.soundEffects.find((x) => x.id === id);
  if (!e) return <p className="texto-secundario">Este efeito sonoro não existe mais.</p>;
  const catalogo = SONS.find((s) => s.id === e.assetId);
  const ouvir = () => {
    const a = new Audio(catalogo ? `/sons/${e.assetId}.wav` : `/api/assets/${e.assetId}/file`);
    a.volume = Math.min(1, 10 ** (e.gainDb / 20));
    void a.play().catch(() => undefined);
  };
  return (
    <div className="pilha" style={{ gap: 'var(--e3)' }}>
      <div className="linha" style={{ gap: 'var(--e2)' }}>
        <button type="button" className="botao botao--secundario botao--pequeno" onClick={ouvir}>
          <IconeTocar size={14} weight="fill" /> Ouvir
        </button>
        <span className="texto-secundario" style={{ fontSize: 12 }}>
          {NOME_DO_SOM[e.assetId] ?? 'Som do workspace'} em {segundos(e.timelineStartMs)} s — arraste na faixa Sons para mover.
        </span>
      </div>
      {catalogo && <p className="campo__ajuda" style={{ marginTop: 0 }}>{catalogo.descricao} {catalogo.quando}</p>}
      <label className="campo" style={{ marginBottom: 0 }}>
        <span className="campo__rotulo">Trocar o som</span>
        <select
          className="campo__selecao"
          value={catalogo ? e.assetId : ''}
          onChange={(ev) =>
            ev.target.value &&
            // Trocar = tirar este e pôr o outro no mesmo ponto e volume.
            onOperacoes([
              { op: 'remover_efeito_sonoro', soundEffectId: id },
              { op: 'adicionar_efeito_sonoro', assetId: ev.target.value, timelineStartMs: e.timelineStartMs, gainDb: e.gainDb },
            ])
          }
        >
          {!catalogo && <option value="">Som do workspace</option>}
          {SONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.rotulo}
            </option>
          ))}
        </select>
      </label>
      <Deslizante rotulo="Volume" valor={e.gainDb} min={-40} max={6} passo={1} unidade=" dB" onSoltar={(v) => onOperacao({ op: 'editar_efeito_sonoro', soundEffectId: id, gainDb: v })} />
      <button
        type="button"
        className="botao botao--perigo botao--pequeno"
        style={{ justifySelf: 'start' }}
        onClick={() => {
          onOperacao({ op: 'remover_efeito_sonoro', soundEffectId: id });
          onFechar();
        }}
      >
        <IconeLixeira size={15} /> Remover efeito sonoro
      </button>
    </div>
  );
}

// ---------- Efeito de tela ----------

function EfeitoDeTelaDoItem({
  plan,
  id,
  onOperacao,
  onFechar,
}: {
  plan: EditPlanV1;
  id: string;
  onOperacao: (op: TimelineOperation) => void;
  onFechar: () => void;
}) {
  const e = plan.screenEffects?.find((x) => x.id === id);
  if (!e) return <p className="texto-secundario">Este efeito não existe mais.</p>;
  const def = definicaoDoEfeitoDeTela(e.type);
  return (
    <div className="pilha" style={{ gap: 'var(--e3)' }}>
      {def && (
        <p className="campo__ajuda" style={{ marginTop: 0 }}>
          {def.descricao} {def.quando} Arraste na faixa Efeitos para mover; puxe as bordas para mudar a duração.
        </p>
      )}
      <label className="campo" style={{ marginBottom: 0 }}>
        <span className="campo__rotulo">Trocar o efeito</span>
        <select
          className="campo__selecao"
          value={e.type}
          onChange={(ev) => onOperacao({ op: 'editar_efeito_de_tela', effectId: id, type: ev.target.value as typeof e.type })}
        >
          {Object.entries(CATEGORIAS_DE_EFEITO_DE_TELA).map(([categoria, rotulo]) => (
            <optgroup key={categoria} label={rotulo}>
              {EFEITOS_DE_TELA.filter((x) => x.categoria === categoria).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.rotulo}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <Deslizante
        rotulo="Intensidade"
        valor={Math.round(e.intensity * 100)}
        min={5}
        max={100}
        passo={5}
        unidade="%"
        onSoltar={(v) => onOperacao({ op: 'editar_efeito_de_tela', effectId: id, intensity: v / 100 })}
      />
      <Deslizante
        rotulo="Duração"
        valor={e.durationMs}
        min={200}
        max={10_000}
        passo={100}
        unidade=" ms"
        onSoltar={(v) => onOperacao({ op: 'editar_efeito_de_tela', effectId: id, durationMs: v })}
      />
      {def?.pesado && <p className="campo__ajuda" style={{ marginTop: 0 }}>Este efeito deixa a exportação um pouco mais lenta.</p>}
      <button
        type="button"
        className="botao botao--perigo botao--pequeno"
        style={{ justifySelf: 'start' }}
        onClick={() => {
          onOperacao({ op: 'remover_efeito_de_tela', effectId: id });
          onFechar();
        }}
      >
        <IconeLixeira size={15} /> Remover efeito
      </button>
    </div>
  );
}

// ---------- Mídia sobreposta ----------

function MidiaDoItem({
  plan,
  id,
  onOperacao,
  onFechar,
  posicaoMs,
  onSeek,
}: {
  plan: EditPlanV1;
  id: string;
  onOperacao: (op: TimelineOperation) => void;
  onFechar: () => void;
  posicaoMs: number;
  onSeek?: (ms: number) => void;
}) {
  const m = plan.mediaLayers?.find((x) => x.id === id);
  if (!m) return <p className="texto-secundario">Esta mídia não existe mais.</p>;
  const editar = (mudanca: Omit<Extract<TimelineOperation, { op: 'editar_midia' }>, 'op' | 'mediaId'>) =>
    onOperacao({ op: 'editar_midia', mediaId: id, ...mudanca });
  const posicionavel = m.layout === 'pip' || m.layout === 'livre';
  const padrao = padraoDaCaixa(m);
  return (
    <div className="pilha" style={{ gap: 'var(--e3)' }}>
      <p className="campo__ajuda" style={{ marginTop: 0 }}>
        Arraste na faixa Mídia para mover; puxe as bordas para mudar o tempo.
        {m.kind === 'video' ? ' O vídeo entra mudo; suba o volume para ouvir o som dele.' : ''}
      </p>
      {posicionavel && <p className="campo__ajuda" style={{ marginTop: 0 }}>Na prévia: arraste para mover, puxe um canto para o tamanho.</p>}
      <label className="campo" style={{ marginBottom: 0 }} hidden={m.kind === 'sticker'}>
        <span className="campo__rotulo">Lugar na tela</span>
        <select className="campo__selecao" value={m.layout} onChange={(e) => editar({ layout: e.target.value as typeof m.layout })}>
          {LAYOUTS_DE_MIDIA.map((l) => (
            <option key={l} value={l}>
              {NOME_DO_LAYOUT[l]}
            </option>
          ))}
        </select>
      </label>
      {posicionavel && (
        <>
          <div className="linha" style={{ gap: 'var(--e3)' }}>
            <div className="crescer">
              <Deslizante rotulo="Horizontal" valor={Math.round((m.x ?? padrao.x) * 100)} min={0} max={100} passo={1} unidade="%" onSoltar={(v) => editar({ x: v / 100 })} />
            </div>
            <div className="crescer">
              <Deslizante rotulo="Vertical" valor={Math.round((m.y ?? padrao.y) * 100)} min={0} max={100} passo={1} unidade="%" onSoltar={(v) => editar({ y: v / 100 })} />
            </div>
          </div>
          <Deslizante rotulo="Largura" valor={Math.round((m.width ?? padrao.width) * 100)} min={5} max={100} passo={1} unidade="%" onSoltar={(v) => editar({ width: v / 100 })} />
        </>
      )}
      <Deslizante rotulo="Opacidade" valor={Math.round((m.opacity ?? 1) * 100)} min={5} max={100} passo={5} unidade="%" onSoltar={(v) => editar({ opacity: v / 100 })} />
      {!posicionavel && m.kind !== 'sticker' && (
        <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
          <label className="campo crescer" style={{ marginBottom: 0 }}>
            <span className="campo__rotulo">Câmera lenta (Ken Burns)</span>
            <select className="campo__selecao" value={m.kenBurns ?? 'nenhum'} onChange={(e) => editar({ kenBurns: e.target.value as typeof m.kenBurns })}>
              {KEN_BURNS.map((k) => (
                <option key={k} value={k}>
                  {NOME_DO_KEN_BURNS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="campo crescer" style={{ marginBottom: 0 }}>
            <span className="campo__rotulo">Cortina (revelar)</span>
            <select className="campo__selecao" value={m.reveal ?? 'nenhuma'} onChange={(e) => editar({ reveal: e.target.value as typeof m.reveal })}>
              <option value="nenhuma">Sem cortina</option>
              <option value="da_esquerda">Da esquerda</option>
              <option value="da_direita">Da direita</option>
            </select>
          </label>
        </div>
      )}
      <Deslizante rotulo="Cantos arredondados" valor={Math.round((m.radius ?? 0) * 100)} min={0} max={50} passo={1} unidade="%" onSoltar={(v) => editar({ radius: v / 100 })} />
      <div className="linha" style={{ gap: 'var(--e3)' }}>
        <div className="crescer">
          <Deslizante rotulo="Entrada suave" valor={m.fadeInMs ?? 0} min={0} max={2000} passo={50} unidade=" ms" onSoltar={(v) => editar({ fadeInMs: v })} />
        </div>
        <div className="crescer">
          <Deslizante rotulo="Saída suave" valor={m.fadeOutMs ?? 0} min={0} max={2000} passo={50} unidade=" ms" onSoltar={(v) => editar({ fadeOutMs: v })} />
        </div>
      </div>
      <div className="campo" style={{ marginBottom: 0 }}>
        <span className="campo__rotulo">Animação</span>
        <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
          <select className="campo__selecao" style={{ flex: 1, minWidth: 100 }} aria-label="Entrada" value={m.animIn ?? 'nenhuma'} onChange={(e) => editar({ animIn: e.target.value as typeof ENTRADAS_DE_MIDIA[number] })}>
            {ENTRADAS_DE_MIDIA.map((v) => (
              <option key={v} value={v}>
                Entrada: {NOME_DA_ENTRADA_DE_MIDIA[v]}
              </option>
            ))}
          </select>
          <select className="campo__selecao" style={{ flex: 1, minWidth: 100 }} aria-label="Durante" value={m.animLoop ?? 'nenhum'} onChange={(e) => editar({ animLoop: e.target.value as typeof LOOPS_DE_MIDIA[number] })}>
            {LOOPS_DE_MIDIA.map((v) => (
              <option key={v} value={v}>
                Durante: {NOME_DO_LOOP_DE_MIDIA[v]}
              </option>
            ))}
          </select>
          <select className="campo__selecao" style={{ flex: 1, minWidth: 100 }} aria-label="Saída" value={m.animOut ?? 'nenhuma'} onChange={(e) => editar({ animOut: e.target.value as typeof SAIDAS_DE_MIDIA[number] })}>
            {SAIDAS_DE_MIDIA.map((v) => (
              <option key={v} value={v}>
                Saída: {NOME_DA_SAIDA_DE_MIDIA[v]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {m.layout === 'livre' && (
        <label className="linha" style={{ gap: 'var(--e2)', fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(m.followPerson)}
            onChange={(e) => editar({ followPerson: e.target.checked, ...(e.target.checked ? { x: 0.5, y: 0.45 } : {}) })}
          />
          Acompanhar a pessoa (fica sobre a cabeça de quem fala)
        </label>
      )}
      <MovimentoDaMidia m={m} posicaoMs={posicaoMs} onSeek={onSeek} onKeyframes={(keyframes) => editar({ keyframes: keyframes ?? null })} />
      {m.kind === 'video' && (
        <>
          <Deslizante rotulo="Começar o vídeo em" valor={Math.round((m.sourceStartMs ?? 0) / 100) / 10} min={0} max={120} passo={0.5} unidade=" s" onSoltar={(v) => editar({ sourceStartMs: Math.round(v * 1000) })} />
          <Deslizante rotulo="Volume do vídeo" valor={Math.round((m.volume ?? 0) * 100)} min={0} max={200} passo={5} unidade="%" onSoltar={(v) => editar({ volume: v / 100 })} />
        </>
      )}
      <button
        type="button"
        className="botao botao--perigo botao--pequeno"
        style={{ justifySelf: 'start' }}
        onClick={() => {
          onOperacao({ op: 'remover_midia', mediaId: id });
          onFechar();
        }}
      >
        <IconeLixeira size={15} /> Remover mídia
      </button>
    </div>
  );
}

/**
 * Pontos de movimento de uma camada: pôr no cursor, ir até um ponto, tirar.
 * Os valores de cada ponto se ajustam arrastando na prévia (com o cursor
 * sobre o ponto) -- é o jeito mais direto de dizer "aqui ela está ali".
 */
function MovimentoDaMidia({
  m,
  posicaoMs,
  onSeek,
  onKeyframes,
}: {
  m: NonNullable<EditPlanV1['mediaLayers']>[number];
  posicaoMs: number;
  onSeek?: (ms: number) => void;
  onKeyframes: (k: KeyframeDaMidia[] | undefined) => void;
}) {
  const pontos = m.keyframes ?? [];
  const t = Math.round(posicaoMs - m.timelineStartMs);
  const dentro = t >= 0 && t < m.durationMs;
  const atual = pontos.find((k) => Math.abs(k.t - t) <= 20);
  const p = padraoDaCaixa(m);
  const base = { x: m.x ?? p.x, y: m.y ?? p.y };
  return (
    <div className="campo" style={{ marginBottom: 0 }}>
      <span className="campo__rotulo">Movimento (pontos)</span>
      <p className="campo__ajuda" style={{ marginTop: 0 }}>
        Ponha pontos no tempo e, com o cursor em cada um, arraste ou redimensione na prévia: a camada anda de um ponto ao outro.
      </p>
      <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
        <button type="button" className="botao botao--secundario botao--pequeno" disabled={!dentro || !!atual} onClick={() => onKeyframes(comKeyframeDaMidia(m, t, {}, base))}>
          ◆ Ponto no cursor
        </button>
        {atual && (
          <button
            type="button"
            className="botao botao--fantasma botao--pequeno"
            onClick={() => {
              const resto = pontos.filter((k) => k !== atual);
              onKeyframes(resto.length ? resto : undefined);
            }}
          >
            Tirar este ponto
          </button>
        )}
        {pontos.length > 0 && (
          <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => onKeyframes(undefined)}>
            Tirar o movimento
          </button>
        )}
      </div>
      {pontos.length > 0 && (
        <div className="pontos-de-movimento" role="list" aria-label="Pontos do movimento" style={{ marginTop: 'var(--e2)' }}>
          {pontos.map((k) => (
            <button
              key={k.t}
              type="button"
              role="listitem"
              className="ponto-de-movimento"
              aria-current={atual?.t === k.t || undefined}
              onClick={() => onSeek?.(m.timelineStartMs + k.t)}
            >
              ◆ {(k.t / 1000).toFixed(2).replace('.', ',')} s
            </button>
          ))}
        </div>
      )}
      {atual && (
        <div style={{ marginTop: 'var(--e2)', display: 'grid', gap: 'var(--e2)' }}>
          <Deslizante rotulo="Giro no ponto" valor={Math.round(atual.rotation ?? 0)} min={-360} max={360} passo={5} unidade="°" onSoltar={(v) => onKeyframes(comKeyframeDaMidia(m, atual.t, { rotation: v }, base))} />
          <Deslizante rotulo="Opacidade no ponto" valor={Math.round((atual.opacity ?? 1) * 100)} min={0} max={100} passo={5} unidade="%" onSoltar={(v) => onKeyframes(comKeyframeDaMidia(m, atual.t, { opacity: v / 100 }, base))} />
          <Segmentado
            rotulo="Curva até o próximo ponto"
            valor={atual.ease ?? 'suave'}
            opcoes={CURVAS_DE_KEYFRAME.map((c) => [c, NOME_DA_CURVA[c]] as const)}
            onTrocar={(v) => onKeyframes(comKeyframeDaMidia(m, atual.t, { ease: v as CurvaDeKeyframe }, base))}
          />
        </div>
      )}
    </div>
  );
}

// ---------- Trilha ----------

function TrilhaDeFundo({ plan, onOperacao, onFechar }: { plan: EditPlanV1; onOperacao: (op: TimelineOperation) => void; onFechar: () => void }) {
  const m = plan.music;
  if (!m) return <p className="texto-secundario">O vídeo não tem trilha. Escolha uma na Biblioteca → Trilha.</p>;
  return (
    <div className="pilha" style={{ gap: 'var(--e3)' }}>
      <Deslizante rotulo="Volume" valor={m.gainDb} min={-40} max={0} passo={1} unidade=" dB" onSoltar={(v) => onOperacao({ op: 'configurar_musica', gainDb: v })} />
      <Segmentado
        rotulo="Abaixar na fala"
        valor={m.duckUnderVoice ? 'sim' : 'nao'}
        opcoes={[
          ['sim', 'Abaixa quando alguém fala'],
          ['nao', 'Volume fixo'],
        ]}
        onTrocar={(v) => onOperacao({ op: 'configurar_musica', duckUnderVoice: v === 'sim' })}
      />
      <div className="linha" style={{ gap: 'var(--e3)' }}>
        <div className="crescer">
          <Deslizante rotulo="Entrada suave" valor={m.fadeInMs} min={0} max={5000} passo={100} unidade=" ms" onSoltar={(v) => onOperacao({ op: 'configurar_musica', fadeInMs: v })} />
        </div>
        <div className="crescer">
          <Deslizante rotulo="Saída suave" valor={m.fadeOutMs} min={0} max={5000} passo={100} unidade=" ms" onSoltar={(v) => onOperacao({ op: 'configurar_musica', fadeOutMs: v })} />
        </div>
      </div>
      <button
        type="button"
        className="botao botao--perigo botao--pequeno"
        style={{ justifySelf: 'start' }}
        onClick={() => {
          onOperacao({ op: 'trocar_musica', assetId: null });
          onFechar();
        }}
      >
        <IconeMudo size={15} /> Tirar a trilha
      </button>
    </div>
  );
}

// ---------- Elemento (título, chamada, destaque...) ----------

const NOME_DA_FORMA: Record<string, string> = {
  nenhum: 'Sem fundo',
  retangulo: 'Caixa',
  arredondado: 'Arredondado',
  pilula: 'Pílula',
  faixa: 'Faixa',
};

const NOME_DA_ENTRADA: Record<string, string> = {
  nenhuma: 'Nenhuma',
  surgir: 'Surgir',
  pop: 'Pop',
  zoom: 'Zoom',
  elastico: 'Elástico',
  deslizar_esquerda: 'Da esquerda',
  deslizar_direita: 'Da direita',
  subir: 'Subir',
  descer: 'Descer',
  digitar: 'Digitar',
  desfocar: 'Desfocar',
  quique: 'Quicar',
  letras: 'Letra a letra',
};

const NOME_DA_SAIDA: Record<string, string> = {
  nenhuma: 'Nenhuma',
  sumir: 'Sumir',
  encolher: 'Encolher',
  zoom: 'Zoom',
  deslizar_esquerda: 'Para a esquerda',
  deslizar_direita: 'Para a direita',
  subir: 'Subir',
  descer: 'Descer',
  desfocar: 'Desfocar',
  letras: 'Letra a letra',
};

const NOME_DO_DURANTE: Record<string, string> = {
  nenhuma: 'Parado',
  pulsar: 'Pulsar',
  balancar: 'Balançar',
  brilhar: 'Brilhar',
  tremer: 'Tremer',
  piscar: 'Piscar',
  batimento: 'Batimento',
  onda: 'Onda nas letras',
  flutuar: 'Flutuar',
};

const NOME_DA_CURVA: Record<CurvaDeKeyframe, string> = {
  suave: 'Suave',
  linear: 'Constante',
  acelerar: 'Acelerar',
  frear: 'Frear',
};

const ABAS_DO_ELEMENTO: ReadonlyArray<readonly [AbaDoElemento, string]> = [
  ['estilos', 'Estilos'],
  ['texto', 'Texto'],
  ['fundo', 'Fundo'],
  ['animacao', 'Animação'],
  ['movimento', 'Movimento'],
];

type Estilo = NonNullable<EditPlanV1['overlays'][number]['style']>;

function Elemento({
  plan,
  overlayId,
  abaPedida,
  marca,
  onOperacao,
  onFechar,
  posicaoMs,
  onSeek,
}: {
  plan: EditPlanV1;
  overlayId: string;
  abaPedida?: AbaDoElemento;
  marca?: MarcaDoVideo;
  onOperacao: (op: TimelineOperation) => void;
  onFechar: () => void;
  posicaoMs: number;
  onSeek?: (ms: number) => void;
}) {
  const o = plan.overlays.find((x) => x.id === overlayId);
  const [texto, setTexto] = useState(o?.text ?? '');
  const [inicio, setInicio] = useState(segundos(o?.timelineStartMs ?? 0));
  const [duracao, setDuracao] = useState(segundos(o?.durationMs ?? 0));
  const [aba, setAba] = useState<AbaDoElemento>(abaPedida ?? 'estilos');
  useEffect(() => {
    setTexto(o?.text ?? '');
    setInicio(segundos(o?.timelineStartMs ?? 0));
    setDuracao(segundos(o?.durationMs ?? 0));
  }, [o?.id, o?.text, o?.timelineStartMs, o?.durationMs]);
  // Clique duplo de novo (mesmo elemento): volta para a aba pedida.
  useEffect(() => {
    if (abaPedida) setAba(abaPedida);
  }, [abaPedida, overlayId]);

  if (!o) return <p className="texto-secundario">Este elemento não existe mais.</p>;
  const temTexto = o.component !== 'LogoBug' && o.component !== 'ProgressBar' && o.component !== 'ImageOverlay';
  const personalizavel = (TEXTOS_DE_TELA as readonly string[]).includes(o.component);
  const e: Estilo = o.style ?? {};
  const r = resolverEstiloDoTexto(o.component, e, marca);
  const estilo = (mudanca: Estilo) => onOperacao({ op: 'editar_overlay', overlayId, style: mudanca });
  const aplicar = (novo: Estilo) => onOperacao({ op: 'editar_overlay', overlayId, style: novo, replaceStyle: true });
  // Duas palavras do próprio texto: cabem no cartão em qualquer fonte.
  const amostra = (o.text ?? '').split(/\n|\|/)[0]!.trim().split(/\s+/).slice(0, 2).join(' ').slice(0, 12) || 'Seu título';

  return (
    <div className="pilha" style={{ gap: 'var(--e3)' }}>
      {temTexto && (
        <label className="campo" style={{ marginBottom: 0 }}>
          <span className="campo__rotulo">Texto</span>
          <textarea
            className="campo__area"
            style={{ minHeight: 56 }}
            value={texto}
            maxLength={200}
            onChange={(ev) => setTexto(ev.target.value)}
            onBlur={() => texto.trim() && texto !== o.text && onOperacao({ op: 'editar_overlay', overlayId, text: texto.trim() })}
          />
          {personalizavel && <span className="campo__ajuda">Enter quebra a linha. Linhas longas quebram sozinhas.</span>}
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

      {personalizavel && (
        <>
          <p className="campo__ajuda" style={{ marginTop: 0 }}>
            Na prévia: arraste para mover, puxe um canto para mudar o tamanho. Na timeline, puxe as bordas para mudar o tempo.
          </p>
          <Segmentado rotulo="Personalizar" valor={aba} opcoes={ABAS_DO_ELEMENTO} onTrocar={(v) => setAba(v as AbaDoElemento)} />

          {aba === 'estilos' && (
            <div className="campo" style={{ marginBottom: 0 }}>
              <EstilosDeTexto
                componente={o.component}
                texto={amostra}
                marca={marca}
                comOriginal
                escolhido={!o.style || Object.keys(o.style).every((k) => k === 'x' || k === 'y') ? 'original' : (e.preset ?? null)}
                onEscolher={(p) => aplicar(p.estilo)}
              />
              <p className="campo__ajuda">Aplicar um estilo mantém o texto, o tempo e a posição. Depois, ajuste o que quiser nas outras abas.</p>
            </div>
          )}

          {aba === 'texto' && (
            <>
              <div className="campo" style={{ marginBottom: 0 }}>
                <span className="campo__rotulo">Em relação à pessoa</span>
                <Segmentado
                  rotulo="Texto na frente ou atrás da pessoa"
                  valor={e.atras ? 'atras' : 'frente'}
                  opcoes={[
                    ['frente', 'Na frente'],
                    ['atras', 'Atrás da pessoa'],
                  ]}
                  onTrocar={(v) => estilo({ atras: v === 'atras' })}
                />
                {e.atras && (
                  <p className="campo__ajuda">
                    A pessoa é recortada do vídeo e fica na frente do texto (prévia e exportação usam o mesmo recorte). Na prévia, use
                    “Posicionar atrás da pessoa” para achar a altura em que o texto continua legível.
                  </p>
                )}
              </div>
              <EscolhaDeFonte
                rotulo="Fonte"
                valor={e.fontId}
                rotuloPadrao="Fonte de títulos da marca"
                onTrocar={(v) => {
                  if (v) return estilo({ fontId: v });
                  // Voltar à fonte da marca: o estilo inteiro sem a fonte
                  // (mesclar não apaga um campo).
                  const { fontId: _f, ...semFonte } = e;
                  aplicar(semFonte);
                }}
              />
              <Deslizante rotulo="Tamanho" valor={Math.round((e.sizeScale ?? 1) * 100)} min={40} max={300} passo={5} unidade="%" onSoltar={(v) => estilo({ sizeScale: v / 100 })} />
              <div className="linha" style={{ gap: 'var(--e3)' }}>
                <Cor rotulo="Cor do texto" valor={r.cor} onTrocar={(v) => estilo({ color: v })} />
                <Cor rotulo="Cor do contorno" valor={r.contorno.cor} onTrocar={(v) => estilo({ outlineColor: v })} />
              </div>
              <Deslizante rotulo="Contorno" valor={r.contorno.largura} min={0} max={20} passo={1} unidade="px" onSoltar={(v) => estilo({ outlineWidth: v })} />
              <div className="linha" style={{ gap: 'var(--e3)', alignItems: 'end' }}>
                <div className="crescer">
                  <Deslizante rotulo="Sombra" valor={r.sombra.distancia} min={0} max={20} passo={1} unidade="px" onSoltar={(v) => estilo({ shadow: v })} />
                </div>
                <Cor rotulo="Cor da sombra" valor={r.sombra.cor} onTrocar={(v) => estilo({ shadowColor: v })} />
              </div>
              <Deslizante rotulo="Espaço entre letras" valor={r.espacamento} min={-5} max={30} passo={1} unidade="px" onSoltar={(v) => estilo({ letterSpacing: v })} />
              <Deslizante rotulo="Inclinação" valor={r.rotacao} min={-45} max={45} passo={1} unidade="°" onSoltar={(v) => estilo({ rotation: v })} />
              <div className="campo" style={{ marginBottom: 0 }}>
                <span className="campo__rotulo">Letras</span>
                <Segmentado
                  rotulo="Caixa das letras"
                  valor={r.caixaAlta ? 'alta' : 'normal'}
                  opcoes={[
                    ['normal', 'Como escrito'],
                    ['alta', 'MAIÚSCULAS'],
                  ]}
                  onTrocar={(v) => estilo({ uppercase: v === 'alta' })}
                />
              </div>
              <div className="campo" style={{ marginBottom: 0 }}>
                <span className="campo__rotulo">Posição rápida</span>
                <Segmentado
                  rotulo="Posição do texto"
                  valor={r.y < 0.35 ? 'topo' : r.y > 0.58 ? 'baixo' : 'meio'}
                  opcoes={[
                    ['topo', 'Topo'],
                    ['meio', 'Meio'],
                    ['baixo', 'Acima da legenda'],
                  ]}
                  onTrocar={(v) => estilo({ x: 0.5, y: v === 'topo' ? 0.18 : v === 'meio' ? 0.45 : 0.62 })}
                />
              </div>
            </>
          )}

          {aba === 'fundo' && (
            <>
              <div className="campo" style={{ marginBottom: 0 }}>
                <span className="campo__rotulo">Forma do fundo</span>
                <div className="formas-de-fundo" role="radiogroup" aria-label="Forma do fundo">
                  {FORMAS_DE_FUNDO.map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={(r.fundo?.forma ?? 'nenhum') === f}
                      className="forma-de-fundo"
                      onClick={() => estilo({ bgShape: f, ...(f !== 'nenhum' && !e.bgColor && !r.fundo ? { bgColor: marca?.cores.primary ?? '#2F66FF' } : {}) })}
                    >
                      <span
                        className="forma-de-fundo__desenho"
                        aria-hidden
                        style={{
                          opacity: f === 'nenhum' ? 0.2 : 1,
                          borderRadius: f === 'pilula' ? 999 : f === 'arredondado' ? 5 : 0,
                          width: f === 'faixa' ? '100%' : undefined,
                        }}
                      />
                      {NOME_DA_FORMA[f]}
                    </button>
                  ))}
                </div>
              </div>
              {r.fundo ? (
                <>
                  <Cor rotulo="Cor do fundo" valor={r.fundo.cor} onTrocar={(v) => estilo({ bgColor: v })} />
                  <Deslizante
                    rotulo="Opacidade"
                    valor={Math.round(r.fundo.opacidade * 100)}
                    min={10}
                    max={100}
                    passo={5}
                    unidade="%"
                    onSoltar={(v) => estilo({ bgOpacity: v / 100 })}
                  />
                  <Deslizante rotulo="Espaço em volta do texto" valor={r.fundo.margem} min={0} max={80} passo={2} unidade="px" onSoltar={(v) => estilo({ bgPadding: v })} />
                </>
              ) : (
                <p className="campo__ajuda">Sem fundo, o texto se destaca pelo contorno e pela sombra (aba Texto).</p>
              )}
            </>
          )}

          {aba === 'animacao' && (
            <>
              <Opcoes rotulo="Entrada" valor={r.entrada} opcoes={ENTRADAS_DE_TEXTO} nomes={NOME_DA_ENTRADA} onTrocar={(v) => estilo({ entrada: v as Estilo['entrada'] })} />
              <Opcoes rotulo="Durante a exibição" valor={r.durante} opcoes={ANIMACOES_DURANTE} nomes={NOME_DO_DURANTE} onTrocar={(v) => estilo({ durante: v as Estilo['durante'] })} />
              {r.durante === 'brilhar' && <Cor rotulo="Cor do brilho" valor={r.corDeDestaque} onTrocar={(v) => estilo({ accentColor: v })} />}
              <Opcoes rotulo="Saída" valor={r.saida} opcoes={SAIDAS_DE_TEXTO} nomes={NOME_DA_SAIDA} onTrocar={(v) => estilo({ saida: v as Estilo['saida'] })} />
              {o.durationMs < 900 && r.saida !== 'nenhuma' && (
                <p className="campo__ajuda">A saída aparece em elementos com 0,9 s ou mais na tela.</p>
              )}
              {!!e.keyframes?.length && (
                <p className="campo__ajuda">Este texto tem movimento livre (aba Movimento): entrada, saída e animação ficam desligadas.</p>
              )}
            </>
          )}

          {aba === 'movimento' && (
            <Movimento
              o={o}
              marca={marca}
              posicaoMs={posicaoMs}
              onSeek={onSeek}
              onKeyframes={(keyframes) => {
                if (keyframes) return estilo({ keyframes });
                // Mesclar não apaga um campo: sem pontos, o estilo inteiro sem eles.
                const { keyframes: _k, ...semPontos } = e;
                aplicar(semPontos);
              }}
            />
          )}
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

/**
 * Movimento livre (keyframes): pontos no tempo com posição, tamanho,
 * giro e opacidade. Com o cursor sobre um ponto, arrastar ou redimensionar
 * o texto na prévia muda esse ponto; fora dele, cria um novo.
 */
function Movimento({
  o,
  marca,
  posicaoMs,
  onSeek,
  onKeyframes,
}: {
  o: EditPlanV1['overlays'][number];
  marca?: MarcaDoVideo;
  posicaoMs: number;
  onSeek?: (ms: number) => void;
  onKeyframes: (k: KeyframeDoTexto[] | undefined) => void;
}) {
  const pontos = o.style?.keyframes ?? [];
  const t = Math.round(posicaoMs - o.timelineStartMs);
  const dentro = t >= 0 && t < o.durationMs;
  const atual = pontos.find((k) => Math.abs(k.t - t) <= 20);
  const estado = estadoDoTexto(o, Math.max(0, Math.min(o.durationMs, t)), marca);
  const por = (valores: Partial<KeyframeDoTexto>) => onKeyframes(comKeyframe(o, t, valores, marca));
  const pronto = (lista: KeyframeDoTexto[]) => onKeyframes(lista);
  const fim = Math.max(0, o.durationMs - 1);
  const e0 = estadoDoTexto(o, 0, marca);
  return (
    <div className="pilha" style={{ gap: 'var(--e3)' }}>
      <p className="campo__ajuda" style={{ marginTop: 0 }}>
        Ponha pontos no tempo e mude o texto em cada um: ele anda de um ponto ao outro. Com o cursor sobre um ponto, arrastar ou
        redimensionar na prévia muda esse ponto.
      </p>
      <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
        <button type="button" className="botao botao--secundario botao--pequeno" disabled={!dentro || !!atual} onClick={() => por({})}>
          ◆ Ponto no cursor
        </button>
        {pontos.length > 0 && (
          <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => onKeyframes(undefined)}>
            Tirar o movimento
          </button>
        )}
      </div>
      {!dentro && <p className="campo__ajuda">Leve o cursor para dentro do tempo do texto para pôr um ponto.</p>}

      {pontos.length > 0 && (
        <div className="pontos-de-movimento" role="list" aria-label="Pontos do movimento">
          {pontos.map((k) => (
            <button
              key={k.t}
              type="button"
              role="listitem"
              className="ponto-de-movimento"
              aria-current={atual?.t === k.t || undefined}
              onClick={() => onSeek?.(o.timelineStartMs + k.t)}
              title="Ir até este ponto"
            >
              ◆ {(k.t / 1000).toFixed(2).replace('.', ',')} s
            </button>
          ))}
        </div>
      )}

      {atual ? (
        <>
          <strong style={{ fontSize: 13 }}>Ponto em {(atual.t / 1000).toFixed(2).replace('.', ',')} s</strong>
          <div className="linha" style={{ gap: 'var(--e3)' }}>
            <div className="crescer">
              <Deslizante rotulo="Horizontal" valor={Math.round(estado.x * 100)} min={0} max={100} passo={1} unidade="%" onSoltar={(v) => por({ x: v / 100 })} />
            </div>
            <div className="crescer">
              <Deslizante rotulo="Vertical" valor={Math.round(estado.y * 100)} min={0} max={100} passo={1} unidade="%" onSoltar={(v) => por({ y: v / 100 })} />
            </div>
          </div>
          <Deslizante rotulo="Tamanho" valor={Math.round(estado.scale * 100)} min={10} max={500} passo={5} unidade="%" onSoltar={(v) => por({ scale: v / 100 })} />
          <Deslizante rotulo="Giro" valor={Math.round(estado.rotation)} min={-180} max={180} passo={1} unidade="°" onSoltar={(v) => por({ rotation: v })} />
          <Deslizante rotulo="Opacidade" valor={Math.round(estado.opacity * 100)} min={0} max={100} passo={5} unidade="%" onSoltar={(v) => por({ opacity: v / 100 })} />
          <Segmentado
            rotulo="Curva até o próximo ponto"
            valor={atual.ease ?? 'suave'}
            opcoes={CURVAS_DE_KEYFRAME.map((c) => [c, NOME_DA_CURVA[c]] as const)}
            onTrocar={(v) => por({ ease: v as CurvaDeKeyframe })}
          />
          <button
            type="button"
            className="botao botao--fantasma botao--pequeno"
            style={{ justifySelf: 'start' }}
            onClick={() => {
              const resto = semKeyframe(o, atual.t);
              onKeyframes(resto.length ? resto : undefined);
            }}
          >
            <IconeLixeira size={14} /> Tirar este ponto
          </button>
        </>
      ) : (
        pontos.length > 0 && <p className="campo__ajuda">Clique num ponto para ir até ele e editar.</p>
      )}

      <div className="campo" style={{ marginBottom: 0 }}>
        <span className="campo__rotulo">Movimentos prontos</span>
        <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
          <button type="button" className="botao botao--secundario botao--pequeno" onClick={() => pronto([{ t: 0, scale: 1 }, { t: fim, scale: 1.35, ease: 'linear' }])}>
            Aproximar devagar
          </button>
          <button
            type="button"
            className="botao botao--secundario botao--pequeno"
            onClick={() => pronto([{ t: 0, x: 0.2, ease: 'linear' }, { t: fim, x: 0.8 }])}
          >
            Atravessar a tela
          </button>
          <button
            type="button"
            className="botao botao--secundario botao--pequeno"
            onClick={() => pronto([{ t: 0, y: e0.y, opacity: 1 }, { t: Math.round(fim * 0.7), y: e0.y, opacity: 1, ease: 'acelerar' }, { t: fim, y: Math.max(0.05, e0.y - 0.1), opacity: 0 }])}
          >
            Subir e sumir
          </button>
          <button
            type="button"
            className="botao botao--secundario botao--pequeno"
            onClick={() => pronto([{ t: 0, rotation: -8, scale: 0.6 }, { t: Math.min(fim, 400), rotation: 0, scale: 1, ease: 'frear' }])}
          >
            Girar e parar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Grade de opções com nome (entrada, saída, animação). */
function Opcoes({
  rotulo,
  valor,
  opcoes,
  nomes,
  onTrocar,
}: {
  rotulo: string;
  valor: string;
  opcoes: readonly string[];
  nomes: Record<string, string>;
  onTrocar: (v: string) => void;
}) {
  return (
    <div className="campo" style={{ marginBottom: 0 }}>
      <span className="campo__rotulo">{rotulo}</span>
      <div className="transicoes" role="radiogroup" aria-label={rotulo}>
        {opcoes.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={valor === v} className="transicoes__item" onClick={() => valor !== v && onTrocar(v)}>
            {nomes[v] ?? v}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Deslizante que só grava ao soltar: arrastar não cria uma versão do
 * plano por pixel. O número ao lado acompanha o dedo.
 */
export function Deslizante({
  rotulo,
  valor,
  min,
  max,
  passo,
  unidade,
  onSoltar,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo: number;
  unidade: string;
  onSoltar: (v: number) => void;
}) {
  const [local, setLocal] = useState(valor);
  useEffect(() => setLocal(valor), [valor]);
  const gravar = () => local !== valor && onSoltar(local);
  return (
    <label className="campo" style={{ marginBottom: 0 }}>
      <span className="campo__rotulo">
        {rotulo}: {local}
        {unidade}
      </span>
      <input
        type="range"
        className="deslizante"
        min={min}
        max={max}
        step={passo}
        value={local}
        onChange={(ev) => setLocal(Number(ev.target.value))}
        onPointerUp={gravar}
        onKeyUp={gravar}
        onBlur={gravar}
      />
    </label>
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
