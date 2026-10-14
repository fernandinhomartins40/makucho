'use client';

// ============================================================
// Editar a animação NO VÍDEO, como num editor: com a animação selecionada
// na timeline, cada peça dela (título, chamada, número, cards, etiquetas)
// vira uma caixa no palco:
//
//   - tocar seleciona (moldura com alças);
//   - arrastar move; a alça do canto (ou A−/A+) muda o tamanho (proporcional);
//   - as alças do meio dos lados esticam só a largura ou só a altura: a
//     caixa muda de forma e o texto dentro dela quebra em linhas;
//   - toque duplo (ou "Editar texto") edita o texto ali mesmo (Enter quebra
//     a linha);
//   - a pinça (dois dedos, em qualquer lugar) ou Ctrl+roda (pinça do
//     trackpad) dão zoom na VISTA: o vídeo inteiro amplia dentro do quadro,
//     para acertar peças pequenas no celular. Dois dedos arrastam a vista,
//     um dedo fora das peças também. As barras ficam fora do zoom.
//
// Mover e redimensionar aparecem AO VIVO (o CSS do ajuste vai para o
// iframe sem recarregar) e, ao soltar, ficam guardados na cena. Editar o
// texto remonta a cena no servidor, no mesmo estilo (segundos).
// As caixas vêm do próprio iframe (onde cada peça está agora).
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AjusteDaCena, AjusteDaPeca, ComposicaoHtml } from '@makucho/studio-contracts';
import { ajusteDaComposicao, cenaDaComposicao, comAjuste, cssDoAjuste, lerAjuste } from '@makucho/studio-contracts';

export interface PecaDaAnimacao {
  /** data-ed da peça; "cena" é a animação inteira. */
  chave: string;
  campo: string;
  /** O grupo que a contém (outra peça, "cena", ou null na própria cena). */
  pai?: string | null;
  /** Px no quadro de 1080x1920 (onde a peça está agora, já com o ajuste). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Largura e altura de layout (sem escala) de quem recebe o ajuste. */
  lw?: number;
  lh?: number;
  /** A peça mora numa máscara (linha de título que sobe): não estica, só escala. */
  mascara?: boolean;
}

/** O zoom da vista: escala e deslocamento (px da tela) do conteúdo dentro do quadro. */
export interface ZoomDoPalco {
  z: number;
  x: number;
  y: number;
}
export const SEM_ZOOM: ZoomDoPalco = { z: 1, x: 0, y: 0 };
const ZOOM_MAXIMO = 6;

const W = 1080;
const H = 1920;
const NEUTRO: AjusteDaPeca = { x: 0, y: 0, escala: 1 };
const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** O menor tamanho de uma peça (30%): menor que isso some do vídeo. */
const MINIMO = 0.3;

type Lado = 'n' | 's' | 'e' | 'w';
/** Esticando um lado: o lado oposto fica parado (a borda dele, em px do quadro). */
interface Esticando {
  chave: string;
  lado: Lado;
  ancora: number;
  /** Relatos que ainda corrigem a posição depois de soltar. */
  restam: number | null;
}
const bordaOposta = (p: PecaDaAnimacao, lado: Lado) => (lado === 'e' ? p.x : lado === 'w' ? p.x + p.w : lado === 's' ? p.y : p.y + p.h);

