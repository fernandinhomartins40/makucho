'use client';

// ============================================================
// Teleprompter de verdade: o roteiro inteiro, corrido, subindo sozinho.
//
// Antes o texto aparecia um bloco por vez, e a pessoa tinha de clicar
// em abas no meio da fala. Agora:
//
//   - todos os blocos num texto só, com o nome do momento em cima de
//     cada um (pequeno, para não ser lido em voz alta);
//   - rola sozinho no ritmo de fala (2,5 palavras por segundo, como a
//     estimativa do roteiro), com a velocidade ajustável;
//   - uma LINHA DE LEITURA fixa no alto (perto da lente): o texto que
//     passa por ela é o que se fala agora;
//   - a roda do mouse, o arraste e as setas ajustam a posição sem parar
//     a rolagem -- quem se adiantou ou atrasou só corrige;
//   - espelhado, para teleprompter com vidro.
//
// A posição anda por quadro (requestAnimationFrame) e é aplicada direto
// no estilo, sem re-render do React a cada pixel.
// ============================================================

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

export interface BlocoDoTeleprompter {
  rotulo: string;
  texto: string;
}

export interface ControleDoTeleprompter {
  /** Volta ao começo do texto. */
  reiniciar: () => void;
  /** Anda (ou volta) um trecho: `direcao` 1 desce, -1 sobe. */
  empurrar: (direcao: 1 | -1) => void;
}

interface Props {
  blocos: readonly BlocoDoTeleprompter[];
  rolando: boolean;
  /** Multiplicador sobre o ritmo de fala (1 = 150 palavras por minuto). */
  velocidade: number;
  tamanho: number;
  espelhado?: boolean;
  /** Onde fica a linha de leitura, de 0 (topo) a 1 (pé). */
  linha?: number;
  /** Avisa o bloco que está na linha de leitura e o progresso (0 a 1). */
  onProgresso?: (bloco: number, fracao: number) => void;
  /** Chegou ao fim do texto. */
  onFim?: () => void;
  className?: string;
}

const PALAVRAS_POR_SEGUNDO = 2.5;

export const Teleprompter = forwardRef<ControleDoTeleprompter, Props>(function Teleprompter(
  { blocos, rolando, velocidade, tamanho, espelhado = false, linha = 0.28, onProgresso, onFim, className },
  ref,
) {
  const caixa = useRef<HTMLDivElement>(null);
  const texto = useRef<HTMLDivElement>(null);
  const deslocamento = useRef(0);
  const palavras = useMemo(() => blocos.reduce((t, b) => t + b.texto.trim().split(/\s+/).filter(Boolean).length, 0), [blocos]);

  /** O quanto o texto pode subir: até a última linha passar pela linha de leitura. */
  const limite = useCallback(() => {
    const c = caixa.current;
    const t = texto.current;
    if (!c || !t) return 0;
    return Math.max(0, t.scrollHeight - c.clientHeight * linha - tamanho * 1.6);
  }, [linha, tamanho]);

  const aplicar = useCallback(() => {
    const t = texto.current;
    const c = caixa.current;
    if (!t || !c) return;
    const max = limite();
    deslocamento.current = Math.min(max, Math.max(0, deslocamento.current));
    t.style.transform = `translateY(${c.clientHeight * linha - deslocamento.current}px)`;
    if (onProgresso) {
      // O bloco que está na linha de leitura.
      const alvo = deslocamento.current + 2;
      const filhos = [...t.querySelectorAll<HTMLElement>('[data-bloco]')];
      let atual = 0;
      for (const f of filhos) if (f.offsetTop <= alvo) atual = Number(f.dataset.bloco);
      onProgresso(atual, max ? deslocamento.current / max : 1);
    }
  }, [limite, linha, onProgresso]);

  useImperativeHandle(ref, () => ({
    reiniciar: () => {
      deslocamento.current = 0;
      aplicar();
    },
    empurrar: (direcao) => {
      deslocamento.current += direcao * tamanho * 3;
      aplicar();
    },
  }));

  // ---------- Rolagem no ritmo de fala ----------
  useEffect(() => {
    if (!rolando) return;
    let anterior = performance.now();
    let quadro = 0;
    let avisouFim = false;
    const passo = (agora: number) => {
      const dt = Math.min(0.1, (agora - anterior) / 1000);
      anterior = agora;
      const max = limite();
      const segundosDeFala = Math.max(5, palavras / PALAVRAS_POR_SEGUNDO);
      deslocamento.current += (max / segundosDeFala) * velocidade * dt;
      aplicar();
      if (deslocamento.current >= max && !avisouFim) {
        avisouFim = true;
        onFim?.();
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [rolando, velocidade, palavras, limite, aplicar, onFim]);

  // Tamanho da letra ou da caixa mudou: reposiciona.
  useEffect(() => {
    aplicar();
    const c = caixa.current;
    if (!c) return;
    const obs = new ResizeObserver(() => aplicar());
    obs.observe(c);
    return () => obs.disconnect();
  }, [aplicar, tamanho, blocos]);

  // ---------- Ajuste manual: roda do mouse e arraste ----------
  const arraste = useRef<{ y: number; d: number } | null>(null);

  return (
    <div
      ref={caixa}
      className={`teleprompter ${className ?? ''}`}
      data-espelhado={espelhado || undefined}
      style={{ ['--linha-de-leitura' as string]: `${linha * 100}%` }}
      onWheel={(e) => {
        deslocamento.current += e.deltaY * 0.6;
        aplicar();
      }}
      onPointerDown={(e) => {
        arraste.current = { y: e.clientY, d: deslocamento.current };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!arraste.current) return;
        deslocamento.current = arraste.current.d - (e.clientY - arraste.current.y);
        aplicar();
      }}
      onPointerUp={() => (arraste.current = null)}
      onPointerCancel={() => (arraste.current = null)}
    >
      <span className="teleprompter__linha" aria-hidden />
      <div ref={texto} className="teleprompter__texto" style={{ fontSize: tamanho }}>
        {blocos.map((b, i) => (
          <section key={i} data-bloco={i} className="teleprompter__bloco">
            <span className="teleprompter__rotulo">{b.rotulo}</span>
            <p>{b.texto}</p>
          </section>
        ))}
        <p className="teleprompter__fim">— fim —</p>
      </div>
    </div>
  );
});
