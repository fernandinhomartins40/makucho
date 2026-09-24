'use client';

// ============================================================
// Amostras REAIS dos estilos: desenhadas pelo libass, não imitadas.
//
// Os cartões de estilo eram CSS -- rápidos, mas mentiam: tamanho maior
// que o do vídeo, destaque da palavra com outro formato, estilos finos
// parecendo fortes. Aqui cada estilo é desenhado pelo MESMO libass da
// prévia e do render (JASSUB), a partir do MESMO .ass que `gerarAss`
// produz, e o quadro é copiado para uma imagem.
//
// Uma instância só, escondida, desenha os estilos um a um e é
// destruída no fim: nada de um worker por cartão. Todas as imagens são
// recortadas pela MESMA caixa (a união do que foi desenhado), então o
// tamanho de um estilo ao lado do outro também é o de verdade.
// ============================================================

import { useEffect, useState } from 'react';
import type { EditPlanV1, EstiloDoTexto, MarcaDoVideo, PalavraDaTranscricao } from '@makucho/studio-contracts';
import { CORES_PADRAO_DA_MARCA, gerarAss, resolverEstiloDaLegenda } from '@makucho/studio-contracts';
import { FONTES, fontesDoAss } from './CamadaDeLegendas';

export interface PedidoDeAmostra {
  chave: string;
  ass: string;
  /** Instante desenhado (depois da entrada, antes da saída). */
  tempoMs: number;
}

const LARGURA = 1080;
const ALTURA = 1920;

/** Um plano mínimo, só para gerar o .ass de uma amostra. */
function planoDeAmostra(mudar: (p: EditPlanV1) => EditPlanV1): EditPlanV1 {
  return mudar({
    schemaVersion: '1.0',
    projectId: 'amostra',
    sourceMediaId: 'amostra',
    sourceDurationMs: 4000,
    fps: 30,
    canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
    targetDurationMs: 4000,
    framework: 'authority_education',
    clips: [
      { id: 'c', sourceStartMs: 0, sourceEndMs: 4000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s'], semanticRisk: 'low', reason: 'amostra' },
    ],
    captions: { enabled: false, styleId: 'padrao', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
    overlays: [],
    soundEffects: [],
    transitions: [],
    render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
  } as EditPlanV1);
}

/** O .ass de um estilo de legenda, com a 3ª palavra sendo falada. */
export function assDeLegenda(
  styleId: string,
  marca: MarcaDoVideo | undefined,
  captions: Partial<EditPlanV1['captions']> = {},
  texto: [string, string, string] = ['Ideia', 'que', 'engaja'],
): PedidoDeAmostra {
  const palavras: PalavraDaTranscricao[] = [
    { id: 'w1', startMs: 0, endMs: 400, word: texto[0] },
    { id: 'w2', startMs: 400, endMs: 800, word: texto[1] },
    { id: 'w3', startMs: 800, endMs: 1700, word: texto[2] },
  ];
  const m = marca ?? { cores: CORES_PADRAO_DA_MARCA };
  const plano = planoDeAmostra((p) => ({ ...p, captions: { ...p.captions, ...captions, enabled: true, styleId, wordsPerBlock: 3 } }));
  const estilo = resolverEstiloDaLegenda(styleId, { marca: m, escala: plano.captions.sizeScale ?? 1 });
  return { chave: styleId, ass: gerarAss({ plano, estilo, palavras, marca: m }), tempoMs: 1150 };
}

/** O .ass de um texto de tela (título, destaque...) com um estilo. */
export function assDeTexto(
  chave: string,
  componente: string,
  texto: string,
  estilo: EstiloDoTexto,
  marca: MarcaDoVideo | undefined,
): PedidoDeAmostra {
  const m = marca ?? { cores: CORES_PADRAO_DA_MARCA };
  const plano = planoDeAmostra((p) => ({
    ...p,
    overlays: [
      {
        id: 'amostra',
        component: componente as EditPlanV1['overlays'][number]['component'],
        text: texto,
        timelineStartMs: 0,
        durationMs: 3000,
        // No centro, sem saída: o quadro desenhado é o do texto parado.
        style: { ...estilo, x: 0.5, y: 0.5, saida: 'nenhuma' },
      },
    ],
  }));
  const estiloDaLegenda = resolverEstiloDaLegenda('padrao', { marca: m });
  return { chave, ass: gerarAss({ plano, estilo: estiloDaLegenda, palavras: [], marca: m }), tempoMs: 1300 };
}

interface Jassub {
  ready: Promise<void>;
  renderer: { setTrack(conteudo: string): Promise<void> | void; addFonts?(fontes: string[]): Promise<boolean> };
  manualRender(dados: { expectedDisplayTime: number; width: number; height: number; mediaTime: number }, repaint?: boolean): Promise<void>;
  destroy(): Promise<void>;
}

const esperarQuadro = () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok())));

