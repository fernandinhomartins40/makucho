'use client';

// ============================================================
// Biblioteca — tudo o que dá para pôr no vídeo, com PRÉVIA.
//
// Cada recurso aparece como o que ele faz, não pelo nome técnico: o
// cartão da transição anima a transição, o do efeito anima o zoom, o
// som toca ao clicar no play, o estilo de texto aparece desenhado. Um
// clique aplica no ponto certo: no corte ou trecho selecionado, ou no
// que está sob o cursor da timeline.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CategoriaDeEfeitoDeTela, CategoriaDeSom, CategoriaDeTransicao, EditPlanV1, EfeitoSonoroEmbutido, MarcaDoVideo, TimelineOperation } from '@makucho/studio-contracts';
import {
  CATEGORIAS_DE_SOM,
  duracaoDoSom,
  ehEfeitoSonoroEmbutido,
  palavrasNaTimeline,
  protegerFala,
  sugerirSons,
  CATEGORIAS_DE_STICKER,
  STICKERS,
  arquivoDoSticker,
  type CategoriaDeSticker,
  CATEGORIAS_DE_EFEITO_DE_TELA,
  CATEGORIAS_DE_TRANSICAO,
  DURACAO_PADRAO_DA_TRANSICAO,
  EFEITOS_DE_TELA,
  agendaDoPlano,
} from '@makucho/studio-contracts';
import { QUADROS_DA_MINIATURA, quadrosDaTransicao, quadrosDoEfeito } from '../editor/gl/miniaturas';
import { assets as apiAssets, type Asset, type Transcricao } from '../../lib/api';
import { EstilosDeTexto } from '../editor/EstilosDeTexto';
import type { ItemDaTimeline } from '../timeline/camadas';
import { tempo } from '../editor/funcoes';
import { EFEITOS_DE_TRECHO, ELEMENTOS, NOME_DO_SOM, SONS, TRANSICOES } from './catalogo';
import { PainelDeCor } from './PainelDeCor';
import { PainelDeMidias } from './PainelDeMidias';
import { IconeTocar, IconePausar, IconeMais, IconeEnviar, IconeCheck, IconeLixeira } from '../icones';

export type CategoriaDaBiblioteca = 'textos' | 'stickers' | 'midia' | 'transicoes' | 'efeitos' | 'cor' | 'sons' | 'trilha';

const CATEGORIAS: ReadonlyArray<readonly [CategoriaDaBiblioteca, string]> = [
  ['textos', 'Textos'],
  ['stickers', 'Stickers'],
  ['midia', 'Mídia'],
  ['transicoes', 'Transições'],
  ['efeitos', 'Efeitos'],
  ['cor', 'Filtros'],
  ['sons', 'Sons'],
  ['trilha', 'Trilha'],
];

interface Props {
  plan: EditPlanV1;
  posicaoMs: number;
  categoria: CategoriaDaBiblioteca;
  onCategoria: (c: CategoriaDaBiblioteca) => void;
  itemSelecionado: ItemDaTimeline | null;
  clipeSelecionado: string | null;
  marca?: MarcaDoVideo;
  onOperacao: (op: TimelineOperation) => void;
  onOperacoes: (ops: TimelineOperation[]) => void;
  onSelecionarItem: (item: ItemDaTimeline) => void;
  urlDoAsset: (id: string) => string;
  transcricao?: Transcricao | null;
}

/**
 * A palavra que o corte parte ao meio, no fim do trecho que sai ou no
 * começo do que entra. Com transição o pulo fica ainda mais visível.
 */
export function palavraPartida(plan: EditPlanV1, clipId: string, transcricao?: Transcricao | null): string | null {
  const palavras = transcricao?.segmentos.flatMap((s) => s.palavras) ?? [];
  const ligados = agendaDoPlano(plan).trechos.map((t) => t.clip);
  const i = ligados.findIndex((c) => c.id === clipId);
  if (i <= 0 || !palavras.length) return null;
  const margem = 60;
  const dentro = (ms: number) => palavras.find((p) => ms > p.startMs + margem && ms < p.endMs - margem);
  const p = dentro(ligados[i - 1]!.sourceEndMs) ?? dentro(ligados[i]!.sourceStartMs);
  return p ? p.texto.trim() : null;
}

