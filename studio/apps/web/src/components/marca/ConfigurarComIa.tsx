'use client';

// ============================================================
// "Configurar com IA": das logos ao kit inteiro num clique.
//
// As cores são medidas nos pixels das logos, aqui no navegador
// (lib/paleta.ts); a IA recebe essa paleta e decide o resto -- que cor
// é a principal, fontes, estilo das legendas e dos textos. Nada é
// salvo sozinho: a sugestão aparece, a pessoa usa ou descarta.
// ============================================================

import { useState } from 'react';
import type { SugestaoDeMarca } from '@makucho/studio-contracts';
import { PACOTES_DE_ESTILO, PRESETS_DE_LEGENDA, PRESETS_DE_TEXTO } from '@makucho/studio-contracts';
import { assets as apiAssets, marca as apiMarca, type Asset } from '../../lib/api';
import { medirLogos } from '../../lib/paleta';
import { IconeIA } from '../icones';

interface Props {
  /** As logos enviadas (qualquer variação). */
  logos: readonly Asset[];
  nome: string;
  onNome: (nome: string) => void;
  onAplicar: (s: SugestaoDeMarca) => void;
}

const NOME_DA_COR: Record<keyof SugestaoDeMarca['cores'], string> = {
  primary: 'Primária',
  secondary: 'Secundária',
  textDark: 'Fundo',
  accent: 'Superfície',
  textLight: 'Texto',
};

export function ConfigurarComIa({ logos, nome, onNome, onAplicar }: Props) {
  const [segmento, setSegmento] = useState('');
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
          <h2 style={{ margin: 0 }}>Configurar com IA</h2>
          <p className="texto-secundario" style={{ margin: '4px 0 0' }}>
            A IA lê as cores das suas logos e monta o kit inteiro: cores, fontes, estilo das legendas e dos textos. Você confere antes de usar.
          </p>
        </div>
      </div>

      <div className="configurar-ia__campos">
        <div className="campo" style={{ margin: 0 }}>
          <label className="campo__rotulo" htmlFor="nome-marca">
            Nome da marca
          </label>
          <input id="nome-marca" className="campo__entrada" value={nome} maxLength={60} placeholder="Ex.: Padaria Sol" onChange={(e) => onNome(e.target.value)} />
        </div>
        <div className="campo" style={{ margin: 0 }}>
          <label className="campo__rotulo" htmlFor="segmento-marca">
            O que a marca faz <span className="texto-secundario">(opcional)</span>
          </label>
          <input
            id="segmento-marca"
            className="campo__entrada"
            value={segmento}
            maxLength={120}
            placeholder="Ex.: clínica odontológica, loja de roupas"
            onChange={(e) => setSegmento(e.target.value)}
          />
        </div>
        <button type="button" className="botao botao--primario" disabled={carregando || logos.length === 0} onClick={() => void configurar()}>
          <IconeIA size={16} weight="fill" />
          {carregando ? 'Analisando as logos…' : 'Configurar com IA'}
        </button>
      </div>
      {logos.length === 0 && <p className="campo__ajuda">Envie ao menos a logo principal (logo abaixo) para a IA ler as cores.</p>}
      {erro && <p className="campo__erro">{erro}</p>}

      {sugestao && (
        <div className="configurar-ia__resultado" role="status">
          {sugestao.aviso && <p className="campo__ajuda" style={{ color: 'var(--warning)', margin: 0 }}>{sugestao.aviso}</p>}
          <div className="configurar-ia__cores">
            {(Object.keys(NOME_DA_COR) as Array<keyof SugestaoDeMarca['cores']>).map((k) => (
              <span key={k} className="configurar-ia__cor">
                <span style={{ background: sugestao.cores[k] }} aria-hidden />
                {NOME_DA_COR[k]}
                <small>{sugestao.cores[k]}</small>
              </span>
            ))}
          </div>
          <dl className="configurar-ia__escolhas">
            <dt>Fontes</dt>
            <dd>
              <span style={{ fontFamily: `${sugestao.fonteTitulo}, sans-serif`, fontWeight: 800 }}>{sugestao.fonteTitulo}</span> nos títulos,{' '}
              <span style={{ fontFamily: `${sugestao.fonteCorpo}, sans-serif` }}>{sugestao.fonteCorpo}</span> no resto
            </dd>
            <dt>Legendas</dt>
            <dd>{rotulo(PRESETS_DE_LEGENDA, sugestao.captionPreset)}</dd>
            <dt>Textos na tela</dt>
            <dd>{rotulo(PRESETS_DE_TEXTO, sugestao.textoPreset)}</dd>
            {sugestao.pacote && (
              <>
                <dt>Estilo sugerido</dt>
                <dd>{rotulo(PACOTES_DE_ESTILO, sugestao.pacote)}</dd>
              </>
            )}
            <dt>Personalidade</dt>
            <dd>{sugestao.tom}</dd>
          </dl>
          <p className="configurar-ia__porque">{sugestao.justificativa}</p>
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
