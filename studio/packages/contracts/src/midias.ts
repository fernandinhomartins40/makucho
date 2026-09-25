// ============================================================
// Mídia sobreposta: imagem ou vídeo do workspace por cima do vídeo
// (B-roll em tela cheia, picture-in-picture, tela dividida, livre).
//
// Uma camada tem um LUGAR (caixa em pixels do quadro) calculado aqui,
// numa função só: o render monta `scale`/`crop`/`overlay` com a caixa, e
// a prévia desenha a textura na mesma caixa. O B-roll em vídeo entra
// mudo por padrão -- a fala continua por baixo.
// ============================================================

import { z } from 'zod';

export const LAYOUTS_DE_MIDIA = ['tela_cheia', 'pip', 'dividir_cima', 'dividir_baixo', 'livre'] as const;
export type LayoutDeMidia = (typeof LAYOUTS_DE_MIDIA)[number];

export const NOME_DO_LAYOUT: Record<LayoutDeMidia, string> = {
  tela_cheia: 'Tela cheia (B-roll)',
  pip: 'Janela (PiP)',
  dividir_cima: 'Dividir: em cima',
  dividir_baixo: 'Dividir: embaixo',
  livre: 'Livre',
};

const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const camadaDeMidiaSchema = z
  .object({
    id: idSchema,
    assetId: idSchema,
    kind: z.enum(['image', 'video']),
    timelineStartMs: z.number().int().nonnegative(),
    durationMs: z.number().int().min(100).max(600_000),
    layout: z.enum(LAYOUTS_DE_MIDIA),
    /** Centro (0-1 do quadro) e largura (0-1), só no layout livre e no PiP. */
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    width: z.number().min(0.05).max(1).optional(),
    opacity: z.number().min(0).max(1).optional(),
    /** Cantos arredondados: raio em fração do lado menor (0-0,5). */
    radius: z.number().min(0).max(0.5).optional(),
    /** Entrada e saída em fade (ms). */
    fadeInMs: z.number().int().min(0).max(3000).optional(),
    fadeOutMs: z.number().int().min(0).max(3000).optional(),
    /** Vídeo: de onde começa no arquivo, e o volume (mudo por padrão). */
    sourceStartMs: z.number().int().nonnegative().optional(),
    volume: z.number().min(0).max(2).optional(),
  })
  .strict();

export type CamadaDeMidia = z.infer<typeof camadaDeMidiaSchema>;

/** Caixa da camada em pixels do quadro (canto superior esquerdo). */
export interface CaixaDaMidia {
  x: number;
  y: number;
  w: number;
  h: number;
  /** `cobrir`: preenche a caixa cortando; `conter`: cabe inteira (a caixa já tem a proporção da mídia). */
  modo: 'cobrir' | 'conter';
}

const par = (v: number) => Math.max(2, Math.round(v / 2) * 2);

/**
 * Onde a camada fica. `proporcao` = largura / altura da mídia (o render
 * mede com o ffprobe; a prévia, pelo elemento). Dimensões pares: o
 * yuv420p não aceita metade de pixel de croma.
 */
export function caixaDaMidia(c: Pick<CamadaDeMidia, 'layout' | 'x' | 'y' | 'width'>, proporcao: number, W = 1080, H = 1920): CaixaDaMidia {
  const p = proporcao > 0 && Number.isFinite(proporcao) ? proporcao : 16 / 9;
  switch (c.layout) {
    case 'tela_cheia':
      return { x: 0, y: 0, w: W, h: H, modo: 'cobrir' };
    case 'dividir_cima':
      return { x: 0, y: 0, w: W, h: par(H / 2), modo: 'cobrir' };
    case 'dividir_baixo':
      return { x: 0, y: H - par(H / 2), w: W, h: par(H / 2), modo: 'cobrir' };
    default: {
      const padrao = c.layout === 'pip' ? { x: 0.72, y: 0.2, width: 0.42 } : { x: 0.5, y: 0.4, width: 0.8 };
      const w = par((c.width ?? padrao.width) * W);
      const h = par(w / p);
      const cx = (c.x ?? padrao.x) * W;
      const cy = (c.y ?? padrao.y) * H;
      return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, modo: 'conter' };
    }
  }
}
