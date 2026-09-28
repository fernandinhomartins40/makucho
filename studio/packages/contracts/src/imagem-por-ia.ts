// ============================================================
// MAKUCHO STUDIO - Imagem criada por IA (Pollinations).
//
// Quando o banco de fotos não tem a cena (o produto numa situação, uma
// ideia abstrata), a imagem é gerada. O Pollinations cobra em "pollen" na
// chave do workspace (com crédito grátis); o modelo padrão, Z-Image Turbo,
// custa ~0,004 pollen por imagem. Sem chave, o serviço aberto põe marca
// d'água e baixa a resolução -- por isso a chave é obrigatória.
// ============================================================

import { z } from 'zod';

export const FORMATOS_DA_IMAGEM_POR_IA = {
  vertical: { largura: 1088, altura: 1920, rotulo: 'Vertical (9:16)' },
  quadrado: { largura: 1344, altura: 1344, rotulo: 'Quadrado' },
  horizontal: { largura: 1920, altura: 1088, rotulo: 'Horizontal (16:9)' },
} as const;

export type FormatoDaImagemPorIa = keyof typeof FORMATOS_DA_IMAGEM_POR_IA;

export const ESTILOS_DA_IMAGEM_POR_IA = {
  foto: { rotulo: 'Foto realista', sufixo: 'professional photography, natural light, sharp focus, high detail, realistic' },
  produto: { rotulo: 'Foto de produto', sufixo: 'studio product photography, clean background, soft shadows, commercial, high detail' },
  ilustracao: { rotulo: 'Ilustração', sufixo: 'modern flat illustration, clean shapes, vibrant colors' },
  render3d: { rotulo: '3D', sufixo: '3d render, soft lighting, glossy materials, high quality' },
  cinema: { rotulo: 'Cinematográfica', sufixo: 'cinematic still, dramatic lighting, shallow depth of field, film grain' },
} as const;

export type EstiloDaImagemPorIa = keyof typeof ESTILOS_DA_IMAGEM_POR_IA;

export const pedidoDeImagemPorIaSchema = z.object({
  descricao: z.string().trim().min(3).max(600),
  formato: z.enum(Object.keys(FORMATOS_DA_IMAGEM_POR_IA) as [FormatoDaImagemPorIa, ...FormatoDaImagemPorIa[]]).default('vertical'),
  estilo: z.enum(Object.keys(ESTILOS_DA_IMAGEM_POR_IA) as [EstiloDaImagemPorIa, ...EstiloDaImagemPorIa[]]).default('foto'),
});

export type PedidoDeImagemPorIa = z.infer<typeof pedidoDeImagemPorIaSchema>;

export const MODELO_DA_IMAGEM_POR_IA = 'tongyi-mai/z-image-turbo';

/** O texto enviado ao modelo: a descrição, o estilo e o que evitar num vídeo. */
export function promptDaImagemPorIa(p: Pick<PedidoDeImagemPorIa, 'descricao' | 'estilo'>): string {
  return `${p.descricao.trim()}, ${ESTILOS_DA_IMAGEM_POR_IA[p.estilo].sufixo}, no text, no watermark, no logo`;
}
