'use client';

// ============================================================
// Imagens e vídeos por cima do vídeo: B-roll em tela cheia, janela
// (picture-in-picture) e tela dividida.
//
// Os arquivos são os do workspace (Kit de marca / envios daqui). Um
// clique põe a mídia no cursor, no layout escolhido; depois ela é um item
// da faixa Mídia, que se arrasta e se ajusta no painel.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditPlanV1, KenBurns, LayoutDeMidia, TimelineOperation } from '@makucho/studio-contracts';
import { agendaDoPlano, cortesDoSlideshow } from '@makucho/studio-contracts';
import { batidasDaTrilha } from '../../lib/batidasDaTrilha';
import { assets as apiAssets, bancoDeMidia, type Asset, type ResultadoDoBanco, type Transcricao } from '../../lib/api';
import type { ItemDaTimeline } from '../timeline/camadas';
import { tempo } from '../editor/funcoes';
import { IconeEnviar } from '../icones';

interface Props {
  plan: EditPlanV1;
  posicaoMs: number;
  onOperacao: (op: TimelineOperation) => void;
  onOperacoes: (ops: TimelineOperation[]) => void;
  onSelecionarItem: (item: ItemDaTimeline) => void;
  urlDoAsset: (id: string) => string;
  transcricao?: Transcricao | null;
}

