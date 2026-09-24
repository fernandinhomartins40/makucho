'use client';

// ============================================================
// Folha que sobe do rodapé (bottom sheet), como nos apps nativos.
//
// No celular, painéis laterais não cabem: menus, ferramentas do
// editor e propriedades sobem de baixo, ao alcance do polegar, e
// fecham tocando fora, no X, arrastando para baixo ou com Esc.
// ============================================================

import { useEffect, useRef } from 'react';
import { IconeFechar } from '../icones';

interface Props {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  children: React.ReactNode;
  /** Altura máxima, em % da tela. */
  altura?: number;
}

export function Folha({ aberta, aoFechar, titulo, children, altura = 85 }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const inicio = useRef<number | null>(null);

  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', tecla);
    // O fundo não rola junto enquanto a folha está aberta.
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    caixa.current?.focus();
    return () => {
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = antes;
    };
  }, [aberta, aoFechar]);

  if (!aberta) return null;

  // Arrastar a alça para baixo fecha, como no iOS e no Android.
  const aoTocar = (e: React.TouchEvent) => {
    inicio.current = e.touches[0]?.clientY ?? null;
  };
  const aoMover = (e: React.TouchEvent) => {
    if (inicio.current === null || !caixa.current) return;
    const d = Math.max(0, (e.touches[0]?.clientY ?? 0) - inicio.current);
    caixa.current.style.transform = `translateY(${d}px)`;
  };
  const aoSoltar = (e: React.TouchEvent) => {
    if (inicio.current === null || !caixa.current) return;
    const d = (e.changedTouches[0]?.clientY ?? 0) - inicio.current;
    inicio.current = null;
    caixa.current.style.transform = '';
    if (d > 90) aoFechar();
  };

  return (
    <div className="folha" onClick={aoFechar}>
      <div
        ref={caixa}
        className="folha__caixa"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        style={{ maxHeight: `${altura}dvh` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="folha__alca" onTouchStart={aoTocar} onTouchMove={aoMover} onTouchEnd={aoSoltar}>
          <span aria-hidden className="folha__puxador" />
          <div className="linha entre" style={{ width: '100%' }}>
            <h2 style={{ fontSize: 17 }}>{titulo}</h2>
            <button type="button" className="botao-icone" aria-label="Fechar" onClick={aoFechar}>
              <IconeFechar size={20} />
            </button>
          </div>
        </div>
        <div className="folha__corpo">{children}</div>
      </div>
    </div>
  );
}
