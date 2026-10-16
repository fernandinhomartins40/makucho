'use client';

// ============================================================
// O motor dos tutoriais guiados (lib/tutoriais.ts), sobre o driver.js.
//
//   - Na primeira visita a uma tela, o tutorial dela aparece sozinho
//     (uma vez: fechar ou terminar conta como visto).
//   - O botão "Tutorial" (BotaoDoTutorial) e a lista da Ajuda abrem de
//     novo, quando a pessoa quiser; `?tutorial=<id>` também.
//   - Os tutoriais de contexto (o das peças da animação) aparecem
//     quando a coisa surge na tela pela primeira vez.
//
// Em navegador automatizado (testes, prints da apostila) nada aparece
// sozinho: só o pedido explícito.
// ============================================================

import 'driver.js/dist/driver.css';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { driver, type Driver, type DriveStep } from 'driver.js';
import { TUTORIAIS, tutoriaisDaPagina, type Tutorial } from '../../lib/tutoriais';
import { IconeTutorial } from '../icones';

const EVENTO = 'studio:tutorial';
const chaveDoVisto = (id: string) => `studio:tutorial:${id}`;

/** Abre um tutorial (o da tela, sem id). Vale de qualquer lugar do app. */
export function abrirTutorial(id?: string): void {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: id ?? null }));
}

const lerVisto = (id: string) => {
  try {
    return window.localStorage.getItem(chaveDoVisto(id)) === '1';
  } catch {
    return false;
  }
};
const marcarVisto = (id: string) => {
  try {
    window.localStorage.setItem(chaveDoVisto(id), '1');
  } catch {
    // Sem armazenamento: aparece de novo na próxima visita.
  }
};

const visivel = (el: Element) => {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05;
};
/** O primeiro elemento visível dos seletores (um seletor inválido é ignorado). */
export function acharAlvo(seletores: readonly string[]): Element | null {
  for (const s of seletores) {
    let lista: NodeListOf<Element>;
    try {
      lista = document.querySelectorAll(s);
    } catch {
      continue;
    }
    for (const el of lista) if (visivel(el)) return el;
  }
  return null;
}

/** Os passos que valem agora: os de alvo fixo que não estão na tela saem (os depois de um toque esperam). */
function passosDe(t: Tutorial): DriveStep[] {
  const passos: DriveStep[] = [];
  let depoisDeToque = false;
  for (const p of t.passos) {
    const espera = depoisDeToque || !!p.esperar;
    if (p.alvo && !espera && !acharAlvo(p.alvo)) continue;
    const alvo = p.alvo;
    passos.push({
      ...(alvo ? { element: () => acharAlvo(alvo) as Element } : {}),
      ...(p.clicar ? { advanceOnClick: true } : {}),
      ...(espera && alvo ? { waitForElement: p.esperar ?? 2500 } : {}),
      popover: {
        title: p.titulo,
        description: p.texto,
        ...(p.lado ? { side: p.lado } : {}),
        ...(p.clicar ? { showButtons: ['previous', 'close'] as const } : {}),
      },
    } as DriveStep);
    if (p.clicar) depoisDeToque = true;
  }
  return passos;
}

export function GuiaDosTutoriais() {
  const caminho = usePathname();
  const ativo = useRef<Driver | null>(null);

  const rodar = (t: Tutorial) => {
    if (ativo.current?.isActive()) ativo.current.destroy();
    const passos = passosDe(t);
    if (!passos.length) return;
    marcarVisto(t.id);
    const d = driver({
      steps: passos,
      showProgress: passos.length > 1,
      progressText: '{{current}} de {{total}}',
      nextBtnText: 'Próximo',
      prevBtnText: 'Voltar',
      doneBtnText: 'Entendi',
      popoverClass: 'tutorial',
      overlayOpacity: 0.62,
      stagePadding: 6,
      stageRadius: 14,
      smoothScroll: true,
      skipMissingElement: true,
      allowKeyboardControl: true,
      // "Pular" sempre à mão: o tutorial nunca prende ninguém.
      onPopoverRender: (popover, { driver: dr }) => {
        if (dr.isLastStep()) return;
        const pular = document.createElement('button');
        pular.type = 'button';
        pular.className = 'tutorial__pular';
        pular.textContent = 'Pular tutorial';
        pular.onclick = () => dr.destroy();
        popover.footer.prepend(pular);
      },
      onDestroyed: () => {
        ativo.current = null;
      },
    });
    ativo.current = d;
    d.drive();
  };

  // O botão "Tutorial" e a lista da Ajuda.
  useEffect(() => {
    const aoPedir = (e: Event) => {
      const id = (e as CustomEvent<string | null>).detail;
      const t = id ? TUTORIAIS.find((x) => x.id === id) : tutoriaisDaPagina(window.location.pathname).find((x) => !x.gatilho);
      if (t) rodar(t);
    };
    window.addEventListener(EVENTO, aoPedir);
    return () => window.removeEventListener(EVENTO, aoPedir);
  }, []);

  // A primeira visita à tela (ou ?tutorial=<id>): espera a tela montar e o primeiro alvo aparecer.
  useEffect(() => {
    const pedido = new URLSearchParams(window.location.search).get('tutorial');
    const automatico = !navigator.webdriver;
    if (!pedido && !automatico) return;
    let tentativas = 0;
    let vivo = true;
    const tentar = () => {
      if (!vivo || ativo.current?.isActive()) return;
      const t = pedido
        ? tutoriaisDaPagina(window.location.pathname).find((x) => x.id === pedido)
        : tutoriaisDaPagina(window.location.pathname).find((x) => !x.gatilho && !lerVisto(x.id));
      const primeiro = t?.passos.find((p) => p.alvo);
      if (t && (!primeiro?.alvo || acharAlvo(primeiro.alvo))) return rodar(t);
      if (++tentativas < 20) timer = window.setTimeout(tentar, 700);
    };
    let timer = window.setTimeout(tentar, 1200);
    return () => {
      vivo = false;
      window.clearTimeout(timer);
    };
  }, [caminho]);

  // Os de contexto: aparecem quando a coisa surge na tela pela primeira vez.
  useEffect(() => {
    if (navigator.webdriver) return;
    const deContexto = TUTORIAIS.filter((t) => t.gatilho && caminho.startsWith(t.pagina));
    if (!deContexto.length) return;
    const olhar = window.setInterval(() => {
      if (ativo.current?.isActive()) return;
      const t = deContexto.find((x) => !lerVisto(x.id) && acharAlvo([x.gatilho!]));
      if (t) rodar(t);
    }, 1500);
    return () => window.clearInterval(olhar);
  }, [caminho]);

  useEffect(() => () => ativo.current?.destroy(), []);
  return null;
}

/** O botão que abre o tutorial da tela. */
export function BotaoDoTutorial({ className = 'botao-icone' }: { className?: string }) {
  return (
    <button type="button" className={className} aria-label="Tutorial desta tela" title="Tutorial: aprenda a usar esta tela" onClick={() => abrirTutorial()} data-tutorial-botao>
      <IconeTutorial size={19} />
    </button>
  );
}
