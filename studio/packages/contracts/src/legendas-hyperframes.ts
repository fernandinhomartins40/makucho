// ============================================================
// MAKUCHO STUDIO - As legendas do HyperFrames (caption-*: Highlight,
// Clip Wipe, Neon, Glitch, Pill Karaoke...) com as palavras do vídeo.
//
// Uma legenda do HyperFrames é uma composição HTML/GSAP. Aqui ela vira
// camadas VIRTUAIS de animação (kind 'html'), em pedaços de até 20 s,
// montadas pelo mesmo montador de componentes: a prévia, a exportação e
// o render já sabem mostrar, preparar e sobrepor animações em HTML.
// Os blocos são os da nossa legenda (palavras por bloco, correções,
// ocultas, manuais), e a altura de cada um segue a nossa regra -- geral,
// por trecho e a faixa da grade durante as animações.
// ============================================================

import type { EditPlanV1 } from './edit-plan';
import type { CamadaDeMidia } from './midias';
import { baseDaLegendaNoInstante, montarBlocos, type PalavraDaTranscricao } from './legendas-ass';
import { resolverEstiloDaLegenda } from './estilos-de-legenda';
import { legendaHyperFrames } from './legendas-hyperframes-catalogo';

/** Duração máxima de cada pedaço (o render do HyperFrames leva ~7 s por segundo de vídeo). */
const PEDACO_MS = 20_000;
const H = 1920;

/** A base do bloco de legenda pela posição geral (0 topo, 1 pé). */
function baseGeral(plano: EditPlanV1): number {
  const c = plano.captions;
  if (c.y !== undefined) return c.y;
  return c.position === 'top' ? 0.3 : c.position === 'center' ? 0.56 : 0.76;
}

const atributo = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');

/** Id das camadas virtuais da legenda (para a exportação e o render reconhecerem). */
export const PREFIXO_DA_LEGENDA_HF = 'legenda-hf-';

/**
 * As camadas de animação que desenham a legenda com um estilo do
 * HyperFrames. Vazio quando a legenda está desligada ou é a do Studio.
 */
export function camadasDaLegendaHyperFrames(
  plano: EditPlanV1,
  palavras: readonly PalavraDaTranscricao[],
  clipsDesligados: readonly string[] = [],
): CamadaDeMidia[] {
  const estilo = legendaHyperFrames(plano.captions.hyperframes);
  if (!plano.captions.enabled || !estilo || plano.canvas.aspectRatio !== '9:16') return [];
  const blocos = montarBlocos({ plano, estilo: resolverEstiloDaLegenda(plano.captions.styleId), palavras, clipsDesligados: [...clipsDesligados] });
  if (!blocos.length) return [];

  // Pedaços que respeitam os blocos (um bloco nunca é cortado ao meio).
  const pedacos: Array<typeof blocos> = [];
  for (const b of blocos) {
    const atual = pedacos[pedacos.length - 1];
    if (atual && b.fimMs - atual[0]!.inicioMs <= PEDACO_MS) atual.push(b);
    else pedacos.push([b]);
  }

  const geral = baseGeral(plano);
  const fontes = estilo.fontes.map((f) => `"${f}"`).join(', ');
  return pedacos.map((pedaco, i) => {
    const inicio = Math.max(0, pedaco[0]!.inicioMs - 100);
    const fim = pedaco[pedaco.length - 1]!.fimMs + 500;
    const s = (ms: number) => Math.max(0, Math.round(ms - inicio) / 1000);
    const lista: Array<{ text: string; start: number; end: number }> = [];
    const grupos: Array<[number, number]> = [];
    const destaques: number[] = [];
    const posicoes: string[] = [];
    for (const b of pedaco) {
      const primeiro = lista.length;
      let maior = -1;
      b.palavras.forEach((p) => {
        if (maior < 0 || p.texto.length > lista[maior]!.text.length) maior = lista.length;
        lista.push({ text: p.texto, start: s(p.inicioMs), end: s(Math.max(p.fimMs, p.inicioMs + 80)) });
      });
      if (lista.length === primeiro) continue;
      grupos.push([primeiro, lista.length - 1]);
      if (maior >= 0 && lista[maior]!.text.length >= 5) destaques.push(maior);
      // A altura deste bloco: a do trecho ou a da grade da animação, se houver.
      const base = baseDaLegendaNoInstante(plano, b.inicioMs) ?? geral;
      posicoes.push(`tl.set('#leg', { y: ${Math.round((base - geral) * H)} }, ${s(b.inicioMs)});`);
    }
    const duracaoMs = fim - inicio;
    // O mesmo agrupamento no formato de objeto que alguns estilos usam.
    const gruposObj = grupos.map(([a, b], gi) => {
      const proximo = grupos[gi + 1];
      const fimDoGrupo = proximo ? lista[proximo[0]]!.start - 0.05 : lista[b]!.end + 0.4;
      return { wordStart: a, wordEnd: b, start: lista[a]!.start, end: Math.max(lista[b]!.end, fimDoGrupo) };
    });
    const vars = JSON.stringify({ palavras: lista, grupos, gruposObj, destaques, duracao: duracaoMs / 1000 });
    const composicao = {
      layout: 'tela_cheia' as const,
      semFundo: true,
      titulo: `Legenda ${i + 1}`,
      html: `<div id="leg" style="position:absolute;inset:0;--leg-bottom:${Math.round((1 - geral) * H)}px"><div data-hf="${estilo.nome}" data-inicio="0" data-duracao="${(duracaoMs / 1000).toFixed(2)}" data-vars='${atributo(vars)}' style="position:absolute;inset:0"></div></div>`,
      // As fontes do estilo, citadas para o documento carregá-las.
      css: `/* fontes da legenda: ${fontes} */ #leg { pointer-events: none; }`,
      script: posicoes.join('\n') || "tl.set('#leg', { y: 0 }, 0);",
    };
    return {
      id: `${PREFIXO_DA_LEGENDA_HF}${i}`,
      assetId: 'html',
      kind: 'html',
      timelineStartMs: inicio,
      durationMs: duracaoMs,
      layout: 'tela_cheia',
      composicao,
    } as CamadaDeMidia;
  });
}
