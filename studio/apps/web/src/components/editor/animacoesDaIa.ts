'use client';

// ============================================================
// As ações da IA sobre as animações (HyperFrames), para o painel da
// animação chegar a elas sem passar props por quatro componentes:
// refazer uma, várias ou todas -- em outro estilo, outro lugar ou com
// um pedido. O trabalho roda no servidor; o editor acompanha pela nota.
// ============================================================

import { createContext, useContext } from 'react';

export interface OpcoesDeRefazerAnimacao {
  estilo?: string;
  layout?: 'meio_a_meio' | 'cartao' | 'tela_cheia';
  lado?: 'cima' | 'baixo';
  pedido?: string;
}

export interface AnimacoesDaIa {
  /** A IA está criando ou refazendo animações agora. */
  trabalhando: boolean;
  refazer: (camadas: string[] | 'todas', o: OpcoesDeRefazerAnimacao) => void;
}

export const AnimacoesDaIaContexto = createContext<AnimacoesDaIa | null>(null);

export function useAnimacoesDaIa(): AnimacoesDaIa | null {
  return useContext(AnimacoesDaIaContexto);
}
