'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';

/**
 * Registra a leitura do artigo (secao 41).
 *
 * Nao desenha nada: existe so pelo efeito. Dispara uma vez por montagem
 * e ignora falhas — a deduplicacao por sessao acontece no servidor, e
 * metrica quebrada nao pode atrapalhar quem esta lendo.
 */
export function ContadorDeLeitura({ postId }: { postId: string }) {
  useEffect(() => {
    // Pequeno atraso: quem abre e fecha em seguida nao conta como leitura.
    const timer = setTimeout(() => {
      void api.registrarLeitura(postId);
    }, 3000);

    return () => clearTimeout(timer);
  }, [postId]);

  return null;
}
