// ============================================================
// MAKUCHO STUDIO - Catálogo de transições.
//
// Uma definição por transição, usada pelo render (FFmpeg `xfade`) e pela
// prévia (shader WebGL com a MESMA fórmula). Duas origens:
//
//   xfade   -- uma das transições nativas do FFmpeg 5.1 (a imagem de
//              render). A prévia porta a fórmula do código-fonte do
//              filtro (libavfilter/vf_xfade.c).
//   receita -- o que o `xfade` não tem (chicote, giro, glitch, luz...):
//              uma combinação de filtros NATIVOS e rápidos do FFmpeg
//              (zoom por `perspective`, `rotate`, mistura do `xfade`,
//              `rgbashift`, `gblur`, `displace`, camada de luz), cada um
//              com a mesma conta no shader. Nada de expressão por pixel:
//              medido no FFmpeg 5.1, o `xfade=custom` custava de 1,5 s a
//              10 s POR QUADRO em 1080x1920 (e as variáveis da expressão
//              se atropelam entre as threads).
//
// Convenção do `xfade`: P vai de 1 (primeiro quadro, só o trecho que sai)
// até perto de 0. Nas receitas, o quadro k de n tem avanço q = k/n.
// ============================================================

export const CATEGORIAS_DE_TRANSICAO = {
  basicas: 'Básicas',
  deslizar: 'Deslizar',
  cortina: 'Cortina',
  formas: 'Formas',
  fatias: 'Fatias',
  camera: 'Câmera',
  luz: 'Luz',
  glitch: 'Glitch e distorção',
  desfoque: 'Desfoque',
} as const;

export type CategoriaDeTransicao = keyof typeof CATEGORIAS_DE_TRANSICAO;

export interface DefinicaoDeTransicao {
  id: string;
  rotulo: string;
  categoria: CategoriaDeTransicao;
  descricao: string;
  quando: string;
  duracaoPadraoMs: number;
  /** Nome no `xfade` nativo. */
  xfade?: string;
  /** Combinação de filtros nativos (ver `ReceitaDeTransicao`). */
  receita?: ReceitaDeTransicao;
  /** Som que combina com ela (entra como item próprio, editável). */
  somSugerido?: string;
  /** Custo de render acima de uma transição nativa simples. */
  pesada?: boolean;
}

/**
 * Receita de uma transição própria. Todos os valores em pixels estão no
 * quadro de 1080x1920 (a prévia escala). O avanço q do quadro k de n é
 * k/n; "de -> para" é linear em q.
 */
export interface ReceitaDeTransicao {
  /** Como A e B se juntam: esmaecer, deslizar ou troca seca no meio. */
  mistura: 'fade' | 'slideleft' | 'metade';
  /** Zoom de A e de B ao longo da janela (1 = sem zoom). */
  zoomA?: readonly [number, number];
  zoomB?: readonly [number, number];
  /** Giro de A e de B, em radianos. */
  giroA?: readonly [number, number];
  giroB?: readonly [number, number];
  /** Separação de canais: vermelho para a direita, azul para a esquerda. */
  rgb?: number;
  /** Desfoque horizontal (sigma, em pixels). */
  desfoque?: number;
  /** Faixas horizontais deslocadas (amplitude em pixels). */
  faixas?: number;
  /** Ondas horizontais (amplitude em pixels). */
  ondas?: number;
  /** Vazamento de luz quente atravessando a tela. */
  luz?: boolean;
}

