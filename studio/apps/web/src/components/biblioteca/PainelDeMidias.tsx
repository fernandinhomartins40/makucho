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
import type { EditPlanV1, LayoutDeMidia, TimelineOperation } from '@makucho/studio-contracts';
import { agendaDoPlano } from '@makucho/studio-contracts';
import { assets as apiAssets, type Asset } from '../../lib/api';
import type { ItemDaTimeline } from '../timeline/camadas';
import { tempo } from '../editor/funcoes';
import { IconeEnviar } from '../icones';

interface Props {
  plan: EditPlanV1;
  posicaoMs: number;
  onOperacao: (op: TimelineOperation) => void;
  onSelecionarItem: (item: ItemDaTimeline) => void;
  urlDoAsset: (id: string) => string;
}

const LAYOUTS: ReadonlyArray<readonly [LayoutDeMidia, string, string]> = [
  ['tela_cheia', 'Tela cheia', 'B-roll: cobre o vídeo, a fala continua'],
  ['pip', 'Janela', 'Uma janela no canto (picture-in-picture)'],
  ['dividir_baixo', 'Dividir', 'Metade de baixo da tela'],
];

export function PainelDeMidias({ plan, posicaoMs, onOperacao, onSelecionarItem, urlDoAsset }: Props) {
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
