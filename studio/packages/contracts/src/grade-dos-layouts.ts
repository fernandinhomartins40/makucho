// ============================================================
// MAKUCHO STUDIO - A grade de segurança de cada layout (quadro 1080x1920).
//
// Uma animação divide o quadro com três coisas que ela não controla: a
// interface do app (Reels, TikTok, Shorts: o cabeçalho em cima; nome,
// legenda do post e botões embaixo e na coluna da direita), o logo da
// marca (canto de cima) e a legenda do vídeo. Sem uma grade, a IA punha
// título atrás do cabeçalho do app, conteúdo sob a legenda e texto sob a
// janela do vídeo.
//
// Aqui fica, em pixels, para cada layout: a área útil (onde o conteúdo
// principal vai), a faixa da legenda naquele momento, a área do vídeo e
// as áreas reservadas. A mesma conta serve à IA (texto com números), ao
// documento (variáveis de CSS), à legenda (a altura dela durante a
// animação), à conferência de sobreposição e ao editor (zonas seguras).
//
// Referências: title-safe de 80% (HyperFrames Studio, Premiere) e a
// regra do trilho de legenda da skill embedded-captions (no vertical,
// ~600-700 px acima da base, fora da interface do app).
// ============================================================

import type { ComposicaoHtml } from './animacao-html';

export const QUADRO_DA_GRADE = { w: 1080, h: 1920 } as const;

export interface Retangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** As constantes da grade (px no quadro 1080x1920). */
export const GRADE = {
  /** Margem lateral do conteúdo. */
  margemX: 64,
  /** Abaixo disto: fora do cabeçalho do app e do logo. */
  topo: 192,
  /** Acima disto: fora do nome, da legenda do post e dos botões do app. */
  base: 1600,
  /** A coluna de botões do app (curtir, comentar...) na metade de baixo. */
  colunaDoApp: { x: 944, y: 1000 },
  /** O logo da marca: canto superior direito, dentro do cabeçalho. */
  logo: { x: 780, y: 40, w: 260, h: 132 },
  /** A faixa padrão da legenda (a base do bloco em `legendaBase`). */
  legendaTopo: 1200,
  legendaBase: 1440,
  /** Meio a meio com o painel em cima: a legenda ocupa ± isto em volta da linha da divisão. */
  legendaCostura: 120,
  /** Folga entre áreas (px). */
  folga: 24,
} as const;

export interface GradeDoLayout {
  layout: string;
  /** Onde o conteúdo principal da animação vai (px no quadro). */
  util: Retangulo;
  /** Uma segunda área útil, quando o layout tem (cartão embaixo, faixa sob a legenda). */
  utilExtra?: Retangulo;
  /** Onde a legenda do vídeo fica enquanto a animação passa. */
  legenda: Retangulo;
  /** A base do bloco de legenda, em fração do quadro (0 topo, 1 pé). */
  baseDaLegenda: number;
  /** Onde o vídeo com o rosto aparece (meio a meio e pip). */
  video?: Retangulo;
  /** O que a animação não pode cobrir com texto. */
  reservadas: Array<{ nome: string; r: Retangulo }>;
}

const { w: W, h: H } = QUADRO_DA_GRADE;
const faixaDaLegenda = (topo: number, base: number): Retangulo => ({ x: GRADE.margemX, y: topo, w: W - 2 * GRADE.margemX, h: base - topo });

/**
 * A janela do vídeo no pip, em frações do quadro (x, y de cima-esquerda).
 * Largura e altura na MESMA fração (a janela tem a proporção do quadro).
 * Em cima: logo abaixo do cabeçalho do app. Embaixo: acima da faixa da
 * legenda -- a janela nunca fica sob a legenda.
 */
export function janelaDoPip(canto: string | undefined, tamanho: number | undefined): Retangulo {
  const t = tamanho ?? 0.34;
  const w = t * W;
  const h = t * H;
  const x = (canto ?? 'inf-dir').endsWith('esq') ? GRADE.margemX : W - GRADE.margemX - w;
  const y = (canto ?? 'inf-dir').startsWith('sup') ? GRADE.topo : GRADE.legendaTopo - GRADE.folga - h;
  return { x, y, w, h };
}

