// ============================================================
// Cenas animadas no render: cada quadro desenhado pela MESMA função da
// prévia (contracts/cenas-animadas.ts, `desenharCena`), num Canvas 2D do
// servidor (@napi-rs/canvas, Skia, sem dependência de sistema). Os quadros
// saem como PNG com transparência numa pasta; o FFmpeg lê a sequência
// como mais uma camada.
// ============================================================

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { desenharCena, FONTES_DA_CENA, type CenaAnimada, type Contexto2D } from '@makucho/studio-contracts';

let fontesProntas = false;

/** Registra as fontes da cena com os nomes que ela usa (uma vez por processo). */
export function registrarFontesDaCena(pastaDeFontes: string | undefined) {
  if (fontesProntas || !pastaDeFontes) return;
  const pares: Array<[string, string]> = [
    ['Inter-ExtraBold.ttf', FONTES_DA_CENA.forte],
    ['Inter-SemiBold.ttf', FONTES_DA_CENA.media],
  ];
  for (const [arquivo, familia] of pares) {
    const caminho = join(pastaDeFontes, arquivo);
    if (existsSync(caminho)) GlobalFonts.registerFromPath(caminho, familia);
  }
  fontesProntas = true;
}

/**
 * Os `nf` quadros da cena (30 fps) em `pasta/%05d.png`, numerados a partir
 * de 0. Devolve o padrão para o `-i` do FFmpeg.
 */
export async function quadrosDaCena(
  cena: CenaAnimada,
  nf: number,
  pasta: string,
  opcoes: { largura?: number; altura?: number; corDaMarca?: string; pastaDeFontes?: string; aoProgredir?: () => void } = {},
): Promise<string> {
  registrarFontesDaCena(opcoes.pastaDeFontes);
  const W = opcoes.largura ?? 1080;
  const H = opcoes.altura ?? 1920;
  await mkdir(pasta, { recursive: true });
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as Contexto2D;
  for (let k = 0; k < nf; k += 1) {
    desenharCena(ctx, cena, (k * 1000) / 30, W, H, opcoes.corDaMarca ? { corDaMarca: opcoes.corDaMarca } : {});
    await writeFile(join(pasta, `${String(k).padStart(5, '0')}.png`), await canvas.encode('png'));
    if (k % 15 === 0) opcoes.aoProgredir?.();
  }
  return join(pasta, '%05d.png');
}
