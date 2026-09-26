'use client';

// ============================================================
// Gravar narração por cima do vídeo.
//
// Uma barra compacta embaixo (o vídeo continua à vista): contagem de
// 3 s, e então a prévia toca SEM SOM a partir do cursor enquanto a
// pessoa fala -- ela narra vendo a cena. Parou: ouve, grava de novo ou
// usa. Usar envia o WAV (gravadorDeNarracao.ts) e põe a narração na
// faixa Narração, no ponto em que a gravação começou.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { assets as apiAssets } from '../../lib/api';
import { comecarGravacao, podeGravar, type Gravacao } from '../../lib/gravadorDeNarracao';
import { tempo } from './funcoes';
import { IconeMicrofone, IconeFechar, IconeCheck } from '../icones';

type Estado = 'pronto' | 'contagem' | 'gravando' | 'processando' | 'revisar' | 'enviando';

interface Props {
  /** Onde a narração começa (o cursor quando a barra abriu). */
  inicioMs: number;
  /** A prévia toca muda enquanto grava (null = parar). */
  onGravando: (inicioMs: number | null) => void;
  /** Enviada: o editor põe na faixa. */
  onPronta: (assetId: string, duracaoMs: number, inicioMs: number) => void;
  onFechar: () => void;
}

export function GravadorDeNarracao({ inicioMs, onGravando, onPronta, onFechar }: Props) {
  const [estado, setEstado] = useState<Estado>('pronto');
  const [contagem, setContagem] = useState(3);
  const [decorrido, setDecorrido] = useState(0);
  const [nivel, setNivel] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ arquivo: File; duracaoMs: number; url: string } | null>(null);
  const gravacao = useRef<Gravacao | null>(null);
  const comecouEm = useRef(0);

  // Solta o microfone e a prévia se a barra fechar no meio.
  useEffect(
    () => () => {
      gravacao.current?.cancelar();
      onGravando(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => () => void (resultado && URL.revokeObjectURL(resultado.url)), [resultado]);

  // Relógio e medidor enquanto grava.
  useEffect(() => {
    if (estado !== 'gravando') return;
    let quadro = 0;
    const passo = () => {
      setDecorrido(Date.now() - comecouEm.current);
      setNivel(gravacao.current?.nivel() ?? 0);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [estado]);

  const gravar = async () => {
    setErro(null);
    try {
      // Pede o microfone ANTES da contagem: a permissão não come o 3-2-1.
      gravacao.current = await comecarGravacao();
    } catch {
      setErro('Não foi possível usar o microfone. Libere o acesso nas permissões do navegador e tente de novo.');
      return;
    }
    gravacao.current.cancelar();
    setEstado('contagem');
    for (let n = 3; n >= 1; n--) {
      setContagem(n);
      await new Promise((ok) => setTimeout(ok, 800));
    }
    try {
      gravacao.current = await comecarGravacao();
    } catch {
      setEstado('pronto');
      setErro('O microfone parou de responder. Tente de novo.');
      return;
    }
    comecouEm.current = Date.now();
    setDecorrido(0);
    setEstado('gravando');
    onGravando(inicioMs);
  };

  const parar = async () => {
    onGravando(null);
    setEstado('processando');
    try {
      const r = await gravacao.current!.parar();
      gravacao.current = null;
      if (r.duracaoMs < 300) {
        setEstado('pronto');
        setErro('A gravação ficou curta demais. Toque em gravar e fale por pelo menos meio segundo.');
        return;
      }
      setResultado({ ...r, url: URL.createObjectURL(r.arquivo) });
      setEstado('revisar');
    } catch (e) {
      setEstado('pronto');
      setErro(e instanceof Error ? e.message : 'não foi possível ler a gravação');
    }
  };

  const usar = async () => {
    if (!resultado) return;
    setEstado('enviando');
    setErro(null);
    try {
      const { id } = await apiAssets.enviar('VOICEOVER', resultado.arquivo, resultado.duracaoMs);
      onPronta(id, resultado.duracaoMs, inicioMs);
    } catch (e) {
      setEstado('revisar');
      setErro(e instanceof Error ? e.message : 'não foi possível salvar a narração');
    }
  };

  const regravar = () => {
    setResultado(null);
    setEstado('pronto');
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="gravador-narracao" role="dialog" aria-label="Gravar narração" data-estado={estado}>
      <div className="gravador-narracao__topo">
        <span className="gravador-narracao__icone" aria-hidden>
          <IconeMicrofone size={18} weight="fill" />
        </span>
        <div className="crescer">
          <strong>Narração</strong>
          <span>
            {estado === 'gravando'
              ? `Gravando · ${tempo(decorrido)} · o vídeo toca sem som a partir de ${tempo(inicioMs)}`
              : estado === 'revisar' || estado === 'enviando'
                ? `Ouça antes de usar · ${tempo(resultado?.duracaoMs ?? 0)}`
                : `Começa em ${tempo(inicioMs)} (onde está o cursor). Use fone para o som do vídeo não vazar.`}
          </span>
        </div>
        <button type="button" className="botao-icone" aria-label="Fechar" onClick={onFechar} disabled={estado === 'enviando'}>
          <IconeFechar size={18} />
        </button>
      </div>

      {erro && (
        <p className="campo__erro" role="alert" style={{ margin: 0 }}>
          {erro}
        </p>
      )}

      {estado === 'pronto' && (
        <button type="button" className="gravador-narracao__gravar" onClick={() => void gravar()} disabled={!podeGravar()}>
          <span aria-hidden />
          {podeGravar() ? 'Gravar' : 'Este navegador não grava áudio'}
        </button>
      )}

      {estado === 'contagem' && (
        <div className="gravador-narracao__contagem" aria-live="assertive">
          {contagem}
        </div>
      )}

      {estado === 'gravando' && (
        <div className="gravador-narracao__ao-vivo">
          <span className="gravador-narracao__nivel" aria-hidden>
            <i style={{ transform: `scaleX(${Math.max(0.04, nivel)})` }} />
          </span>
          <button type="button" className="gravador-narracao__parar" onClick={() => void parar()}>
            <span aria-hidden /> Parar
          </button>
        </div>
      )}

      {estado === 'processando' && <p className="texto-secundario" style={{ margin: 0 }}>Preparando a gravação…</p>}

      {(estado === 'revisar' || estado === 'enviando') && resultado && (
        <div className="gravador-narracao__revisar">
          <audio src={resultado.url} controls preload="auto" />
          <div className="linha" style={{ gap: 'var(--e2)' }}>
            <button type="button" className="botao botao--fantasma botao--pequeno" onClick={regravar} disabled={estado === 'enviando'}>
              Gravar de novo
            </button>
            <button type="button" className="botao botao--primario botao--pequeno crescer" onClick={() => void usar()} disabled={estado === 'enviando'}>
              <IconeCheck size={15} /> {estado === 'enviando' ? 'Salvando…' : 'Usar narração'}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
