'use client';

// ============================================================
// Carregamento de dados com os quatro estados reais.
//
// Toda tela que busca dados tem quatro desfechos: carregando, erro,
// vazio e cheio. Escrever os quatro à mão em cada tela leva a
// esquecer o erro — que é justamente o que o usuário mais precisa ver
// quando acontece.
//
// Não é um substituto de React Query: é o mínimo que evita que cada
// tela invente o seu.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { ErroDaApi } from './api';

interface Estado<T> {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
}

export function useDados<T>(
  buscar: () => Promise<T>,
  dependencias: unknown[] = [],
): Estado<T> & { recarregar: () => void; definir: (dados: T) => void } {
  const [estado, setEstado] = useState<Estado<T>>({
    dados: null,
    carregando: true,
    erro: null,
  });

  // A função muda a cada render; guardá-la numa ref evita que o efeito
  // dispare em loop sem obrigar quem chama a memoizar.
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;

  const [gatilho, setGatilho] = useState(0);

  useEffect(() => {
    let cancelado = false;
    const controle = new AbortController();

    setEstado((atual) => ({ ...atual, carregando: true, erro: null }));

    buscarRef
      .current()
      .then((dados) => {
        if (!cancelado) setEstado({ dados, carregando: false, erro: null });
      })
      .catch((e: unknown) => {
        if (cancelado) return;

        // AbortError não é falha: a tela saiu antes da resposta.
        if (e instanceof DOMException && e.name === 'AbortError') return;

        const erro =
          e instanceof ErroDaApi
            ? e.message
            : 'não foi possível carregar. Verifique sua conexão.';

        setEstado({ dados: null, carregando: false, erro });
      });

    return () => {
      cancelado = true;
      controle.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatilho, ...dependencias]);

  const recarregar = useCallback(() => setGatilho((g) => g + 1), []);

  // Atualização otimista: a tela já sabe o resultado de uma ação e não
  // precisa esperar o servidor confirmar para mostrar.
  const definir = useCallback(
    (dados: T) => setEstado({ dados, carregando: false, erro: null }),
    [],
  );

  return { ...estado, recarregar, definir };
}
