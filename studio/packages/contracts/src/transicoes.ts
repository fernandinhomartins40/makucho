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
  impacto: 'Impacto',
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
/**
 * Como A e B se juntam numa receita: uma transição nativa do `xfade`
 * (a prévia usa a fórmula dela no catálogo) ou "metade" (troca seca no
 * meio). Só entram as nativas que a prévia calcula ponto a ponto, sem ler
 * a imagem em outro lugar -- assim a deformação de cada lado se aplica
 * antes da mistura, como no render.
 */
export const MISTURAS_DE_RECEITA = [
  'fade',
  'dissolve',
  'fadeblack',
  'fadewhite',
  'slideleft',
  'smoothleft',
  'smoothup',
  'wipeleft',
  'diagtl',
  'circleopen',
  'vertopen',
  'horzopen',
  'radial',
  'hlslice',
  'vuslice',
  'metade',
] as const;
export type MisturaDeReceita = (typeof MISTURAS_DE_RECEITA)[number];

export interface ReceitaDeTransicao {
  /** Como A e B se juntam (ver `MISTURAS_DE_RECEITA`). */
  mistura: MisturaDeReceita;
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
  { id: 'subir_zoom', rotulo: 'Subir com zoom', categoria: 'deslizar', descricao: 'A próxima sobe suave, chegando de perto.', quando: 'Próximo passo, crescimento.', duracaoPadraoMs: 500, receita: { mistura: 'smoothup', zoomB: [1.25, 1] }, somSugerido: 'sfx-swipe' },
  { id: 'deslize_macio', rotulo: 'Deslize macio', categoria: 'deslizar', descricao: 'Deslize suave com rastro de movimento.', quando: 'Troca de cenário com fluidez.', duracaoPadraoMs: 500, receita: { mistura: 'smoothleft', desfoque: 12 }, somSugerido: 'sfx-whoosh', pesada: true },
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
  { id: 'circulo_zoom', rotulo: 'Círculo com zoom', categoria: 'formas', descricao: 'Um círculo abre e a próxima chega de perto.', quando: 'Revelar o resultado com impacto.', duracaoPadraoMs: 550, receita: { mistura: 'circleopen', zoomB: [1.3, 1] }, somSugerido: 'sfx-whoosh' },
  { id: 'portas_zoom', rotulo: 'Portas com zoom', categoria: 'formas', descricao: 'Abre do meio para os lados, com a próxima se afastando.', quando: 'Apresentação, entrada de produto.', duracaoPadraoMs: 550, receita: { mistura: 'vertopen', zoomB: [1.3, 1] }, somSugerido: 'sfx-whoosh' },
  { id: 'radar_zoom', rotulo: 'Radar com zoom', categoria: 'formas', descricao: 'Varre em círculo enquanto a próxima se afasta.', quando: 'Contagem, tempo passando.', duracaoPadraoMs: 700, receita: { mistura: 'radial', zoomB: [1.25, 1] }, somSugerido: 'sfx-tictac' },
  { id: 'diagonal_zoom', rotulo: 'Diagonal com zoom', categoria: 'formas', descricao: 'Diagonal suave com aproximação dos dois lados.', quando: 'Elegância, moda, produto.', duracaoPadraoMs: 600, receita: { mistura: 'diagtl', zoomA: [1, 1.2], zoomB: [1.2, 1] } },
  { id: 'persiana_rgb', rotulo: 'Persiana RGB', categoria: 'formas', descricao: 'Abre do meio para cima e para baixo com cores separadas.', quando: 'Revelação com energia.', duracaoPadraoMs: 550, receita: { mistura: 'horzopen', rgb: 12 } },
  // ---------- Fatias ----------
  { id: 'hlslice', rotulo: 'Fatias ←', categoria: 'fatias', descricao: 'Tiras verticais trocam em sequência.', quando: 'Ritmo, lista rápida.', duracaoPadraoMs: 550, xfade: 'hlslice' },
  { id: 'hrslice', rotulo: 'Fatias →', categoria: 'fatias', descricao: 'Tiras verticais, da direita.', quando: 'Ritmo, lista rápida.', duracaoPadraoMs: 550, xfade: 'hrslice' },
  { id: 'vuslice', rotulo: 'Fatias ↑', categoria: 'fatias', descricao: 'Tiras horizontais, de baixo.', quando: 'Energia, subida.', duracaoPadraoMs: 550, xfade: 'vuslice' },
  { id: 'vdslice', rotulo: 'Fatias ↓', categoria: 'fatias', descricao: 'Tiras horizontais, de cima.', quando: 'Energia, descida.', duracaoPadraoMs: 550, xfade: 'vdslice' },
  { id: 'fatias_rgb', rotulo: 'Fatias RGB', categoria: 'fatias', descricao: 'Tiras trocam em sequência com as cores separadas.', quando: 'Lista rápida com energia.', duracaoPadraoMs: 550, receita: { mistura: 'hlslice', rgb: 14 }, somSugerido: 'sfx-swipe' },
  { id: 'fatias_glitch', rotulo: 'Fatias glitch', categoria: 'fatias', descricao: 'Tiras horizontais trocam com interferência.', quando: 'Tecnologia, ritmo.', duracaoPadraoMs: 550, receita: { mistura: 'vuslice', faixas: 60 }, somSugerido: 'sfx-glitch', pesada: true },
  // ---------- Câmera ----------
  { id: 'zoom', rotulo: 'Zoom', categoria: 'camera', descricao: 'A próxima chega aproximando.', quando: 'O momento mais forte.', duracaoPadraoMs: 450, receita: { mistura: 'fade', zoomA: [1, 1.5] }, somSugerido: 'sfx-whoosh' },
  { id: 'chicote', rotulo: 'Chicote', categoria: 'camera', descricao: 'A câmera chicoteia para o lado, com rastro.', quando: 'Energia, troca rápida de assunto.', duracaoPadraoMs: 350, receita: { mistura: 'slideleft', desfoque: 28 }, somSugerido: 'sfx-whoosh', pesada: true },
  { id: 'zoom_desfoque', rotulo: 'Zoom forte', categoria: 'camera', descricao: 'Aproxima forte e a próxima chega de perto, com leve desfoque.', quando: 'Impacto, revelação.', duracaoPadraoMs: 400, receita: { mistura: 'fade', zoomA: [1, 1.6], zoomB: [1.6, 1], desfoque: 10 }, somSugerido: 'sfx-riser', pesada: true },
  { id: 'giro', rotulo: 'Giro', categoria: 'camera', descricao: 'Gira um quarto de volta e a próxima chega girando.', quando: 'Virada, "mudou tudo".', duracaoPadraoMs: 450, receita: { mistura: 'metade', zoomA: [1, 1.4], zoomB: [1.4, 1], giroA: [0, 0.8], giroB: [-0.8, 0] }, somSugerido: 'sfx-whoosh', pesada: true },
  { id: 'zoom_giro', rotulo: 'Zoom com giro', categoria: 'camera', descricao: 'Aproxima girando de leve e a próxima chega desfazendo o giro.', quando: 'Virada de assunto com energia.', duracaoPadraoMs: 450, receita: { mistura: 'metade', zoomA: [1, 1.5], zoomB: [1.5, 1], giroA: [0, 0.35], giroB: [-0.35, 0] }, somSugerido: 'sfx-whoosh', pesada: true },
  { id: 'giro_rapido', rotulo: 'Giro rápido', categoria: 'camera', descricao: 'Meia volta rápida com rastro, e a próxima entra girando.', quando: 'Mudança total, antes e depois.', duracaoPadraoMs: 400, receita: { mistura: 'metade', zoomA: [1, 1.6], zoomB: [1.6, 1], giroA: [0, 1.4], giroB: [-1.4, 0], desfoque: 8 }, somSugerido: 'sfx-whoosh-grave', pesada: true },
  { id: 'balanco', rotulo: 'Balanço', categoria: 'camera', descricao: 'Inclina de leve e aproxima, como câmera na mão.', quando: 'Vlog, bastidor, conversa.', duracaoPadraoMs: 550, receita: { mistura: 'fade', zoomA: [1, 1.15], zoomB: [1.15, 1], giroA: [0, 0.12], giroB: [-0.12, 0] }, pesada: true },
  { id: 'empurrar', rotulo: 'Empurrar com zoom', categoria: 'camera', descricao: 'A próxima empurra a atual para o lado, com zoom e rastro.', quando: 'Próximo item de uma lista, ritmo.', duracaoPadraoMs: 400, receita: { mistura: 'slideleft', zoomA: [1, 1.2], zoomB: [1.2, 1], desfoque: 12 }, somSugerido: 'sfx-swipe', pesada: true },
  { id: 'chegar_perto', rotulo: 'Chegar de perto', categoria: 'camera', descricao: 'A próxima começa bem de perto e se afasta até o normal.', quando: 'Revelar o produto, o resultado.', duracaoPadraoMs: 500, receita: { mistura: 'fade', zoomB: [1.8, 1] }, somSugerido: 'sfx-riser' },
  { id: 'mergulho', rotulo: 'Mergulho', categoria: 'camera', descricao: 'Mergulha fundo na imagem até virar a próxima.', quando: 'Entrar no detalhe, "vamos por dentro".', duracaoPadraoMs: 500, receita: { mistura: 'fade', zoomA: [1, 2.4] }, somSugerido: 'sfx-whoosh' },
  // ---------- Impacto ----------
  { id: 'impacto', rotulo: 'Impacto', categoria: 'impacto', descricao: 'Troca seca com a próxima batendo de perto e cores deslocadas.', quando: 'Frase forte, número, virada.', duracaoPadraoMs: 300, receita: { mistura: 'metade', zoomB: [1.35, 1], rgb: 14 }, somSugerido: 'sfx-impacto' },
  { id: 'soco', rotulo: 'Soco', categoria: 'impacto', descricao: 'Aproxima e bate na próxima, com tremido de cor.', quando: 'Punchline, ritmo de TikTok.', duracaoPadraoMs: 250, receita: { mistura: 'metade', zoomA: [1, 1.25], zoomB: [1.25, 1], rgb: 20, desfoque: 6 }, somSugerido: 'sfx-soco', pesada: true },
  { id: 'flash_zoom', rotulo: 'Flash com zoom', categoria: 'impacto', descricao: 'Estoura no branco aproximando e a próxima volta de perto.', quando: 'Revelação, "olha isso".', duracaoPadraoMs: 450, receita: { mistura: 'fadewhite', zoomA: [1, 1.4], zoomB: [1.4, 1] }, somSugerido: 'sfx-camera' },
  { id: 'flash_rgb', rotulo: 'Flash colorido', categoria: 'impacto', descricao: 'Flash branco com as cores se separando.', quando: 'Música, energia, festa.', duracaoPadraoMs: 400, receita: { mistura: 'fadewhite', rgb: 18 }, somSugerido: 'sfx-zap' },
  { id: 'preto_zoom', rotulo: 'Pelo preto com zoom', categoria: 'impacto', descricao: 'Escurece aproximando e volta de perto na próxima.', quando: 'Fim de capítulo com cara de cinema.', duracaoPadraoMs: 700, receita: { mistura: 'fadeblack', zoomA: [1, 1.2], zoomB: [1.2, 1] }, somSugerido: 'sfx-boom' },
  { id: 'pulo', rotulo: 'Pulo', categoria: 'camera', descricao: 'Aproxima e a próxima entra aproximada, voltando.', quando: 'Ritmo de TikTok, corte com energia.', duracaoPadraoMs: 300, receita: { mistura: 'fade', zoomA: [1, 1.3], zoomB: [1.3, 1] }, somSugerido: 'sfx-pop' },
  // ---------- Luz ----------
  { id: 'flash', rotulo: 'Flash', categoria: 'luz', descricao: 'Clarão branco no meio da troca.', quando: 'Impacto, foto, virada.', duracaoPadraoMs: 300, xfade: 'fadewhite', somSugerido: 'sfx-camera' },
  { id: 'luz', rotulo: 'Vazamento de luz', categoria: 'luz', descricao: 'Uma luz quente atravessa a tela.', quando: 'Emoção, lembrança, vlog.', duracaoPadraoMs: 700, receita: { mistura: 'fade', luz: true }, pesada: true },
  { id: 'queimar', rotulo: 'Queimar', categoria: 'luz', descricao: 'A luz estoura no branco e revela a próxima.', quando: 'Lembrança, emoção, abertura.', duracaoPadraoMs: 700, receita: { mistura: 'fadewhite', luz: true }, somSugerido: 'sfx-riser', pesada: true },
  { id: 'luz_zoom', rotulo: 'Luz com zoom', categoria: 'luz', descricao: 'Uma luz quente passa e a próxima chega de perto.', quando: 'Vlog, viagem, momento bonito.', duracaoPadraoMs: 650, receita: { mistura: 'fade', luz: true, zoomB: [1.2, 1] }, pesada: true },
  { id: 'sonho', rotulo: 'Sonho', categoria: 'luz', descricao: 'Desfoca com uma luz quente, como numa lembrança.', quando: 'Memória, antes, sonho.', duracaoPadraoMs: 900, receita: { mistura: 'fade', luz: true, desfoque: 8 }, pesada: true },
  { id: 'cortina_luz', rotulo: 'Cortina de luz', categoria: 'luz', descricao: 'Uma cortina varre a tela acompanhada de luz.', quando: 'Antes e depois com charme.', duracaoPadraoMs: 600, receita: { mistura: 'wipeleft', luz: true }, somSugerido: 'sfx-whoosh', pesada: true },
  { id: 'circulo_luz', rotulo: 'Círculo de luz', categoria: 'luz', descricao: 'Um círculo abre do centro com uma luz quente.', quando: 'Revelar com delicadeza.', duracaoPadraoMs: 700, receita: { mistura: 'circleopen', luz: true }, pesada: true },
  // ---------- Glitch e distorção ----------
  { id: 'glitch', rotulo: 'Glitch', categoria: 'glitch', descricao: 'Interferência digital: faixas e cores deslocadas.', quando: 'Erro, virada, tecnologia.', duracaoPadraoMs: 350, receita: { mistura: 'metade', faixas: 90, rgb: 10 }, somSugerido: 'sfx-glitch', pesada: true },
  { id: 'rgb', rotulo: 'Separação RGB', categoria: 'glitch', descricao: 'Os canais de cor se afastam na troca.', quando: 'Energia, música.', duracaoPadraoMs: 400, receita: { mistura: 'fade', rgb: 24 } },
  { id: 'ondas', rotulo: 'Ondas', categoria: 'glitch', descricao: 'A imagem ondula enquanto troca.', quando: 'Sonho, pensamento.', duracaoPadraoMs: 600, receita: { mistura: 'fade', ondas: 40 }, pesada: true },
  { id: 'pixelize', rotulo: 'Pixels', categoria: 'glitch', descricao: 'Vira pixels e volta.', quando: 'Tecnologia, jogo.', duracaoPadraoMs: 500, xfade: 'pixelize' },
  { id: 'glitch_forte', rotulo: 'Glitch forte', categoria: 'glitch', descricao: 'Interferência pesada: faixas largas e cores bem separadas.', quando: 'Erro, choque, tecnologia.', duracaoPadraoMs: 350, receita: { mistura: 'metade', faixas: 160, rgb: 22 }, somSugerido: 'sfx-glitch', pesada: true },
  { id: 'glitch_zoom', rotulo: 'Glitch com zoom', categoria: 'glitch', descricao: 'Interferência digital e a próxima chega de perto.', quando: 'Virada, games, tecnologia.', duracaoPadraoMs: 350, receita: { mistura: 'metade', faixas: 90, rgb: 12, zoomB: [1.3, 1] }, somSugerido: 'sfx-glitch', pesada: true },
  { id: 'vhs', rotulo: 'VHS', categoria: 'glitch', descricao: 'Fita antiga: faixas tremidas, cor vazando e imagem macia.', quando: 'Nostalgia, anos 90, retrô.', duracaoPadraoMs: 600, receita: { mistura: 'fade', faixas: 40, rgb: 8, desfoque: 3 }, somSugerido: 'sfx-reverso', pesada: true },
  { id: 'interferencia', rotulo: 'Interferência', categoria: 'glitch', descricao: 'Troca granulada com as cores separadas.', quando: 'Sinal ruim, mistério.', duracaoPadraoMs: 500, receita: { mistura: 'dissolve', rgb: 16 }, somSugerido: 'sfx-glitch' },
  { id: 'tontura', rotulo: 'Tontura', categoria: 'glitch', descricao: 'A imagem ondula e gira de leve enquanto troca.', quando: 'Confusão, "fiquei tonto".', duracaoPadraoMs: 700, receita: { mistura: 'fade', ondas: 60, giroA: [0, 0.3], giroB: [-0.3, 0] }, pesada: true },
  { id: 'agua', rotulo: 'Água', categoria: 'glitch', descricao: 'Ondula como reflexo na água, macio.', quando: 'Calma, natureza, sonho.', duracaoPadraoMs: 800, receita: { mistura: 'fade', ondas: 80, desfoque: 4 }, pesada: true },
  // ---------- Desfoque ----------
  { id: 'blur', rotulo: 'Desfoque', categoria: 'desfoque', descricao: 'Borra na horizontal e foca na próxima.', quando: 'Transição leve.', duracaoPadraoMs: 500, xfade: 'hblur' },
  { id: 'desfoque_zoom', rotulo: 'Desfoque com zoom', categoria: 'desfoque', descricao: 'Aproxima desfocando e a próxima entra em foco.', quando: 'Transição de vlog, viagem.', duracaoPadraoMs: 500, receita: { mistura: 'fade', zoomA: [1, 1.3], zoomB: [1.3, 1], desfoque: 18 }, somSugerido: 'sfx-whoosh', pesada: true },
  { id: 'foco', rotulo: 'Foco', categoria: 'desfoque', descricao: 'Perde o foco e a próxima aparece focando.', quando: 'Mudança de assunto elegante.', duracaoPadraoMs: 600, receita: { mistura: 'fade', desfoque: 24 }, pesada: true },
  { id: 'cortina_macia', rotulo: 'Cortina macia', categoria: 'desfoque', descricao: 'Uma cortina desfocada varre a tela.', quando: 'Antes e depois, suave.', duracaoPadraoMs: 550, receita: { mistura: 'wipeleft', desfoque: 16 }, pesada: true },
];

export const TIPOS_DE_TRANSICAO_DO_CATALOGO = TRANSICOES_DO_CATALOGO.map((t) => t.id);

const PORID = new Map(TRANSICOES_DO_CATALOGO.map((t) => [t.id, t]));

export function definicaoDaTransicao(id: string): DefinicaoDeTransicao | undefined {
  return PORID.get(id);
}
