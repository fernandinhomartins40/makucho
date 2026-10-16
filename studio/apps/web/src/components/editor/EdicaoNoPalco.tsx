'use client';

// ============================================================
// Editar a animação NO VÍDEO, como num editor: com a animação selecionada
// na timeline, cada peça dela (título, chamada, número, cards, etiquetas)
// vira uma caixa no palco:
//
//   - tocar seleciona a peça de cima; tocar DE NOVO sobe um nível (texto ->
//     conjunto -> card -> animação inteira); a lista de Camadas escolhe com
//     precisão. Uma etiqueta presa na seleção tem mover (só move, sem
//     mudar o tamanho), conjunto, editar texto e "várias";
//   - várias: cada toque junta ou tira uma peça; elas movem e crescem juntas
//     (em volta do centro comum, a moldura delas tem as alças);
//   - arrastar dentro do que está selecionado move a seleção (o conjunto vai
//     junto mesmo pegando em cima do texto dele); a alça do canto (ou
//     A−/A+) muda o tamanho (proporcional);
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
import { IconeCamadas, IconeConjunto, IconeMover, IconeRenomear, IconeVarios } from '../icones';
import { rastro } from '../../lib/diagnostico';

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
/** Como cada campo de texto aparece na lista de camadas. */
const NOMES_DOS_CAMPOS: Record<string, string> = {
  titulo: 'Título',
  kicker: 'Texto de cima',
  detalhe: 'Detalhe',
  numero: 'Número',
  a: 'Texto A',
  b: 'Texto B',
  antes: 'Antes',
  depois: 'Depois',
};
/** Como cada conjunto conhecido aparece (pela classe da peça, a chave antes do ponto). */
const NOMES_DOS_CONJUNTOS: Record<string, string> = {
  'mg-caixa': 'Cartão',
  'mo-card': 'Cartão',
  'alerta-topo': 'Ícone e texto',
  'ico-txt': 'Ícone e texto',
  'anel-txt': 'Texto do anel',
  'mg-linhas': 'Título',
};
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
  // As peças selecionadas (uma, ou várias que mudam juntas).
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const selRef = useRef(selecionadas);
  selRef.current = selecionadas;
  // "Vários": cada toque junta (ou tira) uma peça da seleção.
  const [varios, setVarios] = useState(false);
  const [verCamadas, setVerCamadas] = useState(false);
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
  // Quando acabou o último toque: um segundo toque rápido é o toque duplo (editar o texto), não subir.
  const ultimoToque = useRef(0);
  // O zoom de agora (gestos seguidos partem dele sem esperar o redesenho) e o começo da pinça.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pinca = useRef<{ inicio: ZoomDoPalco; mx: number; my: number; d: number } | null>(null);
  const [barras, setBarras] = useState<HTMLElement | null>(null);
  useEffect(() => setBarras(quadro.current), [quadro]);
  // Diagnóstico remoto: a edição da animação abriu e fechou, e quantas peças ela tem.
  useEffect(() => {
    rastro('edicao-da-animacao', { aberta: true });
    return () => rastro('edicao-da-animacao', { aberta: false });
  }, []);
  useEffect(() => {
    rastro('pecas-da-animacao', { n: pecas.length });
  }, [pecas.length]);
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
  // A seleção fica enquanto a animação recarrega (as peças somem por um instante); sai a peça que não existe mais.
  useEffect(() => {
    if (!pecas.length) return;
    const ficam = selecionadas.filter((k) => pecas.some((p) => p.chave === k));
    if (ficam.length !== selecionadas.length) setSelecionadas(ficam);
  }, [pecas, selecionadas]);
  // Esticar muda o tamanho a partir de onde o layout ancora a peça (a esquerda, o centro...):
  // a cada relato do iframe, a posição é corrigida para o lado oposto ficar onde estava.
  const corrigir = useRef<(lista: readonly PecaDaAnimacao[]) => void>(() => undefined);
  useEffect(() => corrigir.current(pecas), [pecas]);

  // ---------- A hierarquia ----------
  const porChave = new Map(pecas.map((p) => [p.chave, p]));
  const ancestrais = (chave: string) => {
    const lista: string[] = [];
    for (let pai = porChave.get(chave)?.pai ?? null; pai && lista.length < 20; pai = porChave.get(pai)?.pai ?? null) lista.push(pai);
    return lista;
  };
  const parentes = (a: string, b: string) => ancestrais(a).includes(b) || ancestrais(b).includes(a);
  const filhosDe = (chave: string) => pecas.filter((p) => p.pai === chave);
  // A ordem das caixas (a última fica por cima): pela hierarquia, não pelo tamanho -- a animação
  // inteira embaixo de tudo, cada grupo embaixo das suas peças.
  const profundidade = (p: PecaDaAnimacao) => (p.chave === 'cena' ? -1 : ancestrais(p.chave).length);
  const ordem = [...pecas].sort((a, b) => profundidade(a) - profundidade(b) || b.w * b.h - a.w * a.h);

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
  /** A caixa que junta as peças (px do quadro de 1080x1920). */
  const caixaDe = (chaves: readonly string[]) => {
    const ps = chaves.map((k) => porChave.get(k)).filter((p): p is PecaDaAnimacao => !!p);
    if (!ps.length) return null;
    const x = Math.min(...ps.map((p) => p.x));
    const y = Math.min(...ps.map((p) => p.y));
    return { x, y, w: Math.max(...ps.map((p) => p.x + p.w)) - x, h: Math.max(...ps.map((p) => p.y + p.h)) - y };
  };
  /** As peças debaixo do dedo, da de cima (a mais funda) para a animação inteira. */
  const debaixoDoDedo = (clientX: number, clientY: number) => {
    const m = escala();
    if (!m) return [];
    const fx = (clientX - m.q.left) * m.sx;
    const fy = (clientY - m.q.top) * m.sy;
    // Uma folga de 6 px da tela: a peça fina (uma linha, um ícone pequeno) também se pega.
    const folga = 6 * m.sx;
    return ordem
      .filter((p) => fx >= p.x - folga && fx <= p.x + p.w + folga && fy >= p.y - folga && fy <= p.y + p.h + folga)
      .reverse()
      .map((p) => p.chave);
  };
  /**
   * Quanto o que está em volta da peça a amplia (um conjunto aumentado, a cena): o ajuste
   * dela vale dentro disso, e mover 30 px no quadro é mover 30/k px no ajuste. Sem isso a
   * peça dentro de um conjunto aumentado andava mais que o dedo.
   */
  const fatorDoPai = (chave: string, a: AjusteDaCena = atual) => {
    const p = porChave.get(chave);
    if (!p || chave === 'cena' || !p.lw) return 1;
    const k = p.w / (p.lw * daPeca(chave, a).escala);
    // Fora disso a medida não é de escala (peça girada, ainda entrando): melhor não corrigir.
    return k >= 0.4 && k <= 3 ? k : 1;
  };
  /** Junta uma peça à seleção: sai quem a contém ou está dentro dela (mudar os dois dobraria o ajuste). */
  const juntar = (lista: readonly string[], chave: string) => [...lista.filter((k) => k !== chave && !parentes(k, chave)), chave];

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

  /**
   * Arrasta as peças (todas juntas, sem mudar o tamanho). Um segundo dedo vira a pinça da
   * vista (e as peças voltam para onde estavam). Soltou sem arrastar: `aoTocar`.
   */
  const arrastar = (e: React.PointerEvent, chaves: readonly string[], aoTocar?: () => void) => {
    const m = escala();
    if (!m) return;
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const inicioDoAjuste = atualRef.current;
    const pendenteNoInicio = pendente;
    const inicios = chaves.map((k) => [k, { ...daPeca(k, inicioDoAjuste) }, fatorDoPai(k, inicioDoAjuste)] as const);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moveu = false;
    let pincou = false;
    const aoMover = (ev: PointerEvent) => {
      if (!dedos.current.has(ev.pointerId)) return;
      dedos.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (dedos.current.size >= 2) {
        if (!pincou && moveu) {
          atualRef.current = inicioDoAjuste;
          setPendente(pendenteNoInicio);
          onAoVivo(cssDoAjuste(lerAjuste(inicioDoAjuste)));
        }
        pincou = true;
        pincar();
        return;
      }
      // Depois da pinça, o dedo que ficou não arrasta as peças.
      if (pincou) return;
      moveu = moveu || Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 3;
      if (!moveu) return;
      const dx = (ev.clientX - x0) * m.sx;
      const dy = (ev.clientY - y0) * m.sy;
      let a = inicioDoAjuste;
      for (const [k, p, f] of inicios) a = comPeca(k, { ...p, x: Math.round(p.x + dx / f), y: Math.round(p.y + dy / f) }, a);
      aoVivo(a);
    };
    const aoSoltar = (ev: PointerEvent) => {
      dedos.current.delete(ev.pointerId);
      pinca.current = null;
      if (dedos.current.size) return;
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
      if (!moveu && !pincou && ev.type === 'pointerup') aoTocar?.();
      ultimoToque.current = performance.now();
    };
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
  };

  /**
   * Tocou no palco onde há peças. Arrastar dentro do que está selecionado move a
   * seleção inteira (o conjunto vai junto mesmo pegando em cima do texto dele).
   * Tocar de novo no selecionado sobe um nível: texto -> conjunto -> card -> tudo.
   */
  const tocarPeca = (e: React.PointerEvent, lista: readonly string[]) => {
    const atuais = selRef.current;
    const topo = lista[0]!;
    const pegou = lista.find((k) => atuais.includes(k));
    const rapido = performance.now() - ultimoToque.current < 350;
    if (varios) {
      // Vários: tocar junta a peça de cima; tocar numa que já está, tira.
      const jaEstava = atuais.includes(topo);
      const novas = jaEstava ? atuais : juntar(atuais, topo);
      if (!jaEstava) setSelecionadas(novas);
      arrastar(e, novas, () => {
        if (jaEstava) setSelecionadas(selRef.current.filter((k) => k !== topo));
      });
      return;
    }
    if (pegou) {
      arrastar(e, atuais, () => {
        if (rapido) return;
        // Sobe: a próxima peça debaixo do dedo, acima da selecionada (e da animação inteira, volta à de cima).
        const i = lista.indexOf(atuais.length === 1 ? atuais[0]! : pegou);
        setSelecionadas([lista[(i + 1) % lista.length]!]);
      });
      return;
    }
    setSelecionadas([topo]);
    setEditando(null);
    arrastar(e, [topo]);
  };

  /**
   * A alça do canto: a escala segue a distância do centro da seleção ao ponteiro.
   * Várias peças crescem juntas em volta do centro comum (as distâncias entre elas também).
   */
  const redimensionar = (chaves: readonly string[]) => (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const m = escala();
    const caixa = caixaDe(chaves);
    if (!m || !caixa) return;
    const centro = { x: m.q.left + (caixa.x + caixa.w / 2) / m.sx, y: m.q.top + (caixa.y + caixa.h / 2) / m.sy };
    // A distância inicial nunca é menor que a meia diagonal: soltar perto do centro não encolhe ao mínimo.
    const meiaDiagonal = Math.hypot(caixa.w / m.sx, caixa.h / m.sy) / 2;
    const d0 = Math.max(meiaDiagonal * 0.6, 12, Math.hypot(e.clientX - centro.x, e.clientY - centro.y));
    const inicioDoAjuste = atualRef.current;
    const aoMover = (ev: PointerEvent) => aoVivo(escalarJuntas(chaves, Math.hypot(ev.clientX - centro.x, ev.clientY - centro.y) / d0, inicioDoAjuste));
    const aoSoltar = () => {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
    };
    window.addEventListener('pointercancel', aoSoltar);
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };
  /** O ajuste com as peças `fator` vezes maiores, em volta do centro da caixa delas. */
  const escalarJuntas = (chaves: readonly string[], fator: number, a: AjusteDaCena): AjusteDaCena => {
    const caixa = caixaDe(chaves);
    if (!caixa) return a;
    const escalas = chaves.map((k) => daPeca(k, a).escala);
    // O fator vale igual para todas: nenhuma passa do mínimo nem do máximo.
    const f = limitar(fator, Math.max(...escalas.map((s) => MINIMO / s)), Math.min(...escalas.map((s) => 4 / s)));
    const gx = caixa.x + caixa.w / 2;
    const gy = caixa.y + caixa.h / 2;
    let novo = a;
    for (const chave of chaves) {
      const p = daPeca(chave, a);
      const b = porChave.get(chave);
      // Uma peça só: cresce no lugar. Várias: o centro de cada uma se afasta do centro comum.
      const k = fatorDoPai(chave, a);
      const dx = b && chaves.length > 1 ? ((b.x + b.w / 2 - gx) * (f - 1)) / k : 0;
      const dy = b && chaves.length > 1 ? ((b.y + b.h / 2 - gy) * (f - 1)) / k : 0;
      novo = comPeca(chave, { ...p, x: Math.round(p.x + dx), y: Math.round(p.y + dy), escala: Math.round(p.escala * f * 100) / 100 }, novo);
    }
    return novo;
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

  const mudarTamanho = (chaves: readonly string[], fator: number) => aoVivo(escalarJuntas(chaves, fator, atual));
  const restaurar = (chaves: readonly string[]) => {
    let a = atual;
    for (const chave of chaves) {
      if (chave === 'cena') a = { ...a, ...NEUTRO };
      else {
        const { [chave]: _fora, ...resto } = a.elementos ?? {};
        a = { ...a, elementos: resto };
      }
    }
    aoVivo(a);
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
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const inicio = zoomRef.current;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moveu = false;
    let pincou = false;
    const aoMover = (ev: PointerEvent) => {
      if (!dedos.current.has(ev.pointerId)) return;
      dedos.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (dedos.current.size >= 2) {
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
        setSelecionadas([]);
        setEditando(null);
      }
    };
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
  };

  // O tamanho da peça na tela (com o zoom), para saber se as alças cabem nela.
  const cabeAlca = (p: PecaDaAnimacao) => {
    const q = quadro.current;
    if (!q) return true;
    return (p.w / W) * q.clientWidth * zoom.z >= 44 && (p.h / H) * q.clientHeight * zoom.z >= 28;
  };
  const sel = selecionadas.length === 1 ? (porChave.get(selecionadas[0]!) ?? null) : null;
  const caixaDaSelecao = caixaDe(selecionadas);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  // Nomes para a lista de camadas: o campo do texto, ou o que a peça é.
  const nomes = new Map<string, string>();
  {
    const contagem = new Map<string, number>();
    for (const p of pecas) {
      const tipo =
        p.chave === 'cena'
          ? 'Animação inteira'
          : (NOMES_DOS_CONJUNTOS[p.chave.split('.')[0]!] ?? (p.campo ? (NOMES_DOS_CAMPOS[p.campo] ?? p.campo) : filhosDe(p.chave).length ? 'Conjunto' : 'Figura'));
      const n = (contagem.get(tipo) ?? 0) + 1;
      contagem.set(tipo, n);
      nomes.set(p.chave, n > 1 ? `${tipo} ${n}` : tipo);
    }
  }
  const camadas: Array<{ p: PecaDaAnimacao; nivel: number }> = [];
  const descer = (pai: string | null, nivel: number) => {
    for (const p of pecas.filter((q) => (q.pai ?? null) === pai && !camadas.some((c) => c.p.chave === q.chave))) {
      camadas.push({ p, nivel });
      if (nivel < 12) descer(p.chave, nivel + 1);
    }
  };
  descer(null, 0);
  for (const p of pecas) if (!camadas.some((c) => c.p.chave === p.chave)) camadas.push({ p, nivel: 1 });
  const escolherCamada = (chave: string) => {
    setEditando(null);
    setSelecionadas(varios ? (selecionadas.includes(chave) ? selecionadas.filter((k) => k !== chave) : juntar(selecionadas, chave)) : [chave]);
  };

  // A etiqueta da seleção, presa em cima dela (px do quadro, já com o zoom da vista).
  const etiqueta = (() => {
    const q = quadro.current;
    // Com a lista de camadas aberta, a etiqueta sairia por cima dela.
    if (!caixaDaSelecao || !q || editando || verCamadas) return null;
    const qw = q.clientWidth;
    const qh = q.clientHeight;
    const emX = (fx: number) => zoom.x + zoom.z * ((fx / W) * qw);
    const emY = (fy: number) => zoom.y + zoom.z * ((fy / H) * qh);
    // A largura da etiqueta (botões de 36 px e o nome): ela nunca sai cortada pela borda do quadro.
    const nome = selecionadas.length > 1 ? `${selecionadas.length} peças` : (nomes.get(selecionadas[0]!) ?? '');
    const botoes = 2 + (sel?.pai ? 1 : 0) + (sel && cena && sel.campo ? 1 : 0);
    const meia = (botoes * 38 + 10 + Math.min(134, nome.length * 7.5 + 14)) / 2;
    const cx = limitar(emX(caixaDaSelecao.x + caixaDaSelecao.w / 2), meia + 4, Math.max(meia + 4, qw - meia - 4));
    const cima = emY(caixaDaSelecao.y) - 50;
    // Sem lugar em cima (a barra da peça mora no topo): embaixo da seleção.
    const top = cima >= 64 ? cima : emY(caixaDaSelecao.y + caixaDaSelecao.h) + 10;
    // Nunca em cima do pé do quadro: o "Aplicar" e o "voltar" do zoom moram lá.
    const embaixo = qh - 52 - (pendente ? 52 : 0) - (zoom.z > 1 ? 46 : 0);
    return { left: cx, top: limitar(top, 64, Math.max(64, embaixo)) };
  })();

  return (
    <div
      className="palco__edicao-animacao"
      data-varios={varios || undefined}
      onPointerDown={(e) => {
        // As barras moram fora (portal), mas o toque nelas também sobe até aqui.
        if (!raiz.current?.contains(e.target as Node)) return;
        // Segundo dedo: a pinça continua valendo.
        if (dedos.current.size) {
          dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          comecarPinca();
          return;
        }
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        e.preventDefault();
        const lista = debaixoDoDedo(e.clientX, e.clientY);
        if (lista.length) tocarPeca(e, lista);
        else arrastarVista(e);
      }}
      onDoubleClick={(e) => {
        // Toque duplo: edita o texto debaixo do dedo.
        const p = debaixoDoDedo(e.clientX, e.clientY)
          .map((k) => porChave.get(k))
          .find((q) => !!q?.campo);
        if (!p || !cena) return;
        setSelecionadas([p.chave]);
        comecarTexto(p);
      }}
      ref={raiz}
    >
      {ordem.map((p) => {
        const marcada = selecionadas.includes(p.chave);
        // As alças só aparecem numa peça que cabe o dedo: numa pequena elas cobriam a peça toda e
        // o toque (de novo, para o conjunto) caía nelas. Ampliar a vista as traz de volta.
        const unica = marcada && selecionadas.length === 1 && cabeAlca(p);
        // A cena inteira e as linhas em máscara não esticam: só movem e escalam.
        const estica = unica && p.chave !== 'cena' && !p.mascara;
        return (
          <div
            key={p.chave}
            role="button"
            tabIndex={0}
            className="palco__peca"
            data-selecionado={marcada || undefined}
            data-grupo={p.chave === 'cena' || filhosDe(p.chave).length > 0 || undefined}
            aria-label={`Selecionar: ${nomes.get(p.chave) ?? p.chave}`}
            title="Toque para selecionar · toque de novo para o conjunto · arraste para mover · toque duplo para editar o texto · pinça para ampliar a vista"
            style={{ left: pct(p.x, W), top: pct(p.y, H), width: pct(p.w, W), height: pct(p.h, H) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') comecarTexto(p);
              if (e.key === '+' || e.key === '=') mudarTamanho(selecionadas.length ? selecionadas : [p.chave], 1.1);
              if (e.key === '-') mudarTamanho(selecionadas.length ? selecionadas : [p.chave], 1 / 1.1);
            }}
          >
            {unica && (['ne', 'nw', 'se', 'sw'] as const).map((canto) => <span key={canto} className={`palco__canto palco__canto--${canto}`} aria-hidden onPointerDown={redimensionar([p.chave])} />)}
            {estica &&
              (['n', 's', 'e', 'w'] as const).map((lado) => (
                <span key={lado} className={`palco__lado palco__lado--${lado}`} aria-hidden title={lado === 'e' || lado === 'w' ? 'Esticar a largura' : 'Esticar a altura'} onPointerDown={esticar(p, lado)} />
              ))}
          </div>
        );
      })}

      {/* Várias peças: uma moldura em volta de todas, com as alças que mudam o tamanho do conjunto. */}
      {selecionadas.length > 1 && caixaDaSelecao && (
        <div
          className="palco__selecao-multipla"
          aria-hidden
          style={{ left: pct(caixaDaSelecao.x, W), top: pct(caixaDaSelecao.y, H), width: pct(caixaDaSelecao.w, W), height: pct(caixaDaSelecao.h, H) }}
        >
          {cabeAlca({ chave: '', campo: '', ...caixaDaSelecao }) &&
            (['ne', 'nw', 'se', 'sw'] as const).map((canto) => (
              <span key={canto} className={`palco__canto palco__canto--${canto}`} onPointerDown={redimensionar(selecionadas)} />
            ))}
        </div>
      )}

      {/* As barras moram no quadro, fora da vista ampliada: não crescem nem saem da tela com o zoom. */}
      {barras &&
        createPortal(
          <>
            {etiqueta && (
              <div className="palco__etiqueta-da-selecao" role="toolbar" aria-label="A peça selecionada" style={{ left: etiqueta.left, top: etiqueta.top }}>
                <button
                  type="button"
                  className="palco__etiqueta-botao palco__etiqueta-botao--mover"
                  aria-label="Mover (arraste)"
                  title="Arraste para mover sem mudar o tamanho"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    arrastar(e, selecionadas);
                  }}
                >
                  <IconeMover size={18} weight="bold" />
                </button>
                {sel?.pai && (
                  <button type="button" className="palco__etiqueta-botao" aria-label="Selecionar o conjunto" title="Selecionar o conjunto que contém esta peça" onClick={() => setSelecionadas([sel.pai!])}>
                    <IconeConjunto size={18} />
                  </button>
                )}
                {sel && cena && sel.campo && (
                  <button type="button" className="palco__etiqueta-botao" aria-label="Editar o texto" title="Editar o texto" onClick={() => comecarTexto(sel)}>
                    <IconeRenomear size={18} />
                  </button>
                )}
                <button
                  type="button"
                  className="palco__etiqueta-botao"
                  aria-pressed={varios}
                  aria-label="Selecionar várias"
                  title="Selecionar várias: cada toque junta ou tira uma peça"
                  onClick={() => setVarios((v) => !v)}
                >
                  <IconeVarios size={18} />
                </button>
                <span className="palco__etiqueta-nome">{selecionadas.length > 1 ? `${selecionadas.length} peças` : (nomes.get(selecionadas[0]!) ?? '')}</span>
              </div>
            )}

            {!editando && (
              <div className="palco__barra-da-peca" role="toolbar" aria-label="Ajustar a peça">
                {selecionadas.length > 0 && (
                  <>
                    <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Diminuir" title="Diminuir" onClick={() => mudarTamanho(selecionadas, 1 / 1.15)}>
                      A−
                    </button>
                    <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Aumentar" title="Aumentar" onClick={() => mudarTamanho(selecionadas, 1.15)}>
                      A+
                    </button>
                    {selecionadas.some(mudou) && (
                      <button type="button" className="botao-link" onClick={() => restaurar(selecionadas)}>
                        Original
                      </button>
                    )}
                  </>
                )}
                <button type="button" className="botao-link palco__ver-camadas" aria-pressed={verCamadas} onClick={() => setVerCamadas((v) => !v)}>
                  <IconeCamadas size={15} /> Camadas
                </button>
                {verCamadas && (
                  <ul className="palco__lista-de-pecas" aria-label="As peças da animação">
                    {camadas.map(({ p, nivel }) => (
                      <li key={p.chave}>
                        <button
                          type="button"
                          className="palco__item-de-peca"
                          aria-pressed={selecionadas.includes(p.chave)}
                          style={{ paddingLeft: 8 + nivel * 14 }}
                          onClick={() => escolherCamada(p.chave)}
                        >
                          {nomes.get(p.chave)}
                        </button>
                      </li>
                    ))}
                  </ul>
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