/** A grade do layout de uma composição (px no quadro 1080x1920). */
export function gradeDaComposicao(c: Pick<ComposicaoHtml, 'layout' | 'lado' | 'divisao' | 'canto' | 'tamanhoPip'>): GradeDoLayout {
  const topoDoApp = { nome: 'cabeçalho do app e logo da marca', r: { x: 0, y: 0, w: W, h: GRADE.topo } };
  const baseDoApp = { nome: 'interface do app (nome, legenda do post, botões)', r: { x: 0, y: GRADE.base, w: W, h: H - GRADE.base } };
  const larguraUtil = W - 2 * GRADE.margemX;

  if (c.layout === 'meio_a_meio') {
    const d = c.divisao ?? 0.5;
    const painel = Math.round(d * H);
    if ((c.lado ?? 'cima') === 'cima') {
      // Painel em cima, rosto embaixo: a legenda fica SOBRE A LINHA da
      // divisão (metade no painel, metade no vídeo), longe do rosto -- na
      // faixa padrão ela caía bem na cara de quem fala.
      const legenda = faixaDaLegenda(painel - GRADE.legendaCostura, painel + GRADE.legendaCostura);
      return {
        layout: 'meio_a_meio (painel em cima)',
        util: { x: GRADE.margemX, y: GRADE.topo, w: larguraUtil, h: legenda.y - GRADE.folga - GRADE.topo },
        legenda,
        baseDaLegenda: (legenda.y + legenda.h) / H,
        video: { x: 0, y: painel, w: W, h: H - painel },
        reservadas: [topoDoApp, { nome: 'legenda do vídeo', r: legenda }],
      };
    }
    // Rosto em cima, painel embaixo: a legenda sobe para a base do vídeo.
    const baseDoVideo = H - painel;
    const legenda = faixaDaLegenda(baseDoVideo - 40 - 220, baseDoVideo - 40);
    const yUtil = baseDoVideo + 48;
    return {
      layout: 'meio_a_meio (painel embaixo)',
      util: { x: GRADE.margemX, y: yUtil, w: GRADE.colunaDoApp.x - GRADE.folga - GRADE.margemX, h: GRADE.base - GRADE.folga - yUtil },
      legenda,
      baseDaLegenda: (baseDoVideo - 40) / H,
      video: { x: 0, y: 0, w: W, h: baseDoVideo },
      reservadas: [
        baseDoApp,
        { nome: 'coluna de botões do app', r: { x: GRADE.colunaDoApp.x, y: GRADE.colunaDoApp.y, w: W - GRADE.colunaDoApp.x, h: GRADE.base - GRADE.colunaDoApp.y } },
        { nome: 'legenda do vídeo', r: legenda },
      ],
    };
  }

  const legenda = faixaDaLegenda(GRADE.legendaTopo, GRADE.legendaBase);
  const reservadasComuns = [topoDoApp, { nome: 'legenda do vídeo', r: legenda }, baseDoApp];

  if (c.layout === 'cartao') {
    return {
      layout: 'cartão sobre o vídeo',
      util: { x: GRADE.margemX, y: GRADE.topo, w: larguraUtil, h: 620 - GRADE.topo },
      utilExtra: { x: GRADE.margemX, y: 860, w: larguraUtil, h: GRADE.legendaTopo - GRADE.folga - 860 },
      legenda,
      baseDaLegenda: GRADE.legendaBase / H,
      reservadas: [...reservadasComuns, { nome: 'rosto (centro do vídeo)', r: { x: 180, y: 620, w: 720, h: 240 } }],
    };
  }

  const util: Retangulo = { x: GRADE.margemX, y: GRADE.topo, w: larguraUtil, h: GRADE.legendaTopo - GRADE.folga - GRADE.topo };
  const rodape: Retangulo = { x: GRADE.margemX, y: GRADE.legendaBase + GRADE.folga, w: GRADE.colunaDoApp.x - GRADE.folga - GRADE.margemX, h: GRADE.base - GRADE.legendaBase - 2 * GRADE.folga };

  if (c.layout === 'pip') {
    const janela = janelaDoPip(c.canto, c.tamanhoPip);
    // A área útil é a coluna ao lado da janela (altura toda); a extra, a
    // faixa de largura toda acima (janela embaixo) ou abaixo (janela em cima).
    const aDireita = janela.x < W / 2;
    const coluna: Retangulo = {
      x: aDireita ? janela.x + janela.w + GRADE.folga : GRADE.margemX,
      y: util.y,
      w: larguraUtil - janela.w - GRADE.folga,
      h: util.h,
    };
    const emCima = janela.y <= GRADE.topo + 1;
    const faixa: Retangulo = emCima
      ? { x: GRADE.margemX, y: janela.y + janela.h + GRADE.folga, w: larguraUtil, h: util.y + util.h - (janela.y + janela.h + GRADE.folga) }
      : { x: GRADE.margemX, y: util.y, w: larguraUtil, h: janela.y - GRADE.folga - util.y };
    return {
      layout: 'vídeo no canto (pip)',
      util: coluna,
      utilExtra: faixa,
      legenda,
      baseDaLegenda: GRADE.legendaBase / H,
      video: janela,
      reservadas: [...reservadasComuns, { nome: 'janela do vídeo', r: { x: janela.x - GRADE.folga, y: janela.y - GRADE.folga, w: janela.w + 2 * GRADE.folga, h: janela.h + 2 * GRADE.folga } }],
    };
  }

  return { layout: 'tela cheia', util, utilExtra: rodape, legenda, baseDaLegenda: GRADE.legendaBase / H, reservadas: reservadasComuns };
}

