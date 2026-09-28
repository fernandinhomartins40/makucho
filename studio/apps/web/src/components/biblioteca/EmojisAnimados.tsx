'use client';

// ============================================================
// Emojis animados (Noto Animated Emoji, Google, CC BY 4.0).
//
// A lista vem do catálogo do Google; a busca é local e em português
// (glossário). A miniatura já anima (o WebP do Google). Tocar traz o
// emoji como folha de quadros e põe no cursor, livre na tela.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import type { EmojiAnimado, TimelineOperation } from '@makucho/studio-contracts';
import { CATEGORIAS_DE_EMOJI_ANIMADO, URL_DA_MINIATURA_DO_EMOJI, URL_DO_EMOJI_ANIMADO, buscarEmojisAnimados, caractereDoEmoji } from '@makucho/studio-contracts';
import { bancoDeMidia } from '../../lib/api';
import type { ItemDaTimeline } from '../timeline/camadas';

interface Props {
  noCursor: number;
  duracaoTotal: number;
  onOperacao: (op: TimelineOperation) => void;
  onSelecionarItem: (item: ItemDaTimeline) => void;
}

export function EmojisAnimados({ noCursor, duracaoTotal, onOperacao, onSelecionarItem }: Props) {
  const [lista, setLista] = useState<EmojiAnimado[] | null>(null);
  const [credito, setCredito] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [trazendo, setTrazendo] = useState<string | null>(null);
  // A lista mostra o desenho parado (leve); com o mouse ou o foco, anima.
  const [sobre, setSobre] = useState<string | null>(null);

  useEffect(() => {
    bancoDeMidia
      .emojisAnimados()
      .then((r) => {
        setLista(r.emojis);
        setCredito(r.credito);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'não foi possível carregar os emojis animados.'));
  }, []);

  const achados = useMemo(() => (lista ? buscarEmojisAnimados(lista, busca, categoria ?? undefined).slice(0, 48) : []), [lista, busca, categoria]);

  const por = async (e: EmojiAnimado) => {
    setTrazendo(e.codigo);
    setErro(null);
    try {
      const { asset, sprite } = await bancoDeMidia.importarEmojiAnimado(e.codigo);
      const id = `md${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      onOperacao({
        op: 'adicionar_midia',
        id,
        assetId: asset.id,
        kind: 'image',
        layout: 'livre',
        x: 0.5,
        y: 0.35,
        width: 0.28,
        sprite,
        timelineStartMs: noCursor,
        durationMs: Math.max(300, Math.min(3000, duracaoTotal - noCursor)),
        fadeOutMs: 120,
      });
      onSelecionarItem({ tipo: 'midia', id });
    } catch (x) {
      setErro(x instanceof Error ? x.message : 'não foi possível trazer o emoji.');
    } finally {
      setTrazendo(null);
    }
  };

  return (
    <div className="emojis-animados">
      <span className="campo__rotulo" style={{ display: 'block', marginTop: 'var(--e3)' }}>
        Emojis animados
      </span>
      <input
        className="campo__entrada"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Ex.: fogo, risada, palmas, dinheiro"
        aria-label="Buscar emoji animado"
      />
      <div className="biblioteca__chips" role="radiogroup" aria-label="Tipo de emoji">
        <button type="button" role="radio" aria-checked={categoria === null} className="biblioteca__chip" onClick={() => setCategoria(null)}>
          Todos
        </button>
        {Object.entries(CATEGORIAS_DE_EMOJI_ANIMADO).map(([id, rotulo]) => (
          <button key={id} type="button" role="radio" aria-checked={categoria === id} className="biblioteca__chip" onClick={() => setCategoria(id)}>
            {rotulo}
          </button>
        ))}
      </div>
      {erro && <p className="campo__erro">{erro}</p>}
      {lista === null && !erro && <p className="texto-secundario">Carregando…</p>}
      {lista && achados.length === 0 && <p className="texto-secundario">Nada encontrado. Tente outra palavra.</p>}
      <div className="grade-de-stickers">
        {achados.map((e) => (
          <button
            key={e.codigo}
            type="button"
            className="sticker-cartao"
            title={e.tags.join(', ')}
            aria-label={`Pôr o emoji animado ${caractereDoEmoji(e.codigo)}`}
            disabled={trazendo !== null}
            data-trazendo={trazendo === e.codigo || undefined}
            onClick={() => void por(e)}
            onMouseEnter={() => setSobre(e.codigo)}
            onMouseLeave={() => setSobre((s) => (s === e.codigo ? null : s))}
            onFocus={() => setSobre(e.codigo)}
            onBlur={() => setSobre((s) => (s === e.codigo ? null : s))}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sobre === e.codigo ? URL_DO_EMOJI_ANIMADO(e.codigo) : URL_DA_MINIATURA_DO_EMOJI(e.codigo)} alt="" loading="lazy" draggable={false} />
          </button>
        ))}
      </div>
      {credito && <p className="campo__ajuda">{credito}. Cole o crédito na legenda do post quando usar.</p>}
    </div>
  );
}