export function EdicaoNoPalco({
  composicao,
  pecas,
  quadro,
  zoom,
  onZoom,
  onAoVivo,
  onSalvar,
  onEditarTexto,
}: {
  composicao: ComposicaoHtml;
  pecas: readonly PecaDaAnimacao[];
  /** O quadro do vídeo (sem o zoom): as barras moram nele, fora da vista ampliada. */
  quadro: React.RefObject<HTMLDivElement | null>;
  zoom: ZoomDoPalco;
  onZoom: (z: ZoomDoPalco) => void;
  /** O CSS do ajuste enquanto arrasta (vai para o iframe sem recarregar). */
  onAoVivo: (css: string) => void;
  /** Soltou: a animação com o ajuste novo. */
  onSalvar: (c: ComposicaoHtml) => void;
  /** O texto de um campo editado no palco (remonta a cena). */
  onEditarTexto: (campo: string, valor: string) => void;
}) {
  // Sem modelo (animação livre) também se edita: só os textos dependem da cena.
  const cena = cenaDaComposicao(composicao);
  const base: AjusteDaCena = ajusteDaComposicao(composicao) ?? { x: 0, y: 0, escala: 1 };
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ campo: string; valor: string; lista: boolean } | null>(null);
  // O ajuste PENDENTE: aparece ao vivo no vídeo e acumula até "Aplicar" (ou "Desfazer").
  const [pendente, setPendente] = useState<AjusteDaCena | null>(null);
  const atual = pendente ?? base;
  // O ajuste na tela agora, sem esperar o redesenho (arrastes e correções seguidas partem dele).
  const atualRef = useRef(atual);
  atualRef.current = atual;
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const raiz = useRef<HTMLDivElement>(null);
  const esticando = useRef<Esticando | null>(null);
  // O zoom de agora (gestos seguidos partem dele sem esperar o redesenho) e o começo da pinça.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pinca = useRef<{ inicio: ZoomDoPalco; mx: number; my: number; d: number } | null>(null);
  const [barras, setBarras] = useState<HTMLElement | null>(null);
  useEffect(() => setBarras(quadro.current), [quadro]);
  // A pinça do trackpad chega como Ctrl+roda: ouvinte nativo (não passivo) para não dar zoom na página.
  const aoRodar = useRef<(e: WheelEvent) => void>(() => undefined);
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const f = (e: WheelEvent) => aoRodar.current(e);
    el.addEventListener('wheel', f, { passive: false });
    return () => el.removeEventListener('wheel', f);
  }, []);

  // Aplicou (ou a animação mudou por outro caminho): o pendente sai -- o que vale é o salvo.
  useEffect(() => {
    setPendente(null);
  }, [composicao.css, composicao.html]);
  // A seleção fica enquanto a animação recarrega (as peças somem por um instante); sai se a peça não existe mais.
  useEffect(() => {
    if (selecionada && pecas.length && !pecas.some((p) => p.chave === selecionada)) setSelecionada(null);
  }, [pecas, selecionada]);
  // Esticar muda o tamanho a partir de onde o layout ancora a peça (a esquerda, o centro...):
  // a cada relato do iframe, a posição é corrigida para o lado oposto ficar onde estava.
  const corrigir = useRef<(lista: readonly PecaDaAnimacao[]) => void>(() => undefined);
  useEffect(() => corrigir.current(pecas), [pecas]);

  // A cena inteira usa o ajuste de cima (x, y, escala); cada peça, o dela.
  const daPeca = (chave: string, a: AjusteDaCena = atual): AjusteDaPeca => (chave === 'cena' ? { x: a.x, y: a.y, escala: a.escala } : (a.elementos?.[chave] ?? NEUTRO));
  // Cada mudança parte do que está na tela (o pendente), e não do salvo: as mudanças se somam.
  const comPeca = (chave: string, p: AjusteDaPeca, a: AjusteDaCena = atual): AjusteDaCena =>
    chave === 'cena' ? { ...a, x: p.x, y: p.y, escala: p.escala } : { ...a, elementos: { ...(a.elementos ?? {}), [chave]: p } };
  const aoVivo = (a: AjusteDaCena) => {
    atualRef.current = a;
    setPendente(a);
    onAoVivo(cssDoAjuste(lerAjuste(a)));
  };
  /** Aplicar: grava na animação (o vídeo dela é refeito com o tamanho novo). */
  const aplicar = () => {
    if (!pendente) return;
    onSalvar(comAjuste(composicao, lerAjuste(pendente)));
  };
  const desfazer = () => {
    setPendente(null);
    onAoVivo(cssDoAjuste(lerAjuste(base)));
  };
  // Px do quadro de 1080x1920 por px da tela: medido na vista (já com o zoom).
  const escala = () => {
    const q = raiz.current?.getBoundingClientRect();
    return q ? { sx: W / q.width, sy: H / q.height, q } : null;
  };

  // ---------- Zoom da vista ----------
  /** O conteúdo sempre cobre o quadro: não dá para arrastar a vista para fora do vídeo. */
  const mudarZoom = (z: ZoomDoPalco) => {
    const q = quadro.current;
    if (!q) return;
    const largura = q.clientWidth;
    const altura = q.clientHeight;
    const novo = z.z <= 1.02 ? SEM_ZOOM : { z: z.z, x: limitar(z.x, largura - z.z * largura, 0), y: limitar(z.y, altura - z.z * altura, 0) };
    zoomRef.current = novo;
    onZoom(novo);
  };
  /** Ampliar em torno de um ponto do quadro: o que estava em (px, py) vai para (mx, my) -- a pinça também arrasta. */
  const zoomEm = (inicio: ZoomDoPalco, z: number, px: number, py: number, mx = px, my = py) => {
    const z1 = limitar(z, 1, ZOOM_MAXIMO);
    const cx = (px - inicio.x) / inicio.z;
    const cy = (py - inicio.y) / inicio.z;
    mudarZoom({ z: z1, x: mx - z1 * cx, y: my - z1 * cy });
  };
  /** Dois dedos: a escala segue a distância entre eles; o meio deles arrasta a vista. */
  const medirDedos = () => {
    const q = quadro.current?.getBoundingClientRect();
    const [a, b] = dedos.current.values();
    if (!q || !a || !b) return null;
    return { mx: (a.x + b.x) / 2 - q.left, my: (a.y + b.y) / 2 - q.top, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  /** O segundo dedo pousou (ou um saiu): a pinça parte de onde os dedos estão agora. */
  const comecarPinca = () => {
    const m = medirDedos();
    pinca.current = m ? { inicio: zoomRef.current, mx: m.mx, my: m.my, d: Math.max(8, m.d) } : null;
  };
  const pincar = () => {
    const m = medirDedos();
    if (!m) return;
    if (!pinca.current) comecarPinca();
    const p = pinca.current!;
    zoomEm(p.inicio, (p.inicio.z * m.d) / p.d, p.mx, p.my, m.mx, m.my);
  };

  corrigir.current = (lista) => {
    const e = esticando.current;
    if (!e) return;
    const p = lista.find((q) => q.chave === e.chave);
    if (!p) return;
    if (e.restam !== null) {
      e.restam -= 1;
      if (e.restam <= 0) esticando.current = null;
    }
    const dif = e.ancora - bordaOposta(p, e.lado);
    if (Math.abs(dif) < 1) return;
    const agora = atualRef.current;
    const atualDaPeca = daPeca(e.chave, agora);
    const eixo = e.lado === 'e' || e.lado === 'w' ? 'x' : 'y';
    aoVivo(comPeca(e.chave, { ...atualDaPeca, [eixo]: Math.round(atualDaPeca[eixo] + dif) }, agora));
  };

  const mover = (p: PecaDaAnimacao) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    // Segundo dedo (pinça) em cima de uma peça: entra na conta do primeiro.
    if (dedos.current.size) {
      dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      comecarPinca();
      return;
    }
    setSelecionada(p.chave);
    const m = escala();
    if (!m) return;
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const inicioDoAjuste = atual;
    const pendenteNoInicio = pendente;
    const inicio = { ...daPeca(p.chave) };
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moveu = false;
    let pincou = false;
    const aoMover = (ev: PointerEvent) => {
      if (!dedos.current.has(ev.pointerId)) return;
      dedos.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const pontos = [...dedos.current.values()];
      if (pontos.length >= 2) {
        // Pinça: zoom na vista. A peça volta para onde estava antes do segundo dedo.
        if (!pincou && moveu) {
          atualRef.current = inicioDoAjuste;
          setPendente(pendenteNoInicio);
          onAoVivo(cssDoAjuste(lerAjuste(inicioDoAjuste)));
        }
        pincou = true;
        pincar();
        return;
      }
      // Depois da pinça, o dedo que ficou não arrasta a peça.
      if (pincou) return;
      moveu = moveu || Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 3;
      if (moveu) aoVivo(comPeca(p.chave, { ...inicio, x: Math.round(inicio.x + (ev.clientX - x0) * m.sx), y: Math.round(inicio.y + (ev.clientY - y0) * m.sy) }, inicioDoAjuste));
    };
    const aoSoltar = (ev: PointerEvent) => {
      dedos.current.delete(ev.pointerId);
      pinca.current = null;
      if (dedos.current.size) return;
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
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
    const centro = { x: m.q.left + (p.x + p.w / 2) / m.sx, y: m.q.top + (p.y + p.h / 2) / m.sy };
    // A distância inicial nunca é menor que a meia diagonal da peça: soltar perto do centro não a encolhe ao mínimo.
    const meiaDiagonal = Math.hypot(p.w / m.sx, p.h / m.sy) / 2;
    const d0 = Math.max(meiaDiagonal * 0.6, 12, Math.hypot(e.clientX - centro.x, e.clientY - centro.y));
    const inicioDoAjuste = atual;
    const inicio = { ...daPeca(p.chave) };
    const aoMover = (ev: PointerEvent) => {
      const d = Math.hypot(ev.clientX - centro.x, ev.clientY - centro.y);
      aoVivo(comPeca(p.chave, { ...inicio, escala: Math.round(limitar((inicio.escala * d) / d0, MINIMO, 4) * 100) / 100 }, inicioDoAjuste));
    };
    const aoSoltar = () => {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
    };
    window.addEventListener('pointercancel', aoSoltar);
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };

  // A alça do meio de um lado: estica só a largura (e/w) ou só a altura (n/s).
  const esticar = (p: PecaDaAnimacao, lado: Lado) => (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const m = escala();
    if (!m) return;
    const horizontal = lado === 'e' || lado === 'w';
    const inicio = { ...daPeca(p.chave) };
    // O tamanho de layout de agora (o já esticado, ou o natural da peça).
    const natural = horizontal ? p.lw || p.w : p.lh || p.h;
    const tamanho0 = (horizontal ? inicio.w : inicio.h) ?? natural;
    // Px do quadro por px de layout (a escala da peça e a da cena).
    const k = (horizontal ? p.w : p.h) / Math.max(1, natural);
    const sinal = lado === 'e' || lado === 's' ? 1 : -1;
    esticando.current = { chave: p.chave, lado, ancora: bordaOposta(p, lado), restam: null };
    const x0 = e.clientX;
    const y0 = e.clientY;
    const aoMover = (ev: PointerEvent) => {
      const d = horizontal ? (ev.clientX - x0) * m.sx : (ev.clientY - y0) * m.sy;
      const tamanho = Math.round(limitar(tamanho0 + (sinal * d) / Math.max(0.05, k), 24, horizontal ? 2160 : 3840));
      const agora = atualRef.current;
      aoVivo(comPeca(p.chave, { ...daPeca(p.chave, agora), [horizontal ? 'w' : 'h']: tamanho }, agora));
    };
    const aoSoltar = () => {
      // Os próximos relatos ainda acertam a posição (o último tamanho chega depois de soltar).
      if (esticando.current) esticando.current.restam = 3;
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
    };
    window.addEventListener('pointercancel', aoSoltar);
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };

  const mudarTamanho = (chave: string, fator: number) => {
    const p = daPeca(chave);
    aoVivo(comPeca(chave, { ...p, escala: Math.round(limitar(p.escala * fator, MINIMO, 4) * 100) / 100 }));
  };
  const restaurar = (chave: string) => {
    if (chave === 'cena') return aoVivo({ ...atual, ...NEUTRO });
    const { [chave]: _fora, ...resto } = atual.elementos ?? {};
    aoVivo({ ...atual, elementos: resto });
  };
  const mudou = (chave: string) => {
    const p = daPeca(chave);
    return p.x !== 0 || p.y !== 0 || p.escala !== 1 || !!p.w || !!p.h;
  };
  const comecarTexto = (p: PecaDaAnimacao) => {
    if (!cena || !p.campo) return;
    const valor = cena.textos[p.campo as keyof typeof cena.textos];
    const lista = Array.isArray(valor);
    setEditando({ campo: p.campo, valor: lista ? valor.join(', ') : String(valor ?? ''), lista });
  };
  const confirmarTexto = () => {
    if (!editando) return;
    onEditarTexto(editando.campo, editando.valor);
    setEditando(null);
  };

  aoRodar.current = (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const q = quadro.current?.getBoundingClientRect();
    if (!q) return;
    const z = zoomRef.current;
    zoomEm(z, z.z * Math.exp(-e.deltaY / 200), e.clientX - q.left, e.clientY - q.top);
  };

  // Fora das peças: um dedo arrasta a vista ampliada (tocar e soltar tira a seleção); dois, a pinça.
  const arrastarVista = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const inicio = zoomRef.current;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moveu = false;
    let pincou = false;
    const aoMover = (ev: PointerEvent) => {
      if (!dedos.current.has(ev.pointerId)) return;
      dedos.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const pontos = [...dedos.current.values()];
      if (pontos.length >= 2) {
        pincou = moveu = true;
        pincar();
        return;
      }
      if (pincou) return;
      moveu = moveu || Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 3;
      if (moveu && inicio.z > 1) mudarZoom({ ...inicio, x: inicio.x + ev.clientX - x0, y: inicio.y + ev.clientY - y0 });
    };
    const aoSoltar = (ev: PointerEvent) => {
      dedos.current.delete(ev.pointerId);
      pinca.current = null;
      if (dedos.current.size) return;
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
      // Tocar fora das peças (sem arrastar) tira a seleção.
      if (!moveu) {
        setSelecionada(null);
        setEditando(null);
      }
    };
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
  };

  // A ordem das caixas (a última fica por cima e recebe o toque): pela hierarquia, não pelo
  // tamanho -- a animação inteira embaixo de tudo, cada grupo embaixo das suas peças. Por
  // tamanho, um título que transborda a cena ficava embaixo dela e não dava para tocá-lo.
  const profundidade = (p: PecaDaAnimacao) => {
    let n = 0;
    for (let pai = p.pai; pai && n < 20; n += 1) pai = pecas.find((q) => q.chave === pai)?.pai ?? null;
    return p.chave === 'cena' ? -1 : n;
  };
  const sel = pecas.find((p) => p.chave === selecionada);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  return (
    <div
      className="palco__edicao-animacao"
      onPointerDown={(e) => {
        // Segundo dedo fora da peça: a pinça continua valendo.
        if (dedos.current.size) {
          dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          comecarPinca();
          return;
        }
        if (e.target === e.currentTarget) arrastarVista(e);
      }}
      ref={raiz}
    >
      {[...pecas].sort((a, b) => profundidade(a) - profundidade(b) || b.w * b.h - a.w * a.h).map((p) => {
        const marcada = p.chave === selecionada;
        // A cena inteira e as linhas em máscara não esticam: só movem e escalam.
        const estica = marcada && p.chave !== 'cena' && !p.mascara;
        return (
          <div
            key={p.chave}
            role="button"
            tabIndex={0}
            className="palco__peca"
            data-selecionado={marcada || undefined}
            data-grupo={p.chave === 'cena' || pecas.some((o) => o.pai === p.chave) || undefined}
            aria-label={p.chave === 'cena' ? 'Selecionar a animação inteira' : p.campo ? `Selecionar: ${p.campo}` : 'Selecionar o grupo'}
            title="Arraste para mover · canto para o tamanho · meio dos lados para esticar · toque duplo para editar o texto · pinça para ampliar a vista"
            style={{ left: pct(p.x, W), top: pct(p.y, H), width: pct(p.w, W), height: pct(p.h, H) }}
            onPointerDown={mover(p)}
            onDoubleClick={() => comecarTexto(p)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') comecarTexto(p);
              if (e.key === '+' || e.key === '=') mudarTamanho(p.chave, 1.1);
              if (e.key === '-') mudarTamanho(p.chave, 1 / 1.1);
            }}
          >
            {marcada && (['ne', 'nw', 'se', 'sw'] as const).map((canto) => <span key={canto} className={`palco__canto palco__canto--${canto}`} aria-hidden onPointerDown={redimensionar(p)} />)}
            {estica &&
              (['n', 's', 'e', 'w'] as const).map((lado) => (
                <span key={lado} className={`palco__lado palco__lado--${lado}`} aria-hidden title={lado === 'e' || lado === 'w' ? 'Esticar a largura' : 'Esticar a altura'} onPointerDown={esticar(p, lado)} />
              ))}
          </div>
        );
      })}

      {/* As barras moram no quadro, fora da vista ampliada: não crescem nem saem da tela com o zoom. */}
      {barras &&
        createPortal(
          <>
            {sel && !editando && (
              <div className="palco__barra-da-peca" role="toolbar" aria-label="Ajustar a peça">
                <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Diminuir" title="Diminuir" onClick={() => mudarTamanho(sel.chave, 1 / 1.15)}>
                  A−
                </button>
                <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Aumentar" title="Aumentar" onClick={() => mudarTamanho(sel.chave, 1.15)}>
                  A+
                </button>
                {cena && sel.campo && (
                  <button type="button" className="botao-link" onClick={() => comecarTexto(sel)}>
                    Texto
                  </button>
                )}
                {sel.pai && (
                  <button type="button" className="botao-link" title="Seleciona o conjunto que contém esta peça" onClick={() => setSelecionada(sel.pai!)}>
                    {sel.pai === 'cena' ? 'Tudo' : 'Grupo'}
                  </button>
                )}
                {mudou(sel.chave) && (
                  <button type="button" className="botao-link" onClick={() => restaurar(sel.chave)}>
                    Original
                  </button>
                )}
              </div>
            )}

            {pendente && (
              <div className="palco__aplicar-da-peca" role="group" aria-label="Aplicar o ajuste e refazer a animação">
                <button type="button" className="botao botao--secundario botao--pequeno" onClick={desfazer}>
                  Desfazer
                </button>
                <button type="button" className="botao botao--primario botao--pequeno" onClick={aplicar}>
                  Aplicar
                </button>
              </div>
            )}

            {sel && editando && (
              <form
                className="palco__texto-da-peca"
                onSubmit={(e) => {
                  e.preventDefault();
                  confirmarTexto();
                }}
              >
                {editando.lista ? (
                  <input
                    autoFocus
                    className="campo__entrada"
                    value={editando.valor}
                    aria-label="Texto (itens separados por vírgula)"
                    onChange={(e) => setEditando({ ...editando, valor: e.target.value })}
                    onKeyDown={(e) => e.key === 'Escape' && setEditando(null)}
                  />
                ) : (
                  // Enter quebra a linha (como a pessoa quer ver no vídeo); OK ou Ctrl+Enter confirma.
                  <textarea
                    autoFocus
                    className="campo__entrada palco__texto-da-peca-area"
                    value={editando.valor}
                    rows={Math.min(4, Math.max(2, editando.valor.split('\n').length))}
                    aria-label="Texto (Enter quebra a linha)"
                    placeholder="Enter quebra a linha"
                    onChange={(e) => setEditando({ ...editando, valor: e.target.value.split('\n').slice(0, 4).join('\n') })}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditando(null);
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        confirmarTexto();
                      }
                    }}
                  />
                )}
                <button type="submit" className="botao botao--primario botao--pequeno">
                  OK
                </button>
              </form>
            )}

            {zoom.z > 1 && (
              <button
                type="button"
                className="chip chip--acionavel palco__zoom-voltar"
                data-acima={pendente ? true : undefined}
                title="Voltar o vídeo ao tamanho normal"
                onClick={() => mudarZoom(SEM_ZOOM)}
              >
                {Math.round(zoom.z * 100)}% · voltar
              </button>
            )}
          </>,
          barras,
        )}
    </div>
  );
}