const px = (r: Retangulo) => `left ${Math.round(r.x)}, top ${Math.round(r.y)}, ${Math.round(r.w)}x${Math.round(r.h)} (até y ${Math.round(r.y + r.h)})`;

/** A grade em texto, para a IA (px no quadro 1080x1920). */
export function textoDaGrade(c: Pick<ComposicaoHtml, 'layout' | 'lado' | 'divisao' | 'canto' | 'tamanhoPip'>): string {
  const g = gradeDaComposicao(c);
  return [
    `GRADE DE SEGURANÇA (${g.layout}; px no quadro 1080x1920, medidos do topo-esquerda do QUADRO):`,
    `- ÁREA ÚTIL (título, textos, dados -- tudo que se lê): ${px(g.util)}.`,
    g.utilExtra ? `- SEGUNDA ÁREA ÚTIL (conteúdo secundário: continuação, rodapé, fonte, legenda de gráfico): ${px(g.utilExtra)}.` : '',
    g.video ? `- Vídeo com o rosto: ${px(g.video)} -- não cubra.` : '',
    ...g.reservadas.map((r) => `- RESERVADA (${r.nome}): ${px(r.r)} -- nada de texto ou elemento importante; só o fundo pode passar.`),
    '- No CSS, use as variáveis prontas (já relativas a #area): var(--util-x) var(--util-y) var(--util-w) var(--util-h) -- ex.: .conteudo { position:absolute; left:var(--util-x); top:var(--util-y); width:var(--util-w); height:var(--util-h); }. O fundo pode ocupar #area inteira; o conteúdo, só a área útil.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** A grade em variáveis de CSS, relativas a #area (a origem da área da animação no quadro). */
export function cssDaGrade(c: Pick<ComposicaoHtml, 'layout' | 'lado' | 'divisao' | 'canto' | 'tamanhoPip'>, origem: { x: number; y: number }): string {
  const g = gradeDaComposicao(c);
  const u = g.util;
  const e = g.utilExtra;
  return [
    `--util-x: ${Math.round(u.x - origem.x)}px; --util-y: ${Math.round(u.y - origem.y)}px; --util-w: ${Math.round(u.w)}px; --util-h: ${Math.round(u.h)}px;`,
    e ? `--extra-x: ${Math.round(e.x - origem.x)}px; --extra-y: ${Math.round(e.y - origem.y)}px; --extra-w: ${Math.round(e.w)}px; --extra-h: ${Math.round(e.h)}px;` : '',
    `--margem-x: ${GRADE.margemX}px;`,
  ].join(' ');
}
