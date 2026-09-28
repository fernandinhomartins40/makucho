// ============================================================
// Animações em HTML (HyperFrames): do documento ao vídeo com
// transparência embutida.
//
// 1. Monta a pasta da composição: index.html (documentoDaComposicao, o
//    MESMO da prévia), gsap.min.js e as fontes Inter.
// 2. O HyperFrames abre a página no Chrome sem tela (HYPERFRAMES_BROWSER_PATH)
//    e tira um PNG com transparência por quadro, a 30 fps.
// 3. O FFmpeg junta os PNGs num MP4 H.264 comum de 2160x1920: à esquerda
//    a cor já multiplicada pelo alfa, à direita o alfa em cinza. Qualquer
//    navegador (e o iPhone) decodifica; o compositor junta de volta.
// ============================================================

import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { documentoDaComposicao, fontesDaComposicao, type JobDeAnimacao } from '@makucho/studio-contracts';
import { executarBinario } from '@makucho/studio-worker-core';

/** `import()` de verdade (o TypeScript em CommonJS trocaria por require, e o produtor é ESM). */
const importarEsm = new Function('m', 'return import(m)') as <T>(m: string) => Promise<T>;

interface Produtor {
  createRenderJob: (config: Record<string, unknown>) => unknown;
  executeRenderJob: (job: unknown, pastaDoProjeto: string, saida: string, progresso?: (p: unknown) => void, sinal?: AbortSignal) => Promise<unknown>;
}

/** Tempo máximo de uma animação no Chrome: uma página travada não segura a fila. */
const TEMPO_MAXIMO_MS = 6 * 60_000;

export async function prepararAnimacao(
  job: JobDeAnimacao,
  pasta: string,
  opcoes: { pastaDeFontes: string; aoProgredir?: () => void },
): Promise<string> {
  const comp = join(pasta, 'composicao');
  const quadros = join(pasta, 'quadros');
  await mkdir(comp, { recursive: true });
  await rm(quadros, { recursive: true, force: true });

  await writeFile(
    join(comp, 'index.html'),
    documentoDaComposicao(job.composicao, {
      duracaoMs: job.duracaoMs,
      gsap: 'gsap.min.js',
      fontes: '',
      origens: "'self'",
      ...(job.corDaMarca ? { corDaMarca: job.corDaMarca } : {}),
    }),
    'utf8',
  );
  await copyFile(require.resolve('gsap/dist/gsap.min.js'), join(comp, 'gsap.min.js'));
  for (const { arquivo: f } of fontesDaComposicao(job.composicao.css)) {
    const origem = join(opcoes.pastaDeFontes, f);
    if (existsSync(origem)) await copyFile(origem, join(comp, f));
  }

  const produtor = await importarEsm<Produtor>('@hyperframes/producer');
  const render = produtor.createRenderJob({
    width: 1080,
    height: 1920,
    fps: 30,
    format: 'png-sequence',
    quality: 'standard',
    // Duas abas do Chrome: cabe na memória da VPS ao lado do resto.
    workers: 2,
  });
  const sinal = AbortSignal.timeout(TEMPO_MAXIMO_MS);
  await produtor.executeRenderJob(render, comp, quadros, () => opcoes.aoProgredir?.(), sinal);

  const pngs = (await readdir(quadros)).filter((f) => /^frame_\d+\.png$/.test(f)).sort();
  if (!pngs.length) throw new Error('o HyperFrames não gerou nenhum quadro');
  const primeiro = Number(/(\d+)/.exec(pngs[0]!)![1]);

  // Cor multiplicada pelo alfa à esquerda, alfa à direita: sem franja
  // colorida nas bordas quando o H.264 borra um pouco o alfa.
  const saida = join(pasta, 'animacao.mp4');
  await executarBinario(
    'ffmpeg',
    [
      '-y',
      '-framerate', '30',
      '-start_number', String(primeiro),
      '-i', join(quadros, 'frame_%06d.png'),
      '-filter_complex',
      '[0:v]format=rgba,split[x][y];[x]premultiply=inplace=1,format=rgb24[c];[y]alphaextract,format=rgb24[a];[c][a]hstack=inputs=2,format=yuv420p[v]',
      '-map', '[v]',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '16',
      '-g', '30',
      '-movflags', '+faststart',
      '-an',
      saida,
    ],
    { timeoutMs: 5 * 60_000 },
  );
  await rm(quadros, { recursive: true, force: true });
  return saida;
}
