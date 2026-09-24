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
import type { EditPlanV1, MarcaDoVideo, TimelineOperation } from '@makucho/studio-contracts';
import {
  ANIMACOES_DURANTE,
  DURACAO_PADRAO_DA_TRANSICAO,
  ENTRADAS_DE_TEXTO,
  FONTES_DE_VIDEO,
  FORMAS_DE_FUNDO,
  PRESETS_DE_TEXTO,
  SAIDAS_DE_TEXTO,
  TEXTOS_DE_TELA,
  TIPOS_DE_TRANSICAO,
  resolverEstiloDoTexto,
} from '@makucho/studio-contracts';
import type { AbaDoElemento, ItemDaTimeline } from '../timeline/camadas';
import { AmostraDeTexto } from './AmostraDeTexto';
import { NOME_DO_ELEMENTO } from '../timeline/camadas';
import { IconeLixeira } from '../icones';
import { Segmentado } from './Inspector';

interface Props {
  plan: EditPlanV1;
  item: ItemDaTimeline;
  onOperacao: (op: TimelineOperation) => void;
  onOperacoes: (ops: TimelineOperation[]) => void;
  onFechar: () => void;
  marca?: MarcaDoVideo;
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

const segundos = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',');
const paraMs = (texto: string) => Math.round(Number(texto.replace(',', '.')) * 1000);

export function PainelDoItem({ plan, item, onOperacao, onOperacoes, onFechar, marca }: Props) {
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
        <Elemento plan={plan} overlayId={item.id} abaPedida={item.aba} marca={marca} onOperacao={onOperacao} onFechar={onFechar} />
      )}
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
};

const NOME_DO_DURANTE: Record<string, string> = {
  nenhuma: 'Parado',
  pulsar: 'Pulsar',
  balancar: 'Balançar',
  brilhar: 'Brilhar',
  tremer: 'Tremer',
};

const ABAS_DO_ELEMENTO: ReadonlyArray<readonly [AbaDoElemento, string]> = [
  ['estilos', 'Estilos'],
  ['texto', 'Texto'],
  ['fundo', 'Fundo'],
  ['animacao', 'Animação'],
];

/** O visual de antes (sem estilo): o cartão "Original". */
const ORIGINAL = { id: 'original', rotulo: 'Original', descricao: 'O visual padrão deste elemento, com as cores da marca.', estilo: {} };

type Estilo = NonNullable<EditPlanV1['overlays'][number]['style']>;

function Elemento({
  plan,
  overlayId,
  abaPedida,
  marca,
  onOperacao,
  onFechar,
}: {
  plan: EditPlanV1;
  overlayId: string;
  abaPedida?: AbaDoElemento;
  marca?: MarcaDoVideo;
  onOperacao: (op: TimelineOperation) => void;
  onFechar: () => void;
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
              <div className="estilos estilos--texto" role="radiogroup" aria-label="Estilos prontos">
                {[ORIGINAL, ...PRESETS_DE_TEXTO].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={p.id === 'original' ? !o.style || Object.keys(o.style).every((k) => k === 'x' || k === 'y') : e.preset === p.id}
                    className="estilo"
                    title={p.descricao}
                    onClick={() => aplicar(p.estilo)}
                  >
                    <span className="estilo__amostra">
                      <AmostraDeTexto estilo={p.estilo} componente={o.component} marca={marca} texto={amostra} />
                    </span>
                    <span className="estilo__rotulo">{p.rotulo}</span>
                  </button>
                ))}
              </div>
              <p className="campo__ajuda">Aplicar um estilo mantém o texto, o tempo e a posição. Depois, ajuste o que quiser nas outras abas.</p>
            </div>
          )}

          {aba === 'texto' && (
            <>
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
            </>
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
function Deslizante({
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