export const TRANSICOES_DO_CATALOGO: readonly DefinicaoDeTransicao[] = [
  // ---------- Básicas ----------
  { id: 'cut', rotulo: 'Corte seco', categoria: 'basicas', descricao: 'Troca direta, sem efeito.', quando: 'O padrão em vídeo falado.', duracaoPadraoMs: 0 },
  { id: 'fade', rotulo: 'Esmaecer', categoria: 'basicas', descricao: 'Uma imagem some enquanto a outra aparece.', quando: 'Mudança suave de assunto.', duracaoPadraoMs: 400, xfade: 'fade' },
  { id: 'dissolve', rotulo: 'Dissolver', categoria: 'basicas', descricao: 'Mistura granulada entre as duas.', quando: 'Passagem de tempo, lembrança.', duracaoPadraoMs: 450, xfade: 'dissolve' },
  { id: 'fadeblack', rotulo: 'Pelo preto', categoria: 'basicas', descricao: 'Escurece e volta na próxima.', quando: 'Fim de um bloco.', duracaoPadraoMs: 600, xfade: 'fadeblack' },
  { id: 'fadewhite', rotulo: 'Pelo branco', categoria: 'basicas', descricao: 'Clareia até o branco e volta.', quando: 'Sonho, revelação suave.', duracaoPadraoMs: 600, xfade: 'fadewhite' },
  { id: 'fadegrays', rotulo: 'Pelo cinza', categoria: 'basicas', descricao: 'Perde a cor e volta na próxima.', quando: 'Lembrança, contraste de tempo.', duracaoPadraoMs: 600, xfade: 'fadegrays' },
  { id: 'distance', rotulo: 'Fusão de contornos', categoria: 'basicas', descricao: 'Troca primeiro onde as imagens se parecem.', quando: 'Planos parecidos (mesmo cenário).', duracaoPadraoMs: 500, xfade: 'distance' },
  // ---------- Deslizar ----------
  { id: 'slide', rotulo: 'Deslizar ←', categoria: 'deslizar', descricao: 'A próxima entra empurrando da direita.', quando: 'Lista, próximo item.', duracaoPadraoMs: 400, xfade: 'slideleft', somSugerido: 'sfx-whoosh' },
  { id: 'slideright', rotulo: 'Deslizar →', categoria: 'deslizar', descricao: 'A próxima entra pela esquerda.', quando: 'Voltar a um assunto.', duracaoPadraoMs: 400, xfade: 'slideright', somSugerido: 'sfx-whoosh' },
  { id: 'slideup', rotulo: 'Subir', categoria: 'deslizar', descricao: 'A próxima sobe de baixo.', quando: 'Virada, revelação.', duracaoPadraoMs: 400, xfade: 'slideup', somSugerido: 'sfx-swipe' },
  { id: 'slidedown', rotulo: 'Descer', categoria: 'deslizar', descricao: 'A próxima desce de cima.', quando: 'Conclusão, "no fim".', duracaoPadraoMs: 400, xfade: 'slidedown', somSugerido: 'sfx-swipe' },
  { id: 'smooth', rotulo: 'Suave ←', categoria: 'deslizar', descricao: 'Deslize com esmaecer.', quando: 'Troca de ângulo.', duracaoPadraoMs: 500, xfade: 'smoothleft' },
  { id: 'smoothright', rotulo: 'Suave →', categoria: 'deslizar', descricao: 'Deslize suave pela esquerda.', quando: 'Troca de cenário.', duracaoPadraoMs: 500, xfade: 'smoothright' },
  { id: 'smoothup', rotulo: 'Suave ↑', categoria: 'deslizar', descricao: 'Sobe suave.', quando: 'Leveza, próximo passo.', duracaoPadraoMs: 500, xfade: 'smoothup' },
  { id: 'smoothdown', rotulo: 'Suave ↓', categoria: 'deslizar', descricao: 'Desce suave.', quando: 'Calma, fechamento.', duracaoPadraoMs: 500, xfade: 'smoothdown' },
  { id: 'squeezeh', rotulo: 'Espremer', categoria: 'deslizar', descricao: 'A imagem se espreme na horizontal.', quando: 'Humor, surpresa.', duracaoPadraoMs: 450, xfade: 'squeezeh' },
  { id: 'squeezev', rotulo: 'Espremer vertical', categoria: 'deslizar', descricao: 'A imagem se espreme na vertical.', quando: 'Humor, virada rápida.', duracaoPadraoMs: 450, xfade: 'squeezev' },
  // ---------- Cortina ----------
  { id: 'wipe', rotulo: 'Cortina ←', categoria: 'cortina', descricao: 'Uma linha varre a tela.', quando: 'Antes e depois.', duracaoPadraoMs: 450, xfade: 'wipeleft' },
  { id: 'wiperight', rotulo: 'Cortina →', categoria: 'cortina', descricao: 'Varre da esquerda para a direita.', quando: 'Comparação.', duracaoPadraoMs: 450, xfade: 'wiperight' },
  { id: 'wipeup', rotulo: 'Cortina ↑', categoria: 'cortina', descricao: 'Varre de baixo para cima.', quando: 'Crescimento, resultado.', duracaoPadraoMs: 450, xfade: 'wipeup' },
  { id: 'wipedown', rotulo: 'Cortina ↓', categoria: 'cortina', descricao: 'Varre de cima para baixo.', quando: 'Revelar de cima.', duracaoPadraoMs: 450, xfade: 'wipedown' },
  { id: 'wipetl', rotulo: 'Canto ↖', categoria: 'cortina', descricao: 'Abre de um canto.', quando: 'Transição gráfica.', duracaoPadraoMs: 450, xfade: 'wipetl' },
  { id: 'wipebr', rotulo: 'Canto ↘', categoria: 'cortina', descricao: 'Abre do canto oposto.', quando: 'Transição gráfica.', duracaoPadraoMs: 450, xfade: 'wipebr' },
  { id: 'diagtl', rotulo: 'Diagonal ↖', categoria: 'cortina', descricao: 'Diagonal suave de um canto.', quando: 'Elegância, calma.', duracaoPadraoMs: 550, xfade: 'diagtl' },
  { id: 'diagbr', rotulo: 'Diagonal ↘', categoria: 'cortina', descricao: 'Diagonal suave do canto oposto.', quando: 'Elegância, calma.', duracaoPadraoMs: 550, xfade: 'diagbr' },
  // ---------- Formas ----------
  { id: 'circle', rotulo: 'Círculo abre', categoria: 'formas', descricao: 'Um círculo abre do centro.', quando: 'Revelar o resultado.', duracaoPadraoMs: 550, xfade: 'circleopen' },
  { id: 'circleclose', rotulo: 'Círculo fecha', categoria: 'formas', descricao: 'Um círculo fecha no centro.', quando: 'Foco, "olha isso".', duracaoPadraoMs: 550, xfade: 'circleclose' },
  { id: 'circlecrop', rotulo: 'Íris', categoria: 'formas', descricao: 'Fecha em círculo no preto e abre na próxima.', quando: 'Estilo de cinema antigo.', duracaoPadraoMs: 700, xfade: 'circlecrop' },
  { id: 'rectcrop', rotulo: 'Quadro', categoria: 'formas', descricao: 'Fecha em retângulo e abre na próxima.', quando: 'Troca de capítulo.', duracaoPadraoMs: 700, xfade: 'rectcrop' },
  { id: 'vertopen', rotulo: 'Portas abrem', categoria: 'formas', descricao: 'Abre do meio para os lados.', quando: 'Apresentação, entrada.', duracaoPadraoMs: 550, xfade: 'vertopen' },
  { id: 'vertclose', rotulo: 'Portas fecham', categoria: 'formas', descricao: 'Fecha dos lados para o meio.', quando: 'Encerramento.', duracaoPadraoMs: 550, xfade: 'vertclose' },
  { id: 'horzopen', rotulo: 'Persiana abre', categoria: 'formas', descricao: 'Abre do meio para cima e para baixo.', quando: 'Revelação.', duracaoPadraoMs: 550, xfade: 'horzopen' },
  { id: 'horzclose', rotulo: 'Persiana fecha', categoria: 'formas', descricao: 'Fecha de cima e de baixo para o meio.', quando: 'Encerramento.', duracaoPadraoMs: 550, xfade: 'horzclose' },
  { id: 'radial', rotulo: 'Radar', categoria: 'formas', descricao: 'Varre em círculo, como um ponteiro.', quando: 'Tempo passando, contagem.', duracaoPadraoMs: 700, xfade: 'radial' },
  // ---------- Fatias ----------
  { id: 'hlslice', rotulo: 'Fatias ←', categoria: 'fatias', descricao: 'Tiras verticais trocam em sequência.', quando: 'Ritmo, lista rápida.', duracaoPadraoMs: 550, xfade: 'hlslice' },
  { id: 'hrslice', rotulo: 'Fatias →', categoria: 'fatias', descricao: 'Tiras verticais, da direita.', quando: 'Ritmo, lista rápida.', duracaoPadraoMs: 550, xfade: 'hrslice' },
  { id: 'vuslice', rotulo: 'Fatias ↑', categoria: 'fatias', descricao: 'Tiras horizontais, de baixo.', quando: 'Energia, subida.', duracaoPadraoMs: 550, xfade: 'vuslice' },
  { id: 'vdslice', rotulo: 'Fatias ↓', categoria: 'fatias', descricao: 'Tiras horizontais, de cima.', quando: 'Energia, descida.', duracaoPadraoMs: 550, xfade: 'vdslice' },
  // ---------- Câmera ----------
  { id: 'zoom', rotulo: 'Zoom', categoria: 'camera', descricao: 'A próxima chega aproximando.', quando: 'O momento mais forte.', duracaoPadraoMs: 450, receita: { mistura: 'fade', zoomA: [1, 1.5] }, somSugerido: 'sfx-whoosh' },
  { id: 'chicote', rotulo: 'Chicote', categoria: 'camera', descricao: 'A câmera chicoteia para o lado, com rastro.', quando: 'Energia, troca rápida de assunto.', duracaoPadraoMs: 350, receita: { mistura: 'slideleft', desfoque: 28 }, somSugerido: 'sfx-whoosh', pesada: true },
  { id: 'zoom_desfoque', rotulo: 'Zoom forte', categoria: 'camera', descricao: 'Aproxima forte e a próxima chega de perto, com leve desfoque.', quando: 'Impacto, revelação.', duracaoPadraoMs: 400, receita: { mistura: 'fade', zoomA: [1, 1.6], zoomB: [1.6, 1], desfoque: 10 }, somSugerido: 'sfx-riser', pesada: true },
  { id: 'giro', rotulo: 'Giro', categoria: 'camera', descricao: 'Gira um quarto de volta e a próxima chega girando.', quando: 'Virada, "mudou tudo".', duracaoPadraoMs: 450, receita: { mistura: 'metade', zoomA: [1, 1.4], zoomB: [1.4, 1], giroA: [0, 0.8], giroB: [-0.8, 0] }, somSugerido: 'sfx-whoosh', pesada: true },
  { id: 'pulo', rotulo: 'Pulo', categoria: 'camera', descricao: 'Aproxima e a próxima entra aproximada, voltando.', quando: 'Ritmo de TikTok, corte com energia.', duracaoPadraoMs: 300, receita: { mistura: 'fade', zoomA: [1, 1.3], zoomB: [1.3, 1] }, somSugerido: 'sfx-pop' },
  // ---------- Luz ----------
  { id: 'flash', rotulo: 'Flash', categoria: 'luz', descricao: 'Clarão branco no meio da troca.', quando: 'Impacto, foto, virada.', duracaoPadraoMs: 300, xfade: 'fadewhite', somSugerido: 'sfx-camera' },
  { id: 'luz', rotulo: 'Vazamento de luz', categoria: 'luz', descricao: 'Uma luz quente atravessa a tela.', quando: 'Emoção, lembrança, vlog.', duracaoPadraoMs: 700, receita: { mistura: 'fade', luz: true }, pesada: true },
  // ---------- Glitch e distorção ----------
  { id: 'glitch', rotulo: 'Glitch', categoria: 'glitch', descricao: 'Interferência digital: faixas e cores deslocadas.', quando: 'Erro, virada, tecnologia.', duracaoPadraoMs: 350, receita: { mistura: 'metade', faixas: 90, rgb: 10 }, somSugerido: 'sfx-glitch', pesada: true },
  { id: 'rgb', rotulo: 'Separação RGB', categoria: 'glitch', descricao: 'Os canais de cor se afastam na troca.', quando: 'Energia, música.', duracaoPadraoMs: 400, receita: { mistura: 'fade', rgb: 24 } },
  { id: 'ondas', rotulo: 'Ondas', categoria: 'glitch', descricao: 'A imagem ondula enquanto troca.', quando: 'Sonho, pensamento.', duracaoPadraoMs: 600, receita: { mistura: 'fade', ondas: 40 }, pesada: true },
  { id: 'pixelize', rotulo: 'Pixels', categoria: 'glitch', descricao: 'Vira pixels e volta.', quando: 'Tecnologia, jogo.', duracaoPadraoMs: 500, xfade: 'pixelize' },
  // ---------- Desfoque ----------
  { id: 'blur', rotulo: 'Desfoque', categoria: 'desfoque', descricao: 'Borra na horizontal e foca na próxima.', quando: 'Transição leve.', duracaoPadraoMs: 500, xfade: 'hblur' },
];

export const TIPOS_DE_TRANSICAO_DO_CATALOGO = TRANSICOES_DO_CATALOGO.map((t) => t.id);

const PORID = new Map(TRANSICOES_DO_CATALOGO.map((t) => [t.id, t]));

export function definicaoDaTransicao(id: string): DefinicaoDeTransicao | undefined {
  return PORID.get(id);
}
