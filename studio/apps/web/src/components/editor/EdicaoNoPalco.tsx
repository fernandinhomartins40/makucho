'use client';

// ============================================================
// Editar a animação NO VÍDEO, como num editor: com a animação selecionada
// na timeline, cada peça dela (título, chamada, número, cards, etiquetas)
// vira uma caixa no palco:
//
//   - tocar seleciona (moldura com alças);
//   - arrastar move; a alça do canto, a pinça (dois dedos) ou Ctrl+roda
//     (pinça do trackpad) mudam o tamanho;
//   - toque duplo (ou "Editar texto") edita o texto ali mesmo.
//
// Mover e redimensionar aparecem AO VIVO (o CSS do ajuste vai para o
// iframe sem recarregar) e, ao soltar, ficam guardados na cena. Editar o
// texto remonta a cena no servidor, no mesmo estilo (segundos).
// As caixas vêm do próprio iframe (onde cada peça está agora).
// ============================================================

import { useEffect, useRef, useState } from 'react';
import type { AjusteDaCena, ComposicaoHtml } from '@makucho/studio-contracts';
import { cenaDaComposicao, comAjuste, cssDoAjuste, lerAjuste } from '@makucho/studio-contracts';

export interface PecaDaAnimacao {
  chave: string;
  campo: string;
  /** Px no quadro de 1080x1920 (onde a peça está agora, já com o ajuste). */
  x: number;
  y: number;
  w: number;
  h: number;
}

