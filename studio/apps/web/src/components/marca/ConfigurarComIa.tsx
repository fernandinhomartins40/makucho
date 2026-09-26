'use client';

// ============================================================
// "Configurar com IA": das logos ao kit inteiro num clique.
//
// As cores são medidas nos pixels das logos, aqui no navegador
// (lib/paleta.ts); a IA recebe essa paleta, o nome, o que a marca faz e
// o que a pessoa contou sobre ela, e monta TUDO: cores, fontes, estilo
// das legendas e dos textos, acabamento dos vídeos e o kit criativo
// (prompts de trilha, sons, vinhetas, imagens e vídeos). Nada é salvo
// sozinho: a sugestão aparece resumida, a pessoa usa ou descarta.
// ============================================================

import { useState } from 'react';
import type { SugestaoDeMarca } from '@makucho/studio-contracts';
import { PRESETS_DE_LEGENDA, PRESETS_DE_TEXTO } from '@makucho/studio-contracts';
import { assets as apiAssets, marca as apiMarca, type Asset } from '../../lib/api';
import { medirLogos } from '../../lib/paleta';
import { IconeIA, IconeCheck } from '../icones';

interface Props {
  logos: readonly Asset[];
  nome: string;
  onNome: (nome: string) => void;
  onAplicar: (s: SugestaoDeMarca) => void;
  /** Vai para a aba Identidade, para enviar a logo principal. */
  onEnviarLogo: () => void;
}

const NOME_DA_COR: Record<keyof SugestaoDeMarca['cores'], string> = {
  primary: 'Principal',
  secondary: 'Secundária',
  textDark: 'Fundo',
  accent: 'Superfície',
  textLight: 'Texto',
};

const POSICAO: Record<string, string> = { sd: 'canto de cima, à direita', se: 'canto de cima, à esquerda', id: 'canto de baixo, à direita', ie: 'canto de baixo, à esquerda' };