/** Desenha os pedidos com o libass e devolve uma imagem (dataURL) por chave. */
async function desenhar(pedidos: readonly PedidoDeAmostra[], sinal: { cancelado: boolean }): Promise<Map<string, string>> {
  const canvas = document.createElement('canvas');
  // Fora da tela, mas com tamanho: o JASSUB desenha no tamanho exibido.
  Object.assign(canvas.style, { position: 'fixed', left: '-10000px', top: '0', width: `${LARGURA / 2}px`, height: `${ALTURA / 2}px`, pointerEvents: 'none' });
  document.body.appendChild(canvas);

  const { default: JASSUB } = await import('jassub');
  const fontes = [...new Set(pedidos.flatMap((p) => fontesDoAss(p.ass)))];
  const j = new JASSUB({ canvas, subContent: pedidos[0]!.ass, fonts: fontes, availableFonts: FONTES, queryFonts: false }) as unknown as Jassub;
  const copias = new Map<string, HTMLCanvasElement>();
  try {
    await j.ready;
    const w = LARGURA / 2;
    const h = ALTURA / 2;
    // Aquecimento: o primeiro quadro sai antes das fontes estarem prontas
    // (vazio). Desenha uma vez e descarta.
    await j.manualRender({ expectedDisplayTime: performance.now(), width: LARGURA, height: ALTURA, mediaTime: pedidos[0]!.tempoMs / 1000 }, true);
    await esperarQuadro();
    await new Promise((ok) => setTimeout(ok, 150));
    for (const p of pedidos) {
      if (sinal.cancelado) break;
      await j.renderer.setTrack(p.ass);
      await j.manualRender({ expectedDisplayTime: performance.now(), width: LARGURA, height: ALTURA, mediaTime: p.tempoMs / 1000 }, true);
      await esperarQuadro();
      const copia = document.createElement('canvas');
      copia.width = w;
      copia.height = h;
      copia.getContext('2d')!.drawImage(canvas, 0, 0, w, h);
      copias.set(p.chave, copia);
    }
  } finally {
    void j.destroy().catch(() => undefined);
    canvas.remove();
  }

  // A mesma caixa para todos: a união do que foi desenhado, com folga.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (const c of copias.values()) {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let y = 0; y < c.height; y += 2) {
      for (let x = 0; x < c.width; x += 2) {
        if (d[(y * c.width + x) * 4 + 3]! > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
  }
  const imagens = new Map<string, string>();
  if (x1 < 0) return imagens;
  const folga = 14;
  x0 = Math.max(0, x0 - folga);
  y0 = Math.max(0, y0 - folga);
  x1 = Math.min(LARGURA / 2, x1 + folga);
  y1 = Math.min(ALTURA / 2, y1 + folga);
  // Proporção mínima de cartão (nada de fatia fininha).
  const larguraMin = (y1 - y0) * 1.6;
  if (x1 - x0 < larguraMin) {
    const meio = (x0 + x1) / 2;
    x0 = Math.max(0, meio - larguraMin / 2);
    x1 = Math.min(LARGURA / 2, meio + larguraMin / 2);
  }
  for (const [chave, c] of copias) {
    const recorte = document.createElement('canvas');
    recorte.width = Math.round(x1 - x0);
    recorte.height = Math.round(y1 - y0);
    recorte.getContext('2d')!.drawImage(c, x0, y0, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height);
    imagens.set(chave, recorte.toDataURL('image/png'));
  }
  return imagens;
}

/**
 * As amostras reais dos pedidos. `null` enquanto desenha (ou se o
 * navegador não tem o necessário): o cartão mostra a reserva em CSS.
 */
export function useAmostrasReais(pedidos: readonly PedidoDeAmostra[]): Map<string, string> | null {
  const [imagens, setImagens] = useState<Map<string, string> | null>(null);
  // Uma chave estável do conteúdo: redesenha só quando algo muda.
  const assinatura = pedidos.map((p) => `${p.chave}:${p.tempoMs}:${p.ass.length}:${hash(p.ass)}`).join('|');
  useEffect(() => {
    if (!pedidos.length || typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') return;
    const sinal = { cancelado: false };
    // Um instante depois: trocar vários ajustes seguidos desenha uma vez.
    const espera = setTimeout(() => {
      desenhar(pedidos, sinal)
        .then((m) => !sinal.cancelado && m.size && setImagens(m))
        .catch(() => undefined);
    }, 250);
    return () => {
      sinal.cancelado = true;
      clearTimeout(espera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);
  return imagens;
}

function hash(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i += 1) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return h;
}
