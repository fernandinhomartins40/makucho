// ============================================================
// Efeitos de tela: itens na faixa Efeitos, com começo, duração e
// intensidade (vinheta, flash, íris, tremor, desfoque...).
//
// Diferente do zoom do trecho (`clip.effect`), um efeito de tela vale
// para o intervalo que a pessoa escolhe, atravessando cortes. O render
// aplica cada um sobre o vídeo montado, antes de logo, imagens e textos
// (worker-core/render.ts, `filtroDoEfeitoDeTela`); a prévia faz as
// mesmas contas num passo de pós-processamento (web/gl/efeitosGlsl.ts).
// ============================================================

import { z } from 'zod';

export const CATEGORIAS_DE_EFEITO_DE_TELA = {
  luz: 'Luz',
  camera: 'Câmera e lente',
  retro: 'Retrô',
  moldura: 'Moldura',
  corpo: 'Fundo e pessoa',
} as const;

export type CategoriaDeEfeitoDeTela = keyof typeof CATEGORIAS_DE_EFEITO_DE_TELA;

export interface DefinicaoDeEfeitoDeTela {
  id: string;
  rotulo: string;
  categoria: CategoriaDeEfeitoDeTela;
  descricao: string;
  quando: string;
  duracaoPadraoMs: number;
  intensidadePadrao: number;
  /** Custa mais para exportar (filtro por pixel ou por quadro). */
  pesado?: boolean;
  /**
   * Muda só o FUNDO: a pessoa (a máscara do mesmo modelo do texto atrás)
   * volta por cima, intacta.
   */
  usaPessoa?: boolean;
}

export const EFEITOS_DE_TELA = [
  { id: 'flash', rotulo: 'Flash', categoria: 'luz', descricao: 'Um clarão branco que se apaga.', quando: 'Virada, revelação, batida da música.', duracaoPadraoMs: 500, intensidadePadrao: 0.8 },
  { id: 'vinheta', rotulo: 'Vinheta', categoria: 'moldura', descricao: 'Escurece as bordas e leva o olhar ao centro.', quando: 'Fala intimista, suspense, foco no rosto.', duracaoPadraoMs: 4000, intensidadePadrao: 0.6 },
  { id: 'cinema', rotulo: 'Barras de cinema', categoria: 'moldura', descricao: 'Faixas pretas entram em cima e embaixo.', quando: 'Momento épico, história, "e então...".', duracaoPadraoMs: 3000, intensidadePadrao: 0.7 },
  { id: 'iris_abrir', rotulo: 'Íris abrindo', categoria: 'moldura', descricao: 'A imagem abre num círculo a partir do centro.', quando: 'Começo do vídeo ou de um bloco.', duracaoPadraoMs: 700, intensidadePadrao: 1 },
  { id: 'iris_fechar', rotulo: 'Íris fechando', categoria: 'moldura', descricao: 'A imagem fecha num círculo até o preto.', quando: 'Fim do vídeo, "e é isso".', duracaoPadraoMs: 700, intensidadePadrao: 1 },
  { id: 'desfoque', rotulo: 'Desfoque', categoria: 'camera', descricao: 'A imagem inteira fica borrada.', quando: 'Fundo para um texto, censura leve, sonho.', duracaoPadraoMs: 1500, intensidadePadrao: 0.5, pesado: true },
  { id: 'tremor', rotulo: 'Tremor', categoria: 'camera', descricao: 'A câmera treme, como num impacto.', quando: 'Impacto, susto, frase forte.', duracaoPadraoMs: 600, intensidadePadrao: 0.6 },
  { id: 'pulso', rotulo: 'Pulso', categoria: 'camera', descricao: 'Zoom que bate no ritmo (2 por segundo).', quando: 'Música com batida, lista rápida.', duracaoPadraoMs: 2000, intensidadePadrao: 0.6 },
  { id: 'espelho', rotulo: 'Espelho', categoria: 'camera', descricao: 'Inverte a imagem da esquerda para a direita.', quando: 'Virada de lado, "o outro lado da história".', duracaoPadraoMs: 1500, intensidadePadrao: 1 },
  { id: 'aberracao', rotulo: 'Aberração', categoria: 'camera', descricao: 'Separa o vermelho e o azul nas bordas.', quando: 'Tensão, energia, estilo digital.', duracaoPadraoMs: 1200, intensidadePadrao: 0.5 },
  { id: 'glitch', rotulo: 'Glitch', categoria: 'retro', descricao: 'Faixas da imagem pulam para os lados.', quando: 'Erro, "mas tem um problema", virada.', duracaoPadraoMs: 700, intensidadePadrao: 0.6, pesado: true },
  { id: 'grao', rotulo: 'Grão de filme', categoria: 'retro', descricao: 'Textura de película que muda a cada quadro.', quando: 'Lembrança, estética analógica.', duracaoPadraoMs: 4000, intensidadePadrao: 0.5 },
  { id: 'linhas', rotulo: 'Linhas de TV', categoria: 'retro', descricao: 'Linhas horizontais de tela antiga.', quando: 'Retrô, "ao vivo", arquivo.', duracaoPadraoMs: 3000, intensidadePadrao: 0.5 },
  { id: 'fundo_desfocado', rotulo: 'Fundo desfocado', categoria: 'corpo', descricao: 'Borra tudo menos quem fala.', quando: 'Destacar a pessoa, fundo bagunçado.', duracaoPadraoMs: 3000, intensidadePadrao: 0.6, pesado: true, usaPessoa: true },
  { id: 'fundo_pb', rotulo: 'Fundo P&B', categoria: 'corpo', descricao: 'O fundo perde a cor; a pessoa continua colorida.', quando: 'Momento de foco, "só isso importa".', duracaoPadraoMs: 3000, intensidadePadrao: 1, pesado: true, usaPessoa: true },
  { id: 'fundo_escuro', rotulo: 'Fundo escuro', categoria: 'corpo', descricao: 'Escurece o fundo e acende a pessoa.', quando: 'Revelação, confissão, frase forte.', duracaoPadraoMs: 3000, intensidadePadrao: 0.7, pesado: true, usaPessoa: true },
] as const satisfies readonly DefinicaoDeEfeitoDeTela[];

