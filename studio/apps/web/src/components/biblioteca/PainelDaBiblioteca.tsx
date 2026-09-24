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
import type { EditPlanV1, MarcaDoVideo, TimelineOperation } from '@makucho/studio-contracts';
import { DURACAO_PADRAO_DA_TRANSICAO, agendaDoPlano } from '@makucho/studio-contracts';
import { assets as apiAssets, type Asset } from '../../lib/api';
import { EstilosDeTexto } from '../editor/EstilosDeTexto';
import type { ItemDaTimeline } from '../timeline/camadas';
import { tempo } from '../editor/funcoes';
import { EFEITOS_DE_TRECHO, ELEMENTOS, SONS, TRANSICOES } from './catalogo';
import { IconeTocar, IconePausar, IconeMais, IconeEnviar, IconeCheck, IconeLixeira } from '../icones';

export type CategoriaDaBiblioteca = 'textos' | 'transicoes' | 'efeitos' | 'sons' | 'trilha';

const CATEGORIAS: ReadonlyArray<readonly [CategoriaDaBiblioteca, string]> = [
  ['textos', 'Textos'],
  ['transicoes', 'Transições'],
  ['efeitos', 'Efeitos'],
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
        {categoria === 'transicoes' && <Transicoes {...props} />}
        {categoria === 'efeitos' && <Efeitos {...props} />}
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

// ---------- Transições ----------

function Transicoes({ plan, posicaoMs, itemSelecionado, onOperacao }: Props) {
  const agenda = useMemo(() => agendaDoPlano(plan), [plan]);
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
      <div className="demos" role="radiogroup" aria-label="Transições">
        {TRANSICOES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={atual === t.id}
            className="demo-cartao"
            title={`${t.descricao} ${t.quando}`}
            onClick={() =>
              alvo &&
              onOperacao({
                op: 'definir_transicao',
                clipId: alvo.clipId,
                type: t.id,
                ...(t.id !== 'cut' ? { durationMs: DURACAO_PADRAO_DA_TRANSICAO[t.id] } : {}),
              })
            }
          >
            <span className={`demo demo--transicao demo--${t.id}`} aria-hidden>
              <span className="demo__a">A</span>
              <span className="demo__b">B</span>
            </span>
            <span className="demo-cartao__nome">{t.rotulo}</span>
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

// ---------- Efeitos de trecho ----------

function Efeitos({ plan, posicaoMs, clipeSelecionado, onOperacao, onOperacoes }: Props) {
  const agenda = useMemo(() => agendaDoPlano(plan), [plan]);
  const alvo =
    agenda.trechos.find((t) => t.clip.id === clipeSelecionado) ??
    agenda.trechos.find((t) => posicaoMs >= t.inicioMs && posicaoMs < t.inicioMs + t.duracaoMs) ??
    agenda.trechos[0];
  if (!alvo) return null;
  const atual = alvo.clip.effect ?? 'nenhum';

  return (
    <>
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

function Sons({ plan, posicaoMs, onOperacao }: Props) {
  const previa = usePrevia();
  const duracaoTotal = useMemo(() => agendaDoPlano(plan).duracaoMs, [plan]);
  const noCursor = Math.min(Math.max(0, Math.round(posicaoMs)), Math.max(0, duracaoTotal - 300));
  return (
    <>
      <Alvo>Toque ▶ para ouvir. “Adicionar” põe o som no cursor ({tempo(noCursor)}); depois é só arrastar na faixa Sons.</Alvo>
      <ul className="lista-de-sons">
        {SONS.map((s) => (
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
            <button
              type="button"
              className="botao botao--secundario botao--pequeno"
              onClick={() => onOperacao({ op: 'adicionar_efeito_sonoro', assetId: s.id, timelineStartMs: noCursor, gainDb: -10 })}
            >
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
