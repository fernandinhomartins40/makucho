'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser } from '@makucho/types';
import { painel } from '@/lib/painel';

interface Contexto {
  usuario: AuthUser | null;
  carregando: boolean;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
}

const SessaoContexto = createContext<Contexto | null>(null);

/**
 * Sessao do painel.
 *
 * Quem manda e o cookie HttpOnly: aqui guardamos apenas o perfil para
 * desenhar a interface. Se /auth/me falhar, mandamos para o login — nao
 * ha como "forjar" sessao no cliente porque toda rota valida no servidor.
 */
export function ProvedorSessao({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<AuthUser | null>(null);
  const [carregando, setCarregando] = useState(true);
  const router = useRouter();

  const carregar = useCallback(async () => {
    try {
      setUsuario(await painel.eu());
    } catch {
      setUsuario(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const sair = useCallback(async () => {
    await painel.sair().catch(() => undefined);
    setUsuario(null);
    router.replace('/painel/entrar');
  }, [router]);

  return (
    <SessaoContexto.Provider value={{ usuario, carregando, sair, recarregar: carregar }}>
      {children}
    </SessaoContexto.Provider>
  );
}

export function useSessao(): Contexto {
  const ctx = useContext(SessaoContexto);
  if (!ctx) throw new Error('useSessao precisa estar dentro do ProvedorSessao');
  return ctx;
}