export function PainelDaBiblioteca(props: Props) {
  const { categoria, onCategoria } = props;
  return (
    <div className="biblioteca">
      <div className="biblioteca__abas" role="tablist" aria-label="Categorias da biblioteca">
        {CATEGORIAS.map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={categoria === id} className="biblioteca__aba" onClick={() => onCategoria(id)}>
            {rotulo}
          </button>
        ))}
      </div>
      <div className="biblioteca__corpo">
        {categoria === 'textos' && <Textos {...props} />}
        {categoria === 'stickers' && <Stickers {...props} />}
        {categoria === 'midia' && <PainelDeMidias {...props} />}
        {categoria === 'transicoes' && <Transicoes {...props} />}
        {categoria === 'efeitos' && <Efeitos {...props} />}
        {categoria === 'cor' && <PainelDeCor {...props} />}
        {categoria === 'sons' && <Sons {...props} />}
        {categoria === 'trilha' && <Trilha {...props} />}
      </div>
    </div>
  );
}

function Alvo({ children }: { children: React.ReactNode }) {
  return <p className="biblioteca__alvo">{children}</p>;
}

// ---------- Textos ----------

function Textos({ plan, posicaoMs, marca, onOperacao, onSelecionarItem, itemSelecionado }: Props) {
  const [componente, setComponente] = useState('Destaque');
  const elemento = ELEMENTOS.find((e) => e.id === componente)!;
  const duracaoTotal = useMemo(() => agendaDoPlano(plan).duracaoMs, [plan]);
  const noCursor = Math.min(Math.max(0, Math.round(posicaoMs)), Math.max(0, duracaoTotal - 500));
  const selecionado =
    itemSelecionado?.tipo === 'elemento' ? plan.overlays.find((o) => o.id === itemSelecionado.id && o.text) : undefined;

  const adicionar = (estilo: NonNullable<EditPlanV1['overlays'][number]['style']>) => {
    const id = `ov${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    onOperacao({
      op: 'adicionar_overlay',
      id,
      component: componente as EditPlanV1['overlays'][number]['component'],
      text: elemento.exemplo,
      timelineStartMs: noCursor,
      durationMs: Math.max(300, Math.min(elemento.duracaoMs, duracaoTotal - noCursor)),
      style: estilo,
    });
    // Já abre o texto novo para a pessoa escrever o dela.
    onSelecionarItem({ tipo: 'elemento', id, aba: 'texto' });
  };

  return (
    <>
      <div className="biblioteca__chips" role="radiogroup" aria-label="Tipo de texto">
        {ELEMENTOS.map((e) => (
          <button key={e.id} type="button" role="radio" aria-checked={componente === e.id} className="biblioteca__chip" title={`${e.descricao} ${e.quando}`} onClick={() => setComponente(e.id)}>
            {e.rotulo}
          </button>
        ))}
      </div>
      <Alvo>
        <strong>{elemento.rotulo}:</strong> {elemento.descricao} <em>{elemento.quando}</em> Entra no cursor ({tempo(noCursor)}).
      </Alvo>
      <EstilosDeTexto
        componente={componente}
        texto={elemento.exemplo.split(/[|\s]+/).slice(0, 2).join(' ')}
        marca={marca}
        onEscolher={(p) => adicionar(p.estilo)}
        extra={(p) =>
          selecionado && (
            <button
              type="button"
              className="biblioteca__aplicar"
              title={`Aplicar "${p.rotulo}" ao texto selecionado`}
              onClick={() => onOperacao({ op: 'editar_overlay', overlayId: selecionado.id, style: p.estilo, replaceStyle: true })}
            >
              <IconeCheck size={12} /> No selecionado
            </button>
          )
        }
      />
    </>
  );
}

// ---------- Stickers ----------

function Stickers({ plan, posicaoMs, onOperacao, onSelecionarItem }: Props) {
  const [grupo, setGrupo] = useState<CategoriaDeSticker | 'todos'>('todos');
  const duracaoTotal = useMemo(() => agendaDoPlano(plan).duracaoMs, [plan]);
  const noCursor = Math.min(Math.max(0, Math.round(posicaoMs)), Math.max(0, duracaoTotal - 300));
  return (
    <>
      <Alvo>Entra no cursor ({tempo(noCursor)}). Na prévia, arraste para pôr no lugar e puxe o canto para o tamanho.</Alvo>
      <div className="biblioteca__chips" role="radiogroup" aria-label="Tipo de sticker">
        {([['todos', 'Todos'], ...Object.entries(CATEGORIAS_DE_STICKER)] as Array<[CategoriaDeSticker | 'todos', string]>).map(([id, rotulo]) => (
          <button key={id} type="button" role="radio" aria-checked={grupo === id} className="biblioteca__chip" onClick={() => setGrupo(id)}>
            {rotulo}
          </button>
        ))}
      </div>
      <div className="grade-de-stickers">
        {STICKERS.filter((s) => grupo === 'todos' || s.categoria === grupo).map((s) => (
          <button
            key={s.id}
            type="button"
            className="sticker-cartao"
            title={s.rotulo}
            aria-label={`Pôr o sticker ${s.rotulo}`}
            onClick={() => {
              const id = `md${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
              onOperacao({
                op: 'adicionar_midia',
                id,
                assetId: s.id,
                kind: 'sticker',
                layout: 'livre',
                timelineStartMs: noCursor,
                durationMs: Math.max(300, Math.min(2500, duracaoTotal - noCursor)),
                // Sem fade de entrada: o sticker aparece já no quadro em que foi posto.
                fadeOutMs: 120,
              });
              onSelecionarItem({ tipo: 'midia', id });
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/stickers/${arquivoDoSticker(s.id)}`} alt="" loading="lazy" draggable={false} />
          </button>
        ))}
      </div>
      <p className="campo__ajuda">Emoji: Noto Emoji (Google, Apache 2.0). Os demais foram desenhados para o Studio.</p>
    </>
  );
}

// ---------- Transições ----------

/**
 * A miniatura da transição desenhada pelo shader da prévia: o quadro do
 * meio parado e, com o mouse ou o foco no cartão, a transição inteira em
 * loop. Os quadros só são gerados quando o cartão aparece na tela.
 */
function MiniaturaDaTransicao({ id, ativo }: { id: string; ativo: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [quadros, setQuadros] = useState<string[] | null | undefined>(undefined);
  const [k, setK] = useState(Math.floor(QUADROS_DA_MINIATURA / 2));

  useEffect(() => {
    const el = ref.current;
    if (!el || id === 'cut') return;
    let cancelado = false;
    const obs = new IntersectionObserver((entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      const gerar = () => !cancelado && setQuadros(quadrosDaTransicao(id));
      if ('requestIdleCallback' in window) window.requestIdleCallback(gerar, { timeout: 800 });
      else setTimeout(gerar, 0);
    });
    obs.observe(el);
    return () => {
      cancelado = true;
      obs.disconnect();
    };
  }, [id]);

  useEffect(() => {
    if (!ativo || !quadros || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setK(Math.floor(QUADROS_DA_MINIATURA / 2));
      return;
    }
    // Entra, segura em B, volta a A: 14 quadros + 10 de pausa em cada ponta.
    let passo = 0;
    const ciclo = QUADROS_DA_MINIATURA + 10;
    const t = setInterval(() => {
      passo = (passo + 1) % (ciclo * 2);
      const f = passo < ciclo ? passo - 5 : ciclo * 2 - passo - 5;
      setK(Math.max(0, Math.min(QUADROS_DA_MINIATURA, f)));
    }, 1000 / 30);
    return () => clearInterval(t);
  }, [ativo, quadros]);

  // Sem WebGL2 (ou corte seco): a animação em CSS de antes.
  if (quadros === null || id === 'cut') {
    return (
      <span ref={ref} className={`demo demo--transicao demo--${id}`} aria-hidden>
        <span className="demo__a">A</span>
        <span className="demo__b">B</span>
      </span>
    );
  }
  return (
    <span ref={ref} className="demo demo--gl" aria-hidden>
      {quadros && <img src={quadros[k]} alt="" draggable={false} />}
    </span>
  );
}

function Transicoes({ plan, posicaoMs, itemSelecionado, onOperacao, onOperacoes, transcricao }: Props) {
  const agenda = useMemo(() => agendaDoPlano(plan), [plan]);
  const [grupo, setGrupo] = useState<CategoriaDeTransicao | 'todas'>('todas');
  const [comSom, setComSom] = useState(true);
  const [sobre, setSobre] = useState<string | null>(null);
  const cortes = agenda.trechos.slice(1).map((t) => ({ clipId: t.clip.id, ms: t.inicioMs }));
  const alvo =
    itemSelecionado?.tipo === 'corte'
      ? cortes.find((c) => c.clipId === itemSelecionado.clipId)
      : [...cortes].sort((a, b) => Math.abs(a.ms - posicaoMs) - Math.abs(b.ms - posicaoMs))[0];
  const atual = alvo ? plan.transitions.find((t) => t.beforeClipIndex === plan.clips.findIndex((c) => c.id === alvo.clipId))?.type ?? 'cut' : null;

  if (!cortes.length) return <Alvo>O vídeo tem um trecho só: não há corte para ganhar transição.</Alvo>;

  return (
    <>
      <Alvo>
        Aplica no corte {itemSelecionado?.tipo === 'corte' ? 'selecionado' : 'mais perto do cursor'} ({tempo(alvo!.ms)}). A transição usa
        o movimento real dos dois trechos — nada congela — e o som cruza junto.
      </Alvo>
      {alvo && palavraPartida(plan, alvo.clipId, transcricao) && (
        <p className="biblioteca__aviso" role="status">
          Este corte cai no meio de “{palavraPartida(plan, alvo.clipId, transcricao)}”. Uma transição chama atenção para o pulo: ajuste a
          borda do trecho até a pausa, ou prefira o corte seco.
        </p>
      )}
      <div className="biblioteca__chips" role="radiogroup" aria-label="Tipo de transição">
        {([['todas', 'Todas'], ...Object.entries(CATEGORIAS_DE_TRANSICAO)] as Array<[CategoriaDeTransicao | 'todas', string]>).map(([id, rotulo]) => (
          <button key={id} type="button" role="radio" aria-checked={grupo === id} className="biblioteca__chip" onClick={() => setGrupo(id)}>
            {rotulo}
          </button>
        ))}
      </div>
      <label className="biblioteca__opcao">
        <input type="checkbox" checked={comSom} onChange={(e) => setComSom(e.target.checked)} /> Pôr o som sugerido junto (fica na faixa Sons, dá
        para mover ou apagar)
      </label>
      <div className="demos" role="radiogroup" aria-label="Transições">
        {TRANSICOES.filter((t) => grupo === 'todas' || t.categoria === grupo || t.id === 'cut').map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={atual === t.id}
            className="demo-cartao"
            title={`${t.descricao} ${t.quando}`}
            onMouseEnter={() => setSobre(t.id)}
            onMouseLeave={() => setSobre((s) => (s === t.id ? null : s))}
            onFocus={() => setSobre(t.id)}
            onBlur={() => setSobre((s) => (s === t.id ? null : s))}
            onClick={() => {
              if (!alvo) return;
              const durationMs = t.id !== 'cut' ? DURACAO_PADRAO_DA_TRANSICAO[t.id] : undefined;
              const ops: TimelineOperation[] = [
                { op: 'definir_transicao', clipId: alvo.clipId, type: t.id, ...(durationMs ? { durationMs } : {}) },
              ];
              // O som sugerido começa um pouco antes do corte, como o "whoosh" de quem edita.
              if (comSom && t.somSugerido && durationMs) {
                ops.push({
                  op: 'adicionar_efeito_sonoro',
                  assetId: t.somSugerido,
                  timelineStartMs: Math.max(0, Math.round(alvo.ms - durationMs / 2)),
                  gainDb: -12,
                });
              }
              onOperacoes(ops);
            }}
          >
            <MiniaturaDaTransicao id={t.id} ativo={sobre === t.id} />
            <span className="demo-cartao__nome">
              {t.rotulo}
              {t.pesada && <span className="demo-cartao__selo" title="Mais lenta para exportar">pesada</span>}
            </span>
            <span className="demo-cartao__quando">{t.quando}</span>
          </button>
        ))}
      </div>
      <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap', marginTop: 'var(--e3)' }}>
        <button type="button" className="botao botao--secundario botao--pequeno" onClick={() => onOperacao({ op: 'transicao_em_todos', type: 'fade', durationMs: 400 })}>
          Esmaecer em todos os cortes
        </button>
        <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => onOperacao({ op: 'transicao_em_todos', type: 'cut' })}>
          Todos em corte seco
        </button>
      </div>
    </>
  );
}

// ---------- Efeitos de tela ----------

/**
 * Miniatura de um efeito de tela desenhada pelo shader da prévia: um
 * quadro do meio parado; com o mouse ou o foco, o efeito em loop.
 */
function MiniaturaDoEfeito({ id, intensidade, ativo }: { id: string; intensidade: number; ativo: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [quadros, setQuadros] = useState<string[] | null | undefined>(undefined);
  const [k, setK] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelado = false;
    const obs = new IntersectionObserver((entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      const gerar = () => {
        if (cancelado) return;
        const q = quadrosDoEfeito(id, intensidade);
        setQuadros(q);
        if (q) setK(Math.floor(q.length / 3));
      };
      if ('requestIdleCallback' in window) window.requestIdleCallback(gerar, { timeout: 800 });
      else setTimeout(gerar, 0);
    });
    obs.observe(el);
    return () => {
      cancelado = true;
      obs.disconnect();
    };
  }, [id, intensidade]);

  useEffect(() => {
    if (!ativo || !quadros || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let passo = 0;
    const total = quadros.length + 8;
    const t = setInterval(() => {
      passo = (passo + 1) % total;
      setK(Math.min(quadros.length - 1, passo));
    }, 1000 / 24);
    return () => clearInterval(t);
  }, [ativo, quadros]);

  return (
    <span ref={ref} className="demo demo--gl" aria-hidden>
      {quadros && <img src={quadros[k]} alt="" draggable={false} />}
    </span>
  );
}

function EfeitosDeTela({ plan, posicaoMs, onOperacao, onSelecionarItem }: Props) {
  const [grupo, setGrupo] = useState<CategoriaDeEfeitoDeTela | 'todas'>('todas');
  const [sobre, setSobre] = useState<string | null>(null);
  const duracaoTotal = useMemo(() => agendaDoPlano(plan).duracaoMs, [plan]);
  const noCursor = Math.min(Math.max(0, Math.round(posicaoMs)), Math.max(0, duracaoTotal - 200));
  return (
    <>
      <h3 className="biblioteca__subtitulo" style={{ marginTop: 0 }}>
        Efeitos de tela
      </h3>
      <Alvo>Entram no cursor ({tempo(noCursor)}) na faixa Efeitos; depois é só arrastar e puxar as bordas.</Alvo>
      <div className="biblioteca__chips" role="radiogroup" aria-label="Tipo de efeito">
        {([['todas', 'Todos'], ...Object.entries(CATEGORIAS_DE_EFEITO_DE_TELA)] as Array<[CategoriaDeEfeitoDeTela | 'todas', string]>).map(
          ([id, rotulo]) => (
            <button key={id} type="button" role="radio" aria-checked={grupo === id} className="biblioteca__chip" onClick={() => setGrupo(id)}>
              {rotulo}
            </button>
          ),
        )}
      </div>
      <div className="demos">
        {EFEITOS_DE_TELA.filter((e) => grupo === 'todas' || e.categoria === grupo).map((e) => (
          <button
            key={e.id}
            type="button"
            className="demo-cartao"
            title={`${e.descricao} ${e.quando}`}
            onMouseEnter={() => setSobre(e.id)}
            onMouseLeave={() => setSobre((s) => (s === e.id ? null : s))}
            onFocus={() => setSobre(e.id)}
            onBlur={() => setSobre((s) => (s === e.id ? null : s))}
            onClick={() => {
              const id = `ef${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
              onOperacao({
                op: 'adicionar_efeito_de_tela',
                id,
                type: e.id,
                timelineStartMs: noCursor,
                durationMs: Math.max(100, Math.min(e.duracaoPadraoMs, duracaoTotal - noCursor)),
                intensity: e.intensidadePadrao,
              });
              onSelecionarItem({ tipo: 'efeito', id });
            }}
          >
            <MiniaturaDoEfeito id={e.id} intensidade={e.intensidadePadrao} ativo={sobre === e.id} />
            <span className="demo-cartao__nome">
              {e.rotulo}
              {'pesado' in e && e.pesado && <span className="demo-cartao__selo" title="Mais lento para exportar">pesado</span>}
            </span>
            <span className="demo-cartao__quando">{e.quando}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------- Efeitos de trecho ----------

function Efeitos(props: Props) {
  const { plan, posicaoMs, clipeSelecionado, onOperacao, onOperacoes } = props;
  const agenda = useMemo(() => agendaDoPlano(plan), [plan]);
  const alvo =
    agenda.trechos.find((t) => t.clip.id === clipeSelecionado) ??
    agenda.trechos.find((t) => posicaoMs >= t.inicioMs && posicaoMs < t.inicioMs + t.duracaoMs) ??
    agenda.trechos[0];
  if (!alvo) return null;
  const atual = alvo.clip.effect ?? 'nenhum';

  return (
    <>
      <EfeitosDeTela {...props} />
      <h3 className="biblioteca__subtitulo">Zoom do trecho</h3>
      <Alvo>
        Aplica no trecho {clipeSelecionado ? 'selecionado' : 'sob o cursor'} ({tempo(alvo.inicioMs)}–{tempo(alvo.inicioMs + alvo.duracaoMs)}).
      </Alvo>
      <div className="demos" role="radiogroup" aria-label="Efeitos do trecho">
        {EFEITOS_DE_TRECHO.map((e) => (
          <button
            key={e.id}
            type="button"
            role="radio"
            aria-checked={atual === e.id}
            className="demo-cartao"
            title={`${e.descricao} ${e.quando}`}
            onClick={() => onOperacao({ op: 'definir_efeito', clipId: alvo.clip.id, effect: e.id })}
          >
            <span className={`demo demo--efeito demo--${e.id}`} aria-hidden>
              <span className="demo__pessoa" />
            </span>
            <span className="demo-cartao__nome">{e.rotulo}</span>
            <span className="demo-cartao__quando">{e.quando}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="botao botao--secundario botao--pequeno"
        style={{ marginTop: 'var(--e3)' }}
        onClick={() =>
          onOperacoes(
            agenda.trechos.map((t, i) => ({ op: 'definir_efeito' as const, clipId: t.clip.id, effect: i % 2 ? ('punch_in' as const) : ('nenhum' as const) })),
          )
        }
      >
        Zoom rápido alternado (um sim, um não)
      </button>
    </>
  );
}

// ---------- Sons ----------

/** Toca um som e para o anterior: prévia de um clique. */
function usePrevia() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState<string | null>(null);
  useEffect(() => () => ref.current?.pause(), []);
  const tocar = (id: string, url: string) => {
    ref.current?.pause();
    if (tocando === id) {
      setTocando(null);
      return;
    }
    const a = new Audio(url);
    ref.current = a;
    a.onended = () => setTocando(null);
    void a.play().then(() => setTocando(id), () => setTocando(null));
  };
  return { tocando, tocar };
}

function Sons({ plan, posicaoMs, onOperacao, onOperacoes, transcricao }: Props) {
  const previa = usePrevia();
  const [grupo, setGrupo] = useState<CategoriaDeSom | 'todos'>('todos');
  const [proteger, setProteger] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const duracaoTotal = useMemo(() => agendaDoPlano(plan).duracaoMs, [plan]);
  const noCursor = Math.min(Math.max(0, Math.round(posicaoMs)), Math.max(0, duracaoTotal - 300));
  // A fala no tempo da timeline: é dela que os sons desviam.
  const fala = useMemo(() => palavrasNaTimeline(plan, transcricao?.segmentos.flatMap((s) => s.palavras) ?? []), [plan, transcricao]);
  const temFala = fala.length > 0;

  const adicionar = (id: EfeitoSonoroEmbutido) => {
    if (!proteger || !temFala) {
      onOperacao({ op: 'adicionar_efeito_sonoro', assetId: id, timelineStartMs: noCursor, gainDb: -10 });
      setAviso(null);
      return;
    }
    const p = protegerFala(noCursor, duracaoDoSom(id), fala);
    onOperacao({ op: 'adicionar_efeito_sonoro', assetId: id, timelineStartMs: p.inicioMs, gainDb: -10 + p.ganhoDb });
    setAviso(
      p.motivo === 'movido'
        ? `O cursor estava em cima de uma palavra: o som foi para a pausa em ${tempo(p.inicioMs)}.`
        : p.motivo === 'abaixado'
          ? 'Sem pausa perto do cursor: o som entrou 6 dB mais baixo para não cobrir a fala.'
          : null,
    );
  };

  const sugerir = () => {
    const lista = sugerirSons(plan, fala);
    if (!lista.length) {
      setAviso('Nada a sugerir: os elementos do vídeo já têm som, ou não há transição, texto ou efeito para acompanhar.');
      return;
    }
    onOperacoes(lista.map((s) => ({ op: 'adicionar_efeito_sonoro' as const, assetId: s.assetId, timelineStartMs: s.timelineStartMs, gainDb: s.gainDb })));
    setAviso(`${lista.length} som(ns) sugerido(s): ${lista.map((s) => `${NOME_DO_SOM[s.assetId] ?? s.assetId} (${s.motivo}, ${tempo(s.timelineStartMs)})`).join('; ')}.`);
  };

  const protegerTodos = () => {
    const ops: TimelineOperation[] = [];
    for (const e of plan.soundEffects) {
      const p = protegerFala(e.timelineStartMs, ehEfeitoSonoroEmbutido(e.assetId) ? duracaoDoSom(e.assetId) : 600, fala);
      if (p.motivo === 'movido') ops.push({ op: 'editar_efeito_sonoro', soundEffectId: e.id, timelineStartMs: p.inicioMs });
      else if (p.motivo === 'abaixado') ops.push({ op: 'editar_efeito_sonoro', soundEffectId: e.id, gainDb: Math.max(-40, e.gainDb - 6) });
    }
    if (ops.length) onOperacoes(ops);
    setAviso(ops.length ? `${ops.length} som(ns) ajustado(s) para não cobrir a fala.` : 'Nenhum som está em cima da fala.');
  };

  return (
    <>
      <Alvo>Toque ▶ para ouvir. “Adicionar” põe o som no cursor ({tempo(noCursor)}); depois é só arrastar na faixa Sons.</Alvo>
      <div className="biblioteca__chips" role="radiogroup" aria-label="Tipo de som">
        {([['todos', 'Todos'], ...Object.entries(CATEGORIAS_DE_SOM)] as Array<[CategoriaDeSom | 'todos', string]>).map(([id, rotulo]) => (
          <button key={id} type="button" role="radio" aria-checked={grupo === id} className="biblioteca__chip" onClick={() => setGrupo(id)}>
            {rotulo}
          </button>
        ))}
      </div>
      {temFala && (
        <label className="biblioteca__opcao">
          <input type="checkbox" checked={proteger} onChange={(e) => setProteger(e.target.checked)} /> Proteger a fala: o som vai para a pausa mais
          perto (ou entra mais baixo) em vez de cobrir uma palavra
        </label>
      )}
      <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap', marginBottom: 'var(--e3)' }}>
        <button type="button" className="botao botao--secundario botao--pequeno" onClick={sugerir}>
          Sugerir sons pelos elementos
        </button>
        {temFala && plan.soundEffects.length > 0 && (
          <button type="button" className="botao botao--fantasma botao--pequeno" onClick={protegerTodos}>
            Proteger a fala nos sons que já estão
          </button>
        )}
      </div>
      {aviso && (
        <p className="biblioteca__alvo" role="status">
          {aviso}
        </p>
      )}
      <ul className="lista-de-sons">
        {SONS.filter((s) => grupo === 'todos' || s.categoria === grupo).map((s) => (
          <li key={s.id} className="som">
            <button
              type="button"
              className="botao-icone som__play"
              aria-label={previa.tocando === s.id ? `Parar ${s.rotulo}` : `Ouvir ${s.rotulo}`}
              onClick={() => previa.tocar(s.id, `/sons/${s.id}.wav`)}
            >
              {previa.tocando === s.id ? <IconePausar size={16} weight="fill" /> : <IconeTocar size={16} weight="fill" />}
            </button>
            <span className="som__texto">
              <strong>{s.rotulo}</strong>
              <span>{s.quando}</span>
            </span>
            <button type="button" className="botao botao--secundario botao--pequeno" onClick={() => adicionar(s.id)}>
              <IconeMais size={14} /> Adicionar
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- Trilha ----------

function Trilha({ plan, onOperacao, urlDoAsset }: Props) {
  const [trilhas, setTrilhas] = useState<Asset[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const previa = usePrevia();
  const entradaRef = useRef<HTMLInputElement>(null);

  const carregar = () =>
    apiAssets
      .listar('MUSIC')
      .then(setTrilhas)
      .catch(() => setTrilhas([]));
  useEffect(() => {
    void carregar();
  }, []);

  const enviar = async (arquivo: File) => {
    setEnviando(true);
    setErro(null);
    try {
      const { id } = await apiAssets.enviar('MUSIC', arquivo);
      await carregar();
      onOperacao({ op: 'trocar_musica', assetId: id });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível enviar a trilha.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Alvo>
        A trilha toca do começo ao fim, abaixo da voz. Com “abaixar na fala”, ela desce sozinha enquanto alguém fala e volta nas pausas.
      </Alvo>
      <input
        ref={entradaRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
        hidden
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = '';
          if (arquivo) void enviar(arquivo);
        }}
      />
      <button type="button" className="botao botao--primario" style={{ width: '100%' }} disabled={enviando} onClick={() => entradaRef.current?.click()}>
        <IconeEnviar size={16} /> {enviando ? 'Enviando a trilha…' : 'Enviar uma música'}
      </button>
      {erro && <p className="campo__erro">{erro}</p>}
      <p className="campo__ajuda">Use só música que você tem direito de usar (sua, comprada ou livre de direitos).</p>

      {trilhas === null ? (
        <p className="texto-secundario">Carregando trilhas…</p>
      ) : trilhas.length === 0 ? (
        <p className="texto-secundario">Nenhuma trilha ainda. Envie uma música ou cadastre no Kit de marca.</p>
      ) : (
        <ul className="lista-de-sons">
          {trilhas.map((t) => {
            const emUso = plan.music?.assetId === t.id;
            return (
              <li key={t.id} className="som" data-em-uso={emUso || undefined}>
                <button
                  type="button"
                  className="botao-icone som__play"
                  aria-label={previa.tocando === t.id ? 'Parar' : `Ouvir ${t.originalName}`}
                  onClick={() => previa.tocar(t.id, urlDoAsset(t.id))}
                >
                  {previa.tocando === t.id ? <IconePausar size={16} weight="fill" /> : <IconeTocar size={16} weight="fill" />}
                </button>
                <span className="som__texto">
                  <strong>{t.originalName}</strong>
                  <span>{t.durationMs ? tempo(t.durationMs) : ''}</span>
                </span>
                {emUso ? (
                  <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => onOperacao({ op: 'trocar_musica', assetId: null })}>
                    <IconeLixeira size={14} /> Tirar
                  </button>
                ) : (
                  <button type="button" className="botao botao--secundario botao--pequeno" onClick={() => onOperacao({ op: 'trocar_musica', assetId: t.id })}>
                    Usar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
