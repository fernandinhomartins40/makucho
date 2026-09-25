'use client';

// ============================================================
// Divisor entre a prévia e a timeline, arrastável.
//
// Nenhuma proporção fixa serve a toda tela: num notebook com 600 px
// úteis quem corta quer timeline; quem confere o enquadramento quer o
// vídeo grande. Como nos editores de vídeo de mesa, a pessoa arrasta a
// divisa e a escolha fica guardada. Duplo clique volta ao automático.
//
// A altura vai numa variável CSS do próprio `.editor` (sem re-render do
// editor a cada pixel arrastado); o CSS só a usa no computador -- no
// celular a timeline tem layout próprio.
// ============================================================

import { useCallback, useEffect, useRef, type RefObject } from 'react';

const CHAVE = 'studio:altura-timeline';
const MINIMO = 120;
/** O que sobra para a prévia, no mínimo. */
const PALCO_MINIMO = 180;

interface Props {
  editorRef: RefObject<HTMLDivElement | null>;
}

export function DivisorDaTimeline({ editorRef }: Props) {
  const inicio = useRef<{ y: number; altura: number } | null>(null);

  /** Limita ao que cabe na tela de agora e aplica. */
  const aplicar = useCallback(
    (altura: number | null, guardar = true) => {
      const editor = editorRef.current;
      if (!editor) return;
      if (altura === null) {
        editor.style.removeProperty('--altura-timeline');
        delete editor.dataset.timelineManual;
        if (guardar) {
          try {
            localStorage.removeItem(CHAVE);
          } catch {
            // Sem armazenamento, vale só nesta aba.
          }
        }
        return;
      }
      const maximo = Math.max(MINIMO, editor.clientHeight - PALCO_MINIMO);
      const px = Math.round(Math.min(maximo, Math.max(MINIMO, altura)));
      editor.style.setProperty('--altura-timeline', `${px}px`);
      editor.dataset.timelineManual = '';
      if (guardar) {
        try {
          localStorage.setItem(CHAVE, String(px));
        } catch {
          // Sem armazenamento, vale só nesta aba.
        }
      }
    },
    [editorRef],
  );

  // A escolha salva volta, e é refeita quando a janela muda de tamanho
  // (a mesma altura pode não caber numa janela menor).
  useEffect(() => {
    const salva = () => {
      try {
        const v = Number(localStorage.getItem(CHAVE));
        return Number.isFinite(v) && v > 0 ? v : null;
      } catch {
        return null;
      }
    };
    const refazer = () => {
      const v = salva();
      if (v) aplicar(v, false);
    };
    refazer();
    window.addEventListener('resize', refazer);
    return () => window.removeEventListener('resize', refazer);
  }, [aplicar]);

  const alturaAtual = () => editorRef.current?.querySelector<HTMLElement>('.editor__timeline')?.getBoundingClientRect().height ?? 240;

  return (
    <div
      className="divisor-da-timeline"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Arraste para dividir a tela entre o vídeo e a linha do tempo. Duplo clique volta ao automático."
      title="Arraste para aumentar a linha do tempo ou o vídeo. Duplo clique: automático."
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        inicio.current = { y: e.clientY, altura: alturaAtual() };
        document.body.dataset.redimensionando = '';
      }}
      onPointerMove={(e) => {
        if (!inicio.current) return;
        // Subir a divisa aumenta a timeline.
        aplicar(inicio.current.altura + (inicio.current.y - e.clientY));
      }}
      onPointerUp={() => {
        inicio.current = null;
        delete document.body.dataset.redimensionando;
      }}
      onPointerCancel={() => {
        inicio.current = null;
        delete document.body.dataset.redimensionando;
      }}
      onDoubleClick={() => aplicar(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') aplicar(alturaAtual() + 24);
        else if (e.key === 'ArrowDown') aplicar(alturaAtual() - 24);
        else if (e.key === 'Home') aplicar(null);
        else return;
        e.preventDefault();
      }}
    >
      <span className="divisor-da-timeline__pega" aria-hidden />
    </div>
  );
}
