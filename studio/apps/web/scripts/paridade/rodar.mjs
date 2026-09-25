// ============================================================
// Banco de paridade: prévia (WebGL) x render (FFmpeg).
//
// Uso (esbuild e playwright vêm da pasta de onde se roda -- o app não
// depende deles):
//   cd <pasta com esbuild e playwright> && node <repo>/studio/apps/web/scripts/paridade/rodar.mjs <pasta>
// A pasta tem A.png, B.png e ff/<id>-NN.png (quadros do FFmpeg, gerados
// com `filtroDaTransicao` do worker-core). Escreve gl/<id>-NN.png e um
// relatório com a diferença média (0-255) por transição.
// ============================================================

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const requerer = createRequire(join(process.cwd(), 'noop.js'));
const { build } = requerer('esbuild');
const { chromium } = requerer('playwright');
const pasta = resolve(process.argv[2] ?? '.');
const QUADROS = [4, 10, 16];
const TOTAL = 20;

const pacote = await build({
  entryPoints: [join(import.meta.dirname, 'entrada.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  absWorkingDir: resolve(import.meta.dirname, '..', '..'),
});
const js = pacote.outputFiles[0].text;

const navegadores = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright');
const cromo = readdirSync(navegadores).find((d) => d.startsWith('chromium-'));
const executavel = cromo ? join(navegadores, cromo, readdirSync(join(navegadores, cromo)).find((d) => d.startsWith('chrome-')), 'chrome.exe') : undefined;
const b = await chromium.launch({ executablePath: executavel, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage();
pg.on('pageerror', (e) => console.log('ERRO NA PÁGINA:', e.message));
pg.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await pg.route('http://paridade.local/**', (rota) => {
  const nome = new URL(rota.request().url()).pathname.slice(1) || 'index.html';
  if (nome === 'index.html') return rota.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' });
  if (nome === 'app.js') return rota.fulfill({ contentType: 'text/javascript; charset=utf-8', body: js });
  return rota.fulfill({ contentType: 'image/png', body: readFileSync(join(pasta, nome)) });
});
await pg.goto('http://paridade.local/index.html');
await pg.addScriptTag({ url: 'http://paridade.local/app.js' });
const faltando = await pg.evaluate(() => window.semGlsl());
if (faltando.length) console.log('SEM GLSL:', faltando.join(', '));
const guardar = process.argv.includes('--imagens');
const medidas = await pg.evaluate(([q, t, g]) => window.paridade(q, t, g), [QUADROS, TOTAL, guardar]);
await b.close();

// Tolerâncias: a maioria compara pixel a pixel; as de ruído/limiar (o grão
// do FFmpeg não coincide ponto a ponto) comparam as cores médias.
const ESTATISTICAS = new Set(['dissolve', 'distance']);
const LIMITE_PIXEL = 6;
const LIMITE_MEDIA = 4;
let falhas = 0;
if (guardar) mkdirSync(join(pasta, 'gl'), { recursive: true });
for (const m of medidas) {
  const estatistica = ESTATISTICAS.has(m.id);
  const valor = estatistica ? m.media : m.pixel;
  const ok = valor <= (estatistica ? LIMITE_MEDIA : LIMITE_PIXEL);
  if (!ok) falhas += 1;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${m.id.padEnd(16)} q${String(m.quadro).padStart(2)}  ${estatistica ? 'média' : 'pixel'} ${valor.toFixed(2)}`);
  if (m.imagem) writeFileSync(join(pasta, 'gl', `${m.id}-${String(m.quadro).padStart(2, '0')}.png`), Buffer.from(m.imagem.split(',')[1], 'base64'));
}
console.log(`${medidas.length} medidas, ${falhas} fora da tolerância`);
process.exit(falhas ? 1 : 0);
