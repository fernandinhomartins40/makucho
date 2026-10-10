'use client';

// ============================================================
// Tema claro ou escuro.
//
// Sem escolha, o Studio segue o aparelho. Quem toca no botão fixa o
// tema contrário; se a escolha coincide com a do aparelho, ela é
// apagada e o app volta a acompanhá-lo (sem isso, quem testou o botão
// uma vez ficaria preso naquele tema para sempre).
//
// O tema vale como `data-tema` no <html>. Quem o aplica no carregamento
// é o SCRIPT_DO_TEMA (lib/tema.ts), posto no <head> pelo layout.
// ============================================================

import { useEffect, useState } from 'react';
import { IconeTemaClaro, IconeTemaEscuro } from '../icones';
import { CHAVE_DO_TEMA as CHAVE } from '../../lib/tema';

type Tema = 'claro' | 'escuro';

/** A cor da barra do navegador em cada tema (as mesmas do layout). */
const COR_DA_BARRA: Record<Tema, string> = { claro: '#f2f2f7', escuro: '#000000' };

function temaDoAparelho(): Tema {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

/** As duas metas de cor (uma por tema do aparelho) passam a valer para o tema em uso. */
function pintarBarraDoNavegador(tema: Tema, fixo: boolean): void {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const doAparelho: Tema = meta.media.includes('dark') ? 'escuro' : 'claro';
    meta.content = COR_DA_BARRA[fixo ? tema : doAparelho];
  });
}

export function BotaoDeTema({ className = 'botao-icone' }: { className?: string }) {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    const ler = () => {
      const atual: Tema = document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro';
      setTema(atual);
      pintarBarraDoNavegador(atual, atual !== temaDoAparelho());
    };
    ler();
    // O script do <head> escuta a mesma troca e foi registrado antes:
    // quando este roda, o `data-tema` já está atualizado.
    const midia = window.matchMedia('(prefers-color-scheme: dark)');
    midia.addEventListener?.('change', ler);
    return () => midia.removeEventListener?.('change', ler);
  }, []);

  const alternar = () => {
    const novo: Tema = tema === 'escuro' ? 'claro' : 'escuro';
    const fixo = novo !== temaDoAparelho();
    setTema(novo);
    document.documentElement.dataset.tema = novo;
    pintarBarraDoNavegador(novo, fixo);
    try {
      if (fixo) window.localStorage.setItem(CHAVE, novo);
      else window.localStorage.removeItem(CHAVE);
    } catch {
      // Vale só nesta visita.
    }
  };

  const rotulo = tema === 'escuro' ? 'Usar o tema claro' : 'Usar o tema escuro';

  return (
    <button type="button" className={className} aria-label={rotulo} title={rotulo} onClick={alternar}>
      {tema === 'escuro' ? <IconeTemaClaro size={19} /> : <IconeTemaEscuro size={19} />}
    </button>
  );
}
