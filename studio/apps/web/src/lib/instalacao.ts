'use client';

// ============================================================
// Estado da instalação do app, compartilhado pelas telas.
//
// O `beforeinstallprompt` dispara UMA vez, cedo, no carregamento: se
// ninguém o guardar nesse instante, o botão "Instalar" não tem mais o
// que chamar. Este módulo o captura assim que é importado e o entrega
// a quem pedir (banner, menu "Mais", Configurações).
// ============================================================

import { useEffect, useState } from 'react';
import { detectarPlataforma, type Plataforma } from './plataforma';

interface EventoDeInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let evento: EventoDeInstalacao | null = null;
let instalou = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Guarda o evento e segura a mini-barra do Chrome: quem mostra a
    // oferta, na hora certa, é o próprio app.
    e.preventDefault();
    evento = e as EventoDeInstalacao;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    instalou = true;
    evento = null;
    avisar();
  });
}

/** Aberto como app (tela inicial), e não numa aba do navegador. */
export function estaInstalado(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    instalou ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    // iOS: Safari expõe isto quando o app abre da Tela de Início.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export interface EstadoDaInstalacao {
  plataforma: Plataforma | null;
  instalado: boolean;
  /** O navegador oferece o diálogo nativo (Android/desktop). */
  podeInstalarNativo: boolean;
  /** Abre o diálogo nativo; devolve se a pessoa aceitou. */
  instalar: () => Promise<boolean>;
}

export function useInstalacao(): EstadoDaInstalacao {
  const [, setVersao] = useState(0);
  const [plataforma, setPlataforma] = useState<Plataforma | null>(null);

  useEffect(() => {
    setPlataforma(detectarPlataforma({ ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0 }));
    const f = () => setVersao((v) => v + 1);
    ouvintes.add(f);
    return () => {
      ouvintes.delete(f);
    };
  }, []);

  return {
    plataforma,
    instalado: estaInstalado(),
    podeInstalarNativo: evento !== null,
    instalar: async () => {
      if (!evento) return false;
      const atual = evento;
      await atual.prompt();
      const { outcome } = await atual.userChoice;
      // O evento só vale uma vez: aceito ou não, precisa de outro.
      evento = null;
      avisar();
      return outcome === 'accepted';
    },
  };
}

// ---------- "Agora não" ----------

const CHAVE = 'studio:instalacao:adiada-ate';
const DIAS = 14;

export function foiAdiado(): boolean {
  try {
    return Number(localStorage.getItem(CHAVE) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function adiar() {
  try {
    localStorage.setItem(CHAVE, String(Date.now() + DIAS * 24 * 60 * 60 * 1000));
  } catch {
    // modo privado: o banner volta na próxima visita, sem problema
  }
}