const W = 1080;
const H = 1920;
type AjusteDaPeca = { x: number; y: number; escala: number };
const NEUTRO: AjusteDaPeca = { x: 0, y: 0, escala: 1 };
const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function EdicaoNoPalco({
  composicao,
  pecas,
  quadro,
  onAoVivo,
  onSalvar,
  onEditarTexto,
}: {
  composicao: ComposicaoHtml;
  pecas: readonly PecaDaAnimacao[];
  quadro: React.RefObject<HTMLDivElement | null>;
  /** O CSS do ajuste enquanto arrasta (vai para o iframe sem recarregar). */
  onAoVivo: (css: string) => void;
  /** Soltou: a animação com o ajuste novo. */
  onSalvar: (c: ComposicaoHtml) => void;
  /** O texto de um campo editado no palco (remonta a cena). */
  onEditarTexto: (campo: string, valor: string) => void;
}) {
  const cena = cenaDaComposicao(composicao);
  const base: AjusteDaCena = cena?.ajuste ?? { x: 0, y: 0, escala: 1 };
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ campo: string; valor: string } | null>(null);
  // O ajuste em andamento (antes de soltar) -- a moldura e o iframe seguem ele.
  const [temporario, setTemporario] = useState<AjusteDaCena | null>(null);
  const atual = temporario ?? base;
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const roda = useRef<{ timer: number; ajuste: AjusteDaCena | null }>({ timer: 0, ajuste: null });
  const raiz = useRef<HTMLDivElement>(null);
  // A pinça do trackpad chega como Ctrl+roda: ouvinte nativo (não passivo) para não dar zoom na página.
  const aoRodar = useRef<(e: WheelEvent) => void>(() => undefined);
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const f = (e: WheelEvent) => aoRodar.current(e);
    el.addEventListener('wheel', f, { passive: false });
    return () => el.removeEventListener('wheel', f);
  }, [!!cena]);

  // Outra animação ou remontada: tira a seleção que não existe mais.
  useEffect(() => {
    if (selecionada && !pecas.some((p) => p.chave === selecionada)) setSelecionada(null);
  }, [pecas, selecionada]);

  if (!cena) return null;
  const daPeca = (chave: string, a: AjusteDaCena = atual): AjusteDaPeca => a.elementos?.[chave] ?? NEUTRO;
  const comPeca = (chave: string, p: AjusteDaPeca, a: AjusteDaCena = base): AjusteDaCena => ({ ...a, elementos: { ...(a.elementos ?? {}), [chave]: p } });
  const aoVivo = (a: AjusteDaCena) => {
    setTemporario(a);
    onAoVivo(cssDoAjuste(lerAjuste(a)));
  };
  const salvar = (a: AjusteDaCena) => {
    onSalvar(comAjuste(composicao, lerAjuste(a)));
    // A moldura fica no lugar novo até a animação nova chegar.
    setTimeout(() => setTemporario(null), 600);
  };
  const escala = () => {
    const q = quadro.current?.getBoundingClientRect();
    return q ? { sx: W / q.width, sy: H / q.height, q } : null;
  };

  // A caixa é a que o iframe informa (ele relata de novo a cada ajuste ao vivo).
  const caixa = (p: PecaDaAnimacao) => p;

  const mover = (p: PecaDaAnimacao) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    setSelecionada(p.chave);
    const m = escala();
    if (!m) return;
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const inicio = { ...daPeca(p.chave, base) };
    const x0 = e.clientX;
    const y0 = e.clientY;
    let distancia0 = 0;
    let ultimo = base;
    let moveu = false;
    const aoMover = (ev: PointerEvent) => {
      if (!dedos.current.has(ev.pointerId)) return;
      dedos.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const pontos = [...dedos.current.values()];
      if (pontos.length >= 2) {
        // Pinça: a escala segue a distância entre os dois dedos.
        const d = Math.hypot(pontos[0]!.x - pontos[1]!.x, pontos[0]!.y - pontos[1]!.y);
        if (!distancia0) distancia0 = d;
        ultimo = comPeca(p.chave, { ...inicio, escala: Math.round(limitar((inicio.escala * d) / Math.max(8, distancia0), 0.2, 4) * 100) / 100 });
      } else {
        ultimo = comPeca(p.chave, { ...inicio, x: Math.round(inicio.x + (ev.clientX - x0) * m.sx), y: Math.round(inicio.y + (ev.clientY - y0) * m.sy) });
      }
      moveu = moveu || Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 3 || pontos.length >= 2;
      if (moveu) aoVivo(ultimo);
    };
    const aoSoltar = (ev: PointerEvent) => {
      dedos.current.delete(ev.pointerId);
      if (dedos.current.size) return;
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
      if (moveu) salvar(ultimo);
    };
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
  };

  // A alça do canto: a escala segue a distância do centro da peça ao ponteiro.
  const redimensionar = (p: PecaDaAnimacao) => (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const m = escala();
    if (!m) return;
    const c = caixa(p);
    const centro = { x: m.q.left + (c.x + c.w / 2) / m.sx, y: m.q.top + (c.y + c.h / 2) / m.sy };
    const d0 = Math.max(8, Math.hypot(e.clientX - centro.x, e.clientY - centro.y));
    const inicio = { ...daPeca(p.chave, base) };
    let ultimo = base;
    const aoMover = (ev: PointerEvent) => {
      const d = Math.hypot(ev.clientX - centro.x, ev.clientY - centro.y);
      ultimo = comPeca(p.chave, { ...inicio, escala: Math.round(limitar((inicio.escala * d) / d0, 0.2, 4) * 100) / 100 });
      aoVivo(ultimo);
    };
    const aoSoltar = () => {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      salvar(ultimo);
    };
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };

  const mudarTamanho = (chave: string, fator: number) => {
    const p = daPeca(chave, base);
    salvar(comPeca(chave, { ...p, escala: Math.round(limitar(p.escala * fator, 0.2, 4) * 100) / 100 }));
  };
  const restaurar = (chave: string) => {
    const { [chave]: _fora, ...resto } = base.elementos ?? {};
    salvar({ ...base, elementos: resto });
  };
  const comecarTexto = (p: PecaDaAnimacao) => {
    if (!p.campo) return;
    const valor = cena.textos[p.campo as keyof typeof cena.textos];
    setEditando({ campo: p.campo, valor: Array.isArray(valor) ? valor.join(', ') : String(valor ?? '') });
  };

  aoRodar.current = (e: WheelEvent) => {
    if (!selecionada || !e.ctrlKey) return;
    e.preventDefault();
    const p = daPeca(selecionada);
    const novo = comPeca(selecionada, { ...p, escala: Math.round(limitar(p.escala * Math.exp(-e.deltaY / 200), 0.2, 4) * 100) / 100 }, atual);
    aoVivo(novo);
    roda.current.ajuste = novo;
    window.clearTimeout(roda.current.timer);
    roda.current.timer = window.setTimeout(() => roda.current.ajuste && salvar(roda.current.ajuste), 350);
  };

  const sel = pecas.find((p) => p.chave === selecionada);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  return (
    <div
      className="palco__edicao-animacao"
      onPointerDown={(e) => {
        // Tocar fora das peças tira a seleção.
        if (e.target === e.currentTarget) {
          setSelecionada(null);
          setEditando(null);
        }
      }}
      ref={raiz}
    >
      {pecas.map((p) => {
        const c = caixa(p);
        const marcada = p.chave === selecionada;
        return (
          <div
            key={p.chave}
            role="button"
            tabIndex={0}
            className="palco__peca"
            data-selecionado={marcada || undefined}
            aria-label={p.campo ? `Selecionar: ${p.campo}` : 'Selecionar a peça'}
            title="Arraste para mover · canto ou pinça para o tamanho · toque duplo para editar o texto"
            style={{ left: pct(c.x, W), top: pct(c.y, H), width: pct(c.w, W), height: pct(c.h, H) }}
            onPointerDown={mover(p)}
            onDoubleClick={() => comecarTexto(p)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') comecarTexto(p);
              if (e.key === '+' || e.key === '=') mudarTamanho(p.chave, 1.1);
              if (e.key === '-') mudarTamanho(p.chave, 1 / 1.1);
            }}
          >
            {marcada && (['ne', 'nw', 'se', 'sw'] as const).map((canto) => <span key={canto} className={`palco__canto palco__canto--${canto}`} aria-hidden onPointerDown={redimensionar(p)} />)}
          </div>
        );
      })}

      {sel && !editando && (
        <div className="palco__barra-da-peca" style={{ left: pct(caixa(sel).x + caixa(sel).w / 2, W), top: pct(Math.max(40, caixa(sel).y - 20), H) }}>
          <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Diminuir" title="Diminuir" onClick={() => mudarTamanho(sel.chave, 1 / 1.15)}>
            A−
          </button>
          <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Aumentar" title="Aumentar" onClick={() => mudarTamanho(sel.chave, 1.15)}>
            A+
          </button>
          {sel.campo && (
            <button type="button" className="botao-link" onClick={() => comecarTexto(sel)}>
              Editar texto
            </button>
          )}
          {base.elementos?.[sel.chave] && (
            <button type="button" className="botao-link" onClick={() => restaurar(sel.chave)}>
              Restaurar
            </button>
          )}
        </div>
      )}

      {sel && editando && (
        <form
          className="palco__texto-da-peca"
          style={{ left: pct(caixa(sel).x, W), top: pct(caixa(sel).y, H), width: pct(Math.max(caixa(sel).w, 500), W) }}
          onSubmit={(e) => {
            e.preventDefault();
            onEditarTexto(editando.campo, editando.valor);
            setEditando(null);
          }}
        >
          <input
            autoFocus
            className="campo__entrada"
            value={editando.valor}
            aria-label="Texto"
            onChange={(e) => setEditando({ ...editando, valor: e.target.value })}
            onKeyDown={(e) => e.key === 'Escape' && setEditando(null)}
          />
          <button type="submit" className="botao botao--primario botao--pequeno">
            OK
          </button>
        </form>
      )}
    </div>
  );
}
