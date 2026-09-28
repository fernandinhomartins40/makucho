'use client';

// ============================================================
// Criar imagem com IA (Pollinations, com a chave do workspace).
//
// Para quando o banco de fotos não tem a cena: descreve, escolhe o
// formato e o estilo, e a imagem entra no cursor (vertical em tela
// cheia, com um movimento lento; as outras livres, para posicionar).
// ============================================================

import { useState } from 'react';
import type { EstiloDaImagemPorIa, FormatoDaImagemPorIa, TimelineOperation } from '@makucho/studio-contracts';
import { ESTILOS_DA_IMAGEM_POR_IA, FORMATOS_DA_IMAGEM_POR_IA } from '@makucho/studio-contracts';
import { bancoDeMidia } from '../../lib/api';
import type { ItemDaTimeline } from '../timeline/camadas';
import { tempo } from '../editor/funcoes';
import { IconeIA } from '../icones';

interface Props {
  noCursor: number;
  duracaoTotal: number;
  urlDoAsset: (id: string) => string;
  onOperacao: (op: TimelineOperation) => void;
  onSelecionarItem: (item: ItemDaTimeline) => void;
  onCriada?: () => void;
}

export function CriarImagemComIa({ noCursor, duracaoTotal, urlDoAsset, onOperacao, onSelecionarItem, onCriada }: Props) {
  const [descricao, setDescricao] = useState('');
  const [formato, setFormato] = useState<FormatoDaImagemPorIa>('vertical');
  const [estilo, setEstilo] = useState<EstiloDaImagemPorIa>('foto');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultima, setUltima] = useState<string | null>(null);

  const criar = async () => {
    setCriando(true);
    setErro(null);
    try {
      const a = await bancoDeMidia.gerarImagem({ descricao: descricao.trim(), formato, estilo });
      const id = `md${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      const dur = Math.max(300, Math.min(3500, duracaoTotal - noCursor));
      onOperacao(
        formato === 'vertical'
          ? { op: 'adicionar_midia', id, assetId: a.id, kind: 'image', layout: 'tela_cheia', timelineStartMs: noCursor, durationMs: dur, kenBurns: 'aproximar', fadeInMs: 150, fadeOutMs: 150 }
          : { op: 'adicionar_midia', id, assetId: a.id, kind: 'image', layout: 'livre', x: 0.5, y: 0.42, width: formato === 'quadrado' ? 0.8 : 0.9, radius: 0.04, timelineStartMs: noCursor, durationMs: dur, fadeInMs: 150, fadeOutMs: 150 },
      );
      onSelecionarItem({ tipo: 'midia', id });
      setUltima(a.id);
      onCriada?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível criar a imagem.');
    } finally {
      setCriando(false);
    }
  };

  return (
    <div className="criar-com-ia">
      <span className="campo__rotulo" style={{ display: 'block', marginTop: 'var(--e3)' }}>
        Criar imagem com IA
      </span>
      <p className="campo__ajuda">Quando o banco não tem a cena. Descreva o que aparece (em inglês sai ainda melhor). Entra no cursor ({tempo(noCursor)}).</p>
      <textarea
        className="campo__entrada"
        rows={3}
        value={descricao}
        maxLength={600}
        onChange={(e) => setDescricao(e.target.value)}
        placeholder="Ex.: xícara de café com vapor sobre uma mesa de madeira, luz da manhã"
        aria-label="Descrição da imagem"
      />
      <div className="biblioteca__chips" role="radiogroup" aria-label="Formato da imagem">
        {(Object.keys(FORMATOS_DA_IMAGEM_POR_IA) as FormatoDaImagemPorIa[]).map((f) => (
          <button key={f} type="button" role="radio" aria-checked={formato === f} className="biblioteca__chip" onClick={() => setFormato(f)}>
            {FORMATOS_DA_IMAGEM_POR_IA[f].rotulo}
          </button>
        ))}
      </div>
      <div className="biblioteca__chips" role="radiogroup" aria-label="Estilo da imagem">
        {(Object.keys(ESTILOS_DA_IMAGEM_POR_IA) as EstiloDaImagemPorIa[]).map((e) => (
          <button key={e} type="button" role="radio" aria-checked={estilo === e} className="biblioteca__chip" onClick={() => setEstilo(e)}>
            {ESTILOS_DA_IMAGEM_POR_IA[e].rotulo}
          </button>
        ))}
      </div>
      <button type="button" className="botao botao--primario" style={{ width: '100%' }} disabled={criando || descricao.trim().length < 3} onClick={() => void criar()}>
        <IconeIA size={16} /> {criando ? 'Criando a imagem (uns segundos)…' : 'Criar imagem'}
      </button>
      {erro && <p className="campo__erro">{erro}</p>}
      {ultima && !criando && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="criar-com-ia__ultima" src={urlDoAsset(ultima)} alt="A última imagem criada" />
      )}
    </div>
  );
}