/** Os Ken Burns do slideshow, em sequência: cada foto com um movimento. */
const MOVIMENTOS: readonly KenBurns[] = ['aproximar', 'para_esquerda', 'afastar', 'para_direita'];
const novoId = () => `md${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const PALAVRAS_VAZIAS = new Set(
  (
    'a o as os um uma uns umas de da do das dos em na no nas nos por pra para pelo pela com sem que se e ou mas ' +
    'eu voce você ele ela nos nós eles elas isso isto aquilo esse essa este esta meu minha seu sua é era foi ser ter tem ' +
    'tá ta está estar muito mais menos bem então entao aqui ali lá la quando onde como porque porquê já ja não nao sim ' +
    'vai vou fazer faz coisa coisas gente tipo né ne aí ai agora hoje depois antes também tambem só so'
  ).split(' '),
);

/**
 * Palavras para buscar B-roll: as mais longas e sem as vazias, da fala
 * em volta do cursor (±2 s). Não é IA: é um ponto de partida editável.
 */
export function palavrasDaFala(transcricao: Transcricao | null | undefined, plan: EditPlanV1, ms: number): string {
  if (!transcricao?.segmentos.length) return '';
  const agenda = agendaDoPlano(plan);
  const trecho = agenda.trechos.find((t) => ms >= t.inicioMs && ms < t.inicioMs + t.duracaoMs);
  if (!trecho) return '';
  const fonte = trecho.clip.sourceStartMs + (ms - trecho.inicioMs);
  const palavras = transcricao.segmentos
    .flatMap((s) => s.palavras)
    .filter((p) => p.endMs >= fonte - 2000 && p.startMs <= fonte + 2000)
    .map((p) => p.texto.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter((p) => p.length > 3 && !PALAVRAS_VAZIAS.has(p));
  return [...new Set(palavras)].sort((a, b) => b.length - a.length).slice(0, 3).join(' ');
}

const LAYOUTS: ReadonlyArray<readonly [LayoutDeMidia, string, string]> = [
  ['tela_cheia', 'Tela cheia', 'B-roll: cobre o vídeo, a fala continua'],
  ['pip', 'Janela', 'Uma janela no canto (picture-in-picture)'],
  ['dividir_baixo', 'Dividir', 'Metade de baixo da tela'],
];

export function PainelDeMidias({ plan, posicaoMs, onOperacao, onOperacoes, onSelecionarItem, urlDoAsset, transcricao }: Props) {
  const [lista, setLista] = useState<Asset[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const entradaRef = useRef<HTMLInputElement>(null);
  const duracaoTotal = useMemo(() => agendaDoPlano(plan).duracaoMs, [plan]);
  const noCursor = Math.min(Math.max(0, Math.round(posicaoMs)), Math.max(0, duracaoTotal - 300));

  const carregar = () =>
    Promise.all([apiAssets.listar('IMAGE'), apiAssets.listar('VIDEO')])
      .then(([imagens, videos]) => setLista([...videos, ...imagens].sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
      .catch(() => setLista([]));
  useEffect(() => {
    void carregar();
  }, []);

  const enviar = async (arquivo: File) => {
    setEnviando(true);
    setErro(null);
    try {
      await apiAssets.enviar(arquivo.type.startsWith('video/') ? 'VIDEO' : 'IMAGE', arquivo);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível enviar o arquivo.');
    } finally {
      setEnviando(false);
    }
  };

  // ---------- Busca no Pexels ----------
  const [busca, setBusca] = useState('');
  const [tipoDaBusca, setTipoDaBusca] = useState<'video' | 'foto'>('video');
  const [resultados, setResultados] = useState<ResultadoDoBanco[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [trazendo, setTrazendo] = useState<number | null>(null);
  const [erroDaBusca, setErroDaBusca] = useState<string | null>(null);
  const buscar = async () => {
    if (!busca.trim()) return;
    setBuscando(true);
    setErroDaBusca(null);
    try {
      setResultados((await bancoDeMidia.buscar(busca.trim(), tipoDaBusca)).resultados);
    } catch (e) {
      setErroDaBusca(e instanceof Error ? e.message : 'a busca falhou.');
      setResultados(null);
    } finally {
      setBuscando(false);
    }
  };
  /** Traz do Pexels (o servidor baixa) e já põe no vídeo. */
  const trazer = async (r: ResultadoDoBanco, layout: LayoutDeMidia) => {
    setTrazendo(r.id);
    setErroDaBusca(null);
    try {
      const { id } = await bancoDeMidia.importar(r.tipo, r.id);
      const novos = await Promise.all([apiAssets.listar('IMAGE'), apiAssets.listar('VIDEO')]);
      const todos = [...novos[1], ...novos[0]].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setLista(todos);
      const asset = todos.find((a) => a.id === id);
      if (asset) adicionar({ ...asset, durationMs: asset.durationMs ?? r.duracaoMs }, layout);
    } catch (e) {
      setErroDaBusca(e instanceof Error ? e.message : 'não foi possível trazer o arquivo.');
    } finally {
      setTrazendo(null);
    }
  };

  // ---------- Montagens com várias fotos ----------
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [montando, setMontando] = useState(false);
  const [avisoDaMontagem, setAvisoDaMontagem] = useState<string | null>(null);
  const alternar = (id: string) => setEscolhidas((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const camada = (assetId: string, layout: LayoutDeMidia, inicio: number, dur: number, extra: Record<string, unknown> = {}) =>
    ({ op: 'adicionar_midia', id: novoId(), assetId, kind: 'image', layout, timelineStartMs: Math.round(inicio), durationMs: Math.max(300, Math.round(dur)), ...extra }) as TimelineOperation;
  const resto = Math.max(300, duracaoTotal - noCursor);

  /** Slideshow: cada foto em tela cheia até a próxima batida da trilha (ou a cada 2 s). */
  const slideshow = async () => {
    setMontando(true);
    setAvisoDaMontagem(null);
    try {
      let cortes: number[];
      let texto: string;
      if (plan.music) {
        const { batidas, duracaoS } = await batidasDaTrilha(urlDoAsset(plan.music.assetId));
        cortes = cortesDoSlideshow(batidas, escolhidas.length, noCursor / 1000, 1.2, duracaoS);
        texto = batidas.bpm ? `no ritmo da trilha (${batidas.bpm} BPM)` : 'a cada 1,2 s (a trilha não tem batida clara)';
      } else {
        cortes = cortesDoSlideshow({ bpm: 0, tempos: [] }, escolhidas.length, noCursor / 1000, 2);
        texto = 'a cada 2 s (sem trilha no vídeo)';
      }
      const ops = escolhidas.map((id, i) =>
        camada(id, 'tela_cheia', cortes[i]! * 1000, Math.min((cortes[i + 1]! - cortes[i]!) * 1000, duracaoTotal - cortes[i]! * 1000), {
          kenBurns: MOVIMENTOS[i % MOVIMENTOS.length],
          fadeInMs: 120,
        }),
      ).filter((op) => (op as { timelineStartMs: number }).timelineStartMs < duracaoTotal);
      onOperacoes(ops);
      setAvisoDaMontagem(`${ops.length} fotos, ${texto}. Cada uma é um item da faixa Mídia.`);
      setEscolhidas([]);
    } catch (e) {
      setAvisoDaMontagem(e instanceof Error ? e.message : 'não foi possível montar o slideshow.');
    } finally {
      setMontando(false);
    }
  };

  const colagem = () => {
    const lugares: Record<number, LayoutDeMidia[]> = {
      2: ['dividir_cima', 'dividir_baixo'],
      3: ['terco_cima', 'terco_meio', 'terco_baixo'],
      4: ['quadrante_1', 'quadrante_2', 'quadrante_3', 'quadrante_4'],
    };
    const l = lugares[escolhidas.length];
    if (!l) return;
    onOperacoes(escolhidas.map((id, i) => camada(id, l[i]!, noCursor, Math.min(3000, resto), { fadeInMs: 120 + i * 80 })));
    setAvisoDaMontagem(`Colagem de ${escolhidas.length} fotos no cursor.`);
    setEscolhidas([]);
  };

  const antesEDepois = (modo: 'lado' | 'cortina') => {
    if (escolhidas.length !== 2) return;
    const [antes, depois] = escolhidas as [string, string];
    const dur = Math.min(4000, resto);
    onOperacoes(
      modo === 'lado'
        ? [camada(antes, 'esquerda', noCursor, dur), camada(depois, 'direita', noCursor, dur)]
        : [camada(antes, 'tela_cheia', noCursor, dur), camada(depois, 'tela_cheia', noCursor, dur, { reveal: 'da_esquerda', revealMs: Math.min(1500, dur / 2) })],
    );
    setAvisoDaMontagem(modo === 'lado' ? 'Antes à esquerda, depois à direita.' : 'O depois se revela da esquerda sobre o antes.');
    setEscolhidas([]);
  };

  const adicionar = (a: Asset, layout: LayoutDeMidia) => {
    const video = a.kind === 'VIDEO';
    const padrao = video ? Math.min(a.durationMs ?? 4000, 4000) : 3000;
    const id = `md${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    onOperacao({
      op: 'adicionar_midia',
      id,
      assetId: a.id,
      kind: video ? 'video' : 'image',
      timelineStartMs: noCursor,
      durationMs: Math.max(300, Math.min(padrao, duracaoTotal - noCursor)),
      layout,
      ...(layout === 'pip' ? { radius: 0.08 } : {}),
      fadeInMs: 150,
      fadeOutMs: 150,
    });
    onSelecionarItem({ tipo: 'midia', id });
  };

  return (
    <>
      <p className="biblioteca__alvo">
        Entra no cursor ({tempo(noCursor)}) na faixa Mídia. B-roll em vídeo entra mudo: a fala continua por baixo.
      </p>
      <input
        ref={entradaRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
        hidden
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = '';
          if (arquivo) void enviar(arquivo);
        }}
      />
      <button type="button" className="botao botao--primario" style={{ width: '100%' }} disabled={enviando} onClick={() => entradaRef.current?.click()}>
        <IconeEnviar size={16} /> {enviando ? 'Enviando…' : 'Enviar imagem ou vídeo'}
      </button>
      {erro && <p className="campo__erro">{erro}</p>}
      <p className="campo__ajuda">Imagem até 10 MB, vídeo até 100 MB. Use só mídia que você tem direito de usar.</p>

      <form
        className="busca-no-banco"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
      >
        <span className="campo__rotulo">Buscar no Pexels</span>
        <div className="linha" style={{ gap: 6 }}>
          <input
            className="campo__entrada crescer"
            placeholder="Ex.: escritório, dinheiro, cidade à noite"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="O que buscar"
          />
          <select className="campo__selecao" style={{ width: 'auto' }} value={tipoDaBusca} onChange={(e) => setTipoDaBusca(e.target.value as 'video' | 'foto')} aria-label="Tipo">
            <option value="video">Vídeos</option>
            <option value="foto">Fotos</option>
          </select>
          <button type="submit" className="botao botao--secundario" disabled={buscando || !busca.trim()}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        {transcricao?.segmentos.length ? (
          <button
            type="button"
            className="botao botao--fantasma botao--pequeno"
            style={{ justifySelf: 'start' }}
            onClick={() => {
              const sugestao = palavrasDaFala(transcricao, plan, posicaoMs);
              if (sugestao) setBusca(sugestao);
            }}
          >
            Sugerir pela fala no cursor
          </button>
        ) : null}
      </form>
      {erroDaBusca && <p className="campo__erro">{erroDaBusca}</p>}
      {resultados && (
        resultados.length === 0 ? (
          <p className="texto-secundario">Nada encontrado. Tente outras palavras (em inglês costuma dar mais resultados).</p>
        ) : (
          <div className="grade-de-midias grade-de-midias--banco">
            {resultados.map((r) => (
              <div key={`${r.tipo}${r.id}`} className="midia-cartao">
                <div className="midia-cartao__previa midia-cartao__previa--vertical">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.miniatura} alt="" loading="lazy" />
                  {r.duracaoMs !== null && <span className="midia-cartao__selo">{Math.round(r.duracaoMs / 1000)} s</span>}
                </div>
                <a className="midia-cartao__nome" href={r.pagina} target="_blank" rel="noreferrer" title="Ver no Pexels">
                  {r.autor}
                </a>
                <div className="midia-cartao__acoes">
                  {LAYOUTS.map(([layout, rotulo, dica]) => (
                    <button
                      key={layout}
                      type="button"
                      className="botao botao--secundario botao--pequeno"
                      title={dica}
                      disabled={trazendo !== null}
                      onClick={() => void trazer(r, layout)}
                    >
                      {trazendo === r.id ? '…' : rotulo}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <span className="campo__rotulo" style={{ marginTop: 'var(--e3)', display: 'block' }}>
        Do workspace
      </span>
      {escolhidas.length > 0 && (
        <div className="montagens" role="group" aria-label="Montagens com as fotos escolhidas">
          <strong style={{ fontSize: 13 }}>{escolhidas.length} foto(s) escolhida(s), na ordem em que foram marcadas</strong>
          <div className="linha" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="botao botao--primario botao--pequeno" disabled={montando || escolhidas.length < 2} onClick={() => void slideshow()}>
              {montando ? 'Medindo a trilha…' : 'Slideshow no ritmo'}
            </button>
            <button type="button" className="botao botao--secundario botao--pequeno" disabled={escolhidas.length < 2 || escolhidas.length > 4} onClick={colagem}>
              Colagem
            </button>
            <button type="button" className="botao botao--secundario botao--pequeno" disabled={escolhidas.length !== 2} onClick={() => antesEDepois('lado')}>
              Antes e depois
            </button>
            <button type="button" className="botao botao--secundario botao--pequeno" disabled={escolhidas.length !== 2} onClick={() => antesEDepois('cortina')}>
              Antes e depois (cortina)
            </button>
            <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => setEscolhidas([])}>
              Limpar
            </button>
          </div>
        </div>
      )}
      {avisoDaMontagem && (
        <p className="biblioteca__alvo" role="status">
          {avisoDaMontagem}
        </p>
      )}
      {lista === null ? (
        <p className="texto-secundario">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="texto-secundario">Nenhuma imagem ou vídeo ainda.</p>
      ) : (
        <div className="grade-de-midias">
          {lista.map((a) => (
            <div key={a.id} className="midia-cartao">
              <div className="midia-cartao__previa">
                {a.kind === 'VIDEO' ? (
                  <video src={`${urlDoAsset(a.id)}#t=0.5`} muted preload="metadata" playsInline aria-hidden />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlDoAsset(a.id)} alt="" loading="lazy" />
                )}
                {a.kind === 'VIDEO' && <span className="midia-cartao__selo">vídeo</span>}
                {a.kind === 'IMAGE' && (
                  <label className="midia-cartao__marcar" title="Escolher para slideshow, colagem ou antes e depois">
                    <input type="checkbox" checked={escolhidas.includes(a.id)} onChange={() => alternar(a.id)} aria-label={`Escolher ${a.originalName}`} />
                    {escolhidas.includes(a.id) && <span>{escolhidas.indexOf(a.id) + 1}</span>}
                  </label>
                )}
              </div>
              <span className="midia-cartao__nome" title={a.originalName}>
                {a.originalName}
              </span>
              <div className="midia-cartao__acoes">
                {LAYOUTS.map(([layout, rotulo, dica]) => (
                  <button key={layout} type="button" className="botao botao--secundario botao--pequeno" title={dica} onClick={() => adicionar(a, layout)}>
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
