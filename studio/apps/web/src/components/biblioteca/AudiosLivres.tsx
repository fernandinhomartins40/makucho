'use client';

// ============================================================
// Música e efeitos sonoros grátis (Openverse: Jamendo e Freesound).
//
// A busca é sem IA: clima (música) ou palavras. ▶ toca direto do
// acervo; "Usar"/"Adicionar" traz o arquivo para o workspace, com a
// licença gravada. Quando a licença pede crédito (CC BY), o crédito sai
// pronto para copiar na legenda do post.
// ============================================================

import { useState } from 'react';
import type { ResultadoDeAudio, TipoDeAudioLivre } from '@makucho/studio-contracts';
import { CLIMAS_DE_MUSICA, creditoDoAudio } from '@makucho/studio-contracts';
import { bancoDeMidia, type Asset } from '../../lib/api';
import { tempo } from '../editor/funcoes';
import { IconeMais, IconePausar, IconeTocar } from '../icones';

interface Props {
  tipo: TipoDeAudioLivre;
  /** Ouvir: o mesmo tocador da aba (um som por vez). */
  previa: { tocando: string | null; tocar: (id: string, url: string) => void };
  /** O arquivo já está no workspace: usar como trilha ou pôr no cursor. */
  onUsar: (asset: Asset, r: ResultadoDeAudio) => void;
  rotuloDoBotao: string;
}

export function AudiosLivres({ tipo, previa, onUsar, rotuloDoBotao }: Props) {
  const [clima, setClima] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<ResultadoDeAudio[] | null>(null);
  const [pagina, setPagina] = useState(1);
  const [buscando, setBuscando] = useState(false);
  const [trazendo, setTrazendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [credito, setCredito] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const procurar = async (pedido: { q?: string; clima?: string }, pg = 1) => {
    setBuscando(true);
    setErro(null);
    try {
      const r = await bancoDeMidia.buscarAudio({ tipo, ...pedido, pagina: pg });
      setResultados((atuais) => (pg > 1 && atuais ? [...atuais, ...r.resultados.filter((x) => !atuais.some((y) => y.id === x.id))] : r.resultados));
      setPagina(pg);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'a busca falhou.');
    } finally {
      setBuscando(false);
    }
  };
  const pedidoAtual = () => ({ ...(busca.trim() ? { q: busca.trim() } : {}), ...(clima ? { clima } : {}) });

  const usar = async (r: ResultadoDeAudio) => {
    setTrazendo(r.id);
    setErro(null);
    setCopiado(false);
    try {
      const asset = await bancoDeMidia.importarAudio(r);
      onUsar(asset, r);
      setCredito(r.licenca.exigeCredito ? creditoDoAudio(r) : null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível trazer o áudio.');
    } finally {
      setTrazendo(null);
    }
  };

  const copiar = async () => {
    if (!credito) return;
    await navigator.clipboard?.writeText(credito).catch(() => undefined);
    setCopiado(true);
  };

  return (
    <div className="audios-livres">
      <span className="campo__rotulo" style={{ display: 'block', marginTop: 'var(--e3)' }}>
        {tipo === 'musica' ? 'Músicas grátis' : 'Mais sons grátis'}
      </span>
      <p className="campo__ajuda">
        {tipo === 'musica' ? 'Do Jamendo, com licença livre para vídeo comercial.' : 'Do Freesound, com licença livre para vídeo comercial.'} Toque ▶ para ouvir antes.
      </p>
      {tipo === 'musica' && (
        <div className="biblioteca__chips" role="radiogroup" aria-label="Clima da música">
          {CLIMAS_DE_MUSICA.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={clima === c.id}
              className="biblioteca__chip"
              title={c.quando}
              onClick={() => {
                setClima(c.id);
                void procurar({ clima: c.id, ...(busca.trim() ? { q: busca.trim() } : {}) });
              }}
            >
              {c.rotulo}
            </button>
          ))}
        </div>
      )}
      <form
        className="linha audios-livres__busca"
        onSubmit={(e) => {
          e.preventDefault();
          if (busca.trim() || clima) void procurar(pedidoAtual());
        }}
      >
        <input
          className="campo__entrada crescer"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={tipo === 'musica' ? 'Ex.: violão, verão, rock' : 'Ex.: aplausos, caixa registradora, whoosh'}
          aria-label={tipo === 'musica' ? 'Buscar música' : 'Buscar som'}
        />
        <button type="submit" className="botao botao--secundario botao--pequeno" disabled={buscando || (!busca.trim() && !clima)}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {erro && <p className="campo__erro">{erro}</p>}
      {credito && (
        <div className="audios-livres__credito" role="status">
          <span>Esta licença pede crédito. Cole na legenda do post:</span>
          <code>{credito}</code>
          <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => void copiar()}>
            {copiado ? 'Copiado' : 'Copiar crédito'}
          </button>
        </div>
      )}
      {resultados &&
        (resultados.length === 0 ? (
          <p className="texto-secundario">Nada encontrado. Tente outro clima ou outras palavras.</p>
        ) : (
          <ul className="lista-de-sons">
            {resultados.map((r) => (
              <li key={r.id} className="som">
                <button
                  type="button"
                  className="botao-icone som__play"
                  aria-label={previa.tocando === `ov-${r.id}` ? `Parar ${r.titulo}` : `Ouvir ${r.titulo}`}
                  onClick={() => previa.tocar(`ov-${r.id}`, r.previa)}
                >
                  {previa.tocando === `ov-${r.id}` ? <IconePausar size={16} weight="fill" /> : <IconeTocar size={16} weight="fill" />}
                </button>
                <span className="som__texto">
                  <strong title={r.titulo}>{r.titulo}</strong>
                  <span>
                    {[r.autor, r.duracaoMs ? tempo(r.duracaoMs) : null, tipo === 'musica' && !r.instrumental ? 'com voz' : null, r.licenca.nome].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button type="button" className="botao botao--secundario botao--pequeno" disabled={trazendo !== null} onClick={() => void usar(r)}>
                  {trazendo === r.id ? 'Trazendo…' : (
                    <>
                      <IconeMais size={14} /> {rotuloDoBotao}
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ))}
      {resultados && resultados.length > 0 && (
        <button type="button" className="botao botao--fantasma botao--pequeno" disabled={buscando} onClick={() => void procurar(pedidoAtual(), pagina + 1)}>
          {buscando ? 'Buscando…' : 'Mais resultados'}
        </button>
      )}
    </div>
  );
}