export function ConfigurarComIa({ logos, nome, onNome, onAplicar, onEnviarLogo }: Props) {
  const [segmento, setSegmento] = useState('');
  const [sobre, setSobre] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [sugestao, setSugestao] = useState<(SugestaoDeMarca & { aviso?: string }) | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const configurar = async () => {
    setCarregando(true);
    setErro(null);
    setSugestao(null);
    try {
      const medida = await medirLogos(
        logos.map((l) => ({ url: apiAssets.url(l.id), variante: l.kind as 'LOGO' | 'LOGO_NEGATIVE' | 'LOGO_COMPACT' | 'WATERMARK' })),
      );
      if (!medida.paleta.length) throw new Error('não deu para ler as cores das logos. Confira se os arquivos abrem.');
      setSugestao(
        await apiMarca.configurarComIa({
          ...medida,
          ...(nome.trim() ? { nome: nome.trim().slice(0, 60) } : {}),
          ...(segmento.trim() ? { segmento: segmento.trim().slice(0, 120) } : {}),
          ...(sobre.trim() ? { sobre: sobre.trim().slice(0, 800) } : {}),
        }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível configurar agora.');
    } finally {
      setCarregando(false);
    }
  };

  const rotulo = <T extends { id: string; rotulo: string }>(lista: readonly T[], id: string | null) => lista.find((x) => x.id === id)?.rotulo ?? id;

  return (
    <section className="cartao configurar-ia">
      <div className="configurar-ia__topo">
        <span className="configurar-ia__icone" aria-hidden>
          <IconeIA size={22} weight="fill" />
        </span>
        <div>
          <h2 style={{ margin: 0 }}>Configure tudo com IA</h2>
          <p className="texto-secundario" style={{ margin: '4px 0 0' }}>
            A IA lê as cores das suas logos e monta o kit inteiro: cores, fontes, legendas, textos, acabamento dos vídeos e os pedidos prontos para
            criar trilhas, sons, aberturas, imagens e vídeos. Você confere antes de usar.
          </p>
        </div>
      </div>

      {logos.length === 0 ? (
        <div className="configurar-ia__falta">
          <span>Primeiro, envie a logo principal: é dela que a IA tira as cores.</span>
          <button type="button" className="botao botao--primario botao--pequeno" onClick={onEnviarLogo}>
            Enviar a logo
          </button>
        </div>
      ) : (
        <div className="configurar-ia__campos">
          <label className="campo" style={{ margin: 0 }}>
            <span className="campo__rotulo">Nome da marca</span>
            <input className="campo__entrada" value={nome} maxLength={60} placeholder="Ex.: Padaria Sol" onChange={(e) => onNome(e.target.value)} />
          </label>
          <label className="campo" style={{ margin: 0 }}>
            <span className="campo__rotulo">O que a marca faz</span>
            <input
              className="campo__entrada"
              value={segmento}
              maxLength={120}
              placeholder="Ex.: clínica odontológica, loja de roupas"
              onChange={(e) => setSegmento(e.target.value)}
            />
          </label>
          <label className="campo configurar-ia__sobre" style={{ margin: 0 }}>
            <span className="campo__rotulo">
              Conte mais sobre a marca <span className="texto-secundario">(opcional)</span>
            </span>
            <textarea
              className="campo__entrada"
              rows={2}
              value={sobre}
              maxLength={800}
              placeholder="Para quem é, a personalidade, o que não pode faltar. Ex.: público jovem, divertida mas confiável, sempre falamos de sabor e de família."
              onChange={(e) => setSobre(e.target.value)}
            />
          </label>
          <button type="button" className="botao botao--primario configurar-ia__botao" disabled={carregando} onClick={() => void configurar()}>
            <IconeIA size={16} weight="fill" />
            {carregando ? 'Montando o kit… (até 1 min)' : 'Configurar com IA'}
          </button>
        </div>
      )}
      {erro && <p className="campo__erro">{erro}</p>}

      {sugestao && (
        <div className="configurar-ia__resultado" role="status">
          <h3>O kit sugerido para a sua marca</h3>
          {sugestao.aviso && <p className="campo__ajuda" style={{ color: 'var(--warning)', margin: 0 }}>{sugestao.aviso}</p>}
          <p className="configurar-ia__porque">
            <strong>{sugestao.tom}.</strong> {sugestao.justificativa}
          </p>
          <div className="configurar-ia__cores">
            {(Object.keys(NOME_DA_COR) as Array<keyof SugestaoDeMarca['cores']>).map((k) => (
              <span key={k} className="configurar-ia__cor">
                <span style={{ background: sugestao.cores[k] }} aria-hidden />
                {NOME_DA_COR[k]}
                <small>{sugestao.cores[k]}</small>
              </span>
            ))}
          </div>
          <ul className="configurar-ia__muda">
            <li>
              <IconeCheck size={14} /> Fontes: <strong>{sugestao.fonteTitulo}</strong> nos títulos e <strong>{sugestao.fonteCorpo}</strong> no resto
            </li>
            <li>
              <IconeCheck size={14} /> Legendas <strong>{rotulo(PRESETS_DE_LEGENDA, sugestao.captionPreset)}</strong> e textos na tela{' '}
              <strong>{rotulo(PRESETS_DE_TEXTO, sugestao.textoPreset)}</strong>
            </li>
            <li>
              <IconeCheck size={14} /> Logo no {POSICAO[sugestao.preferencias.logoPosicao]}, trilha em {sugestao.preferencias.volumeTrilhaDb} dB
              {sugestao.preferencias.autoZoom ? ', zoom automático' : ', sem zoom automático'}
              {sugestao.preferencias.efeitosSonoros ? ', efeitos sonoros' : ''}
            </li>
            <li>
              <IconeCheck size={14} /> Kit criativo: {sugestao.kit.trilhas.length} trilhas, {sugestao.kit.sons.length} sons,{' '}
              {[sugestao.kit.abertura, sugestao.kit.encerramento].filter(Boolean).length} vinhetas, {sugestao.kit.imagens.length} imagens e{' '}
              {sugestao.kit.videos.length} vídeos para criar
            </li>
          </ul>
          <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="botao botao--primario"
              onClick={() => {
                onAplicar(sugestao);
                setSugestao(null);
              }}
            >
              Usar este kit
            </button>
            <button type="button" className="botao botao--fantasma" onClick={() => setSugestao(null)}>
              Descartar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
