'use client';

// ============================================================
// Paineis redimensionaveis.
//
// Estrutura inspirada no OpenCut (MIT), que usa react-resizable-panels
// com um grupo vertical (conteudo | timeline) e, dentro dele, um
// horizontal (ferramentas | preview | propriedades).
//
// Implementacao propria e nao a biblioteca: sao ~120 linhas contra
// uma dependencia a mais, e o comportamento que precisamos e o
// basico -- arrastar a divisa e lembrar o tamanho.
//
// Os tamanhos ficam em localStorage: quem ajusta o painel uma vez
// nao quer refazer isso a cada visita.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  direcao: 'horizontal' | 'vertical';
  /** Percentuais iniciais, um por filho. Devem somar 100. */
  tamanhosIniciais: number[];
  /** Percentual minimo de cada painel. */
  minimos?: number[];
  /** Chave do localStorage. Sem ela, o tamanho nao e lembrado. */
  id?: string;
  children: React.ReactNode[];
}

export function PainelRedimensionavel({
  direcao,
  tamanhosIniciais,
  minimos,
  id,
  children,
}: Props) {
  const [tamanhos, setTamanhos] = useState(tamanhosIniciais);
  const containerRef = useRef<HTMLDivElement>(null);
  const arrasteRef = useRef<{ indice: number; posInicial: number; tamanhos: number[] } | null>(
    null,
  );

  // Restaura na montagem, nao no estado inicial: ler localStorage
  // durante a renderizacao do servidor quebraria a hidratacao.
  useEffect(() => {
    if (!id) return;
    try {
      const salvo = localStorage.getItem(`painel:${id}`);
      if (!salvo) return;
      const valores = JSON.parse(salvo) as number[];
      if (valores.length === tamanhosIniciais.length) setTamanhos(valores);
    } catch {
      // localStorage pode falhar em aba anonima ou com cookies
      // bloqueados. O layout padrao e suficiente.
    }
  }, [id, tamanhosIniciais.length]);

  const aoMover = useCallback(
    (e: PointerEvent) => {
      const arraste = arrasteRef.current;
      const container = containerRef.current;
      if (!arraste || !container) return;

      const caixa = container.getBoundingClientRect();
      const total = direcao === 'horizontal' ? caixa.width : caixa.height;
      const atual = direcao === 'horizontal' ? e.clientX : e.clientY;

      // Converte o deslocamento em pixels para percentual do
      // container: assim o layout acompanha qualquer largura de tela.
      const deltaPct = ((atual - arraste.posInicial) / total) * 100;

      const novos = [...arraste.tamanhos];
      const i = arraste.indice;
      const minA = minimos?.[i] ?? 10;
      const minB = minimos?.[i + 1] ?? 10;

      const a = (novos[i] ?? 0) + deltaPct;
      const b = (novos[i + 1] ?? 0) - deltaPct;

      // O painel vizinho cede o espaco: sem o limite, um deles
      // sumiria e nao haveria como traze-lo de volta.
      if (a < minA || b < minB) return;

      novos[i] = a;
      novos[i + 1] = b;
      setTamanhos(novos);
    },
    [direcao, minimos],
  );

  const aoSoltar = useCallback(() => {
    arrasteRef.current = null;
    document.removeEventListener('pointermove', aoMover);
    document.removeEventListener('pointerup', aoSoltar);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (id) {
      try {
        localStorage.setItem(`painel:${id}`, JSON.stringify(tamanhos));
      } catch {
        // Sem persistencia: o layout volta ao padrao na proxima visita.
      }
    }
  }, [aoMover, id, tamanhos]);

  const iniciarArraste = (indice: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    arrasteRef.current = {
      indice,
      posInicial: direcao === 'horizontal' ? e.clientX : e.clientY,
      tamanhos: [...tamanhos],
    };

    document.addEventListener('pointermove', aoMover);
    document.addEventListener('pointerup', aoSoltar);
    // O cursor fica no body enquanto arrasta: sem isso ele volta ao
    // normal assim que o ponteiro sai da divisa de 5px.
    document.body.style.cursor = direcao === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: direcao === 'horizontal' ? 'row' : 'column',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
      }}
    >
      {children.map((filho, i) => (
        <div key={i} style={{ display: 'contents' }}>
          <div
            style={{
              flexBasis: `${tamanhos[i] ?? 0}%`,
              flexGrow: 0,
              flexShrink: 0,
              // min-0 nos dois eixos: sem isso um filho com conteudo
              // largo empurra o flex e estoura o container.
              minWidth: 0,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {filho}
          </div>

          {i < children.length - 1 && (
            <div
              role="separator"
              aria-orientation={direcao === 'horizontal' ? 'vertical' : 'horizontal'}
              tabIndex={0}
              onPointerDown={iniciarArraste(i)}
              onKeyDown={(e) => {
                // Teclado tambem redimensiona: quem nao usa mouse
                // ficaria preso no layout padrao.
                const passo = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -5 : 5;
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
                e.preventDefault();

                const novos = [...tamanhos];
                const a = (novos[i] ?? 0) + passo;
                const b = (novos[i + 1] ?? 0) - passo;
                if (a < (minimos?.[i] ?? 10) || b < (minimos?.[i + 1] ?? 10)) return;
                novos[i] = a;
                novos[i + 1] = b;
                setTamanhos(novos);
              }}
              style={{
                flexShrink: 0,
                width: direcao === 'horizontal' ? 5 : '100%',
                height: direcao === 'horizontal' ? '100%' : 5,
                background: 'var(--borda)',
                cursor: direcao === 'horizontal' ? 'col-resize' : 'row-resize',
                touchAction: 'none',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