export type TipoDeEfeitoDeTela = (typeof EFEITOS_DE_TELA)[number]['id'];

export const TIPOS_DE_EFEITO_DE_TELA = EFEITOS_DE_TELA.map((e) => e.id) as [TipoDeEfeitoDeTela, ...TipoDeEfeitoDeTela[]];

export function definicaoDoEfeitoDeTela(id: string): DefinicaoDeEfeitoDeTela | undefined {
  return EFEITOS_DE_TELA.find((e) => e.id === id);
}

const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const efeitoDeTelaSchema = z
  .object({
    id: idSchema,
    type: z.enum(TIPOS_DE_EFEITO_DE_TELA),
    timelineStartMs: z.number().int().nonnegative(),
    durationMs: z.number().int().min(100).max(600_000),
    intensity: z.number().min(0).max(1),
  })
  .strict();

export type EfeitoDeTela = z.infer<typeof efeitoDeTelaSchema>;

/** Quadros (a 30 fps) em que o efeito vale: o mesmo arredondamento no render e na prévia. */
export function janelaDoEfeito(e: Pick<EfeitoDeTela, 'timelineStartMs' | 'durationMs'>, fps = 30): { inicio: number; quadros: number } {
  const inicio = Math.round((e.timelineStartMs * fps) / 1000);
  const quadros = Math.max(1, Math.round((e.durationMs * fps) / 1000));
  return { inicio, quadros };
}

/** Efeitos que precisam da máscara da pessoa. */
export function efeitoUsaPessoa(tipo: string): boolean {
  return Boolean(definicaoDoEfeitoDeTela(tipo)?.usaPessoa);
}
