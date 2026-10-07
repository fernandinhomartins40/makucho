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
  /** "clima:indice"; "" volta às cores do estilo. */
  paleta?: string;
  layout?: 'meio_a_meio' | 'cartao' | 'tela_cheia' | 'pip';
  lado?: 'cima' | 'baixo';
  canto?: 'sup-esq' | 'sup-dir' | 'inf-esq' | 'inf-dir';
  pedido?: string;
  /** A cena editada à mão: modelo, textos, elemento, atrás/na frente e o ajuste. */
  cena?: { preset?: string; textos?: Record<string, unknown>; atras?: boolean; ajuste?: { x: number; y: number; escala: number } };
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
