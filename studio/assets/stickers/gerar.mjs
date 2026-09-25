// ============================================================
// Gera os stickers embutidos: SVG técnico feito aqui, em código, e
// rasterizado em PNG 512x512 com transparência (o render não lê SVG);
// emoji baixados do Noto Emoji (Apache 2.0, googlefonts/noto-emoji).
//
// Uso (playwright vem da pasta de onde se roda; o repo não depende dele):
//   cd <pasta com playwright> && node <repo>/studio/assets/stickers/gerar.mjs
// Escreve <id>.png ao lado deste arquivo (o desenho é este código).
// ============================================================

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const requerer = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = requerer('playwright');
const { STICKERS } = createRequire(import.meta.url)('../../packages/contracts/dist/index.js');

// A fonte vai embutida (data URL): a página de rasterização não tem origem e não lê file://.
const fonte = (arquivo) => `data:font/ttf;base64,${readFileSync(join(aqui, '..', 'fonts', arquivo)).toString('base64')}`;
const CONTORNO = 'stroke="#fff" stroke-width="22" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"';
const SOMBRA = '<filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-opacity="0.35"/></filter>';
const svg = (corpo, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>${SOMBRA}${extra}</defs><g filter="url(#s)">${corpo}</g></svg>`;
const seta = (giro) =>
  svg(`<g transform="rotate(${giro} 256 256)"><path d="M70 206h230v-86l150 136-150 136v-86H70z" fill="#FFD400" ${CONTORNO}/></g>`);
const selo = (texto, fundo, cor = '#fff', tamanho = 96, fonteArq = 'Anton-Regular.ttf') =>
  svg(
    `<rect x="36" y="166" width="440" height="180" rx="90" fill="${fundo}" ${CONTORNO}/>` +
      `<text x="256" y="256" dy="0.35em" text-anchor="middle" font-family="Selo" font-size="${tamanho}" fill="${cor}">${texto}</text>`,
    `<style>@font-face{font-family:Selo;src:url('${fonte(fonteArq)}')}</style>`,
  );
const estrelaPontos = (pontas, r1, r2, cx = 256, cy = 256) =>
  Array.from({ length: pontas * 2 }, (_, i) => {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI * i) / pontas - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const DESENHOS = {
  seta_direita: seta(0),
  seta_esquerda: seta(180),
  seta_cima: seta(-90),
  seta_baixo: seta(90),
  seta_curva: svg(
    `<path d="M90 380 C 110 200, 260 120, 380 170" fill="none" stroke="#fff" stroke-width="58" stroke-linecap="round"/>` +
      `<path d="M90 380 C 110 200, 260 120, 380 170" fill="none" stroke="#FF3B30" stroke-width="30" stroke-linecap="round"/>` +
      `<path d="M330 110 L420 180 L320 225 Z" fill="#FF3B30" ${CONTORNO}/>`,
  ),
  circulo: svg(
    `<path d="M256 70 C 400 66, 470 170, 450 280 C 430 400, 300 450, 190 430 C 80 405, 40 300, 70 200 C 95 120, 170 80, 290 84" fill="none" stroke="#fff" stroke-width="46" stroke-linecap="round"/>` +
      `<path d="M256 70 C 400 66, 470 170, 450 280 C 430 400, 300 450, 190 430 C 80 405, 40 300, 70 200 C 95 120, 170 80, 290 84" fill="none" stroke="#FF3B30" stroke-width="22" stroke-linecap="round"/>`,
  ),
  sublinhado: svg(
    `<path d="M50 300 C 150 270, 300 270, 460 285 M80 350 C 200 325, 330 330, 440 340" fill="none" stroke="#fff" stroke-width="50" stroke-linecap="round"/>` +
      `<path d="M50 300 C 150 270, 300 270, 460 285 M80 350 C 200 325, 330 330, 440 340" fill="none" stroke="#FFD400" stroke-width="26" stroke-linecap="round"/>`,
  ),
  marca_texto: svg(`<rect x="30" y="196" width="452" height="120" rx="18" fill="#FFE600" fill-opacity="0.6" transform="rotate(-3 256 256)"/>`),
  check: svg(`<circle cx="256" cy="256" r="190" fill="#1DB954" ${CONTORNO}/><path d="M160 262 L230 330 L360 190" fill="none" stroke="#fff" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>`),
  xis: svg(`<circle cx="256" cy="256" r="190" fill="#FF3B30" ${CONTORNO}/><path d="M180 180 L332 332 M332 180 L180 332" stroke="#fff" stroke-width="46" stroke-linecap="round"/>`),
  estrela: svg(`<polygon points="${estrelaPontos(5, 210, 95)}" fill="#FFD400" ${CONTORNO}/>`),
  coracao: svg(`<path d="M256 430 C 120 330, 50 250, 70 170 C 90 90, 200 70, 256 150 C 312 70, 422 90, 442 170 C 462 250, 392 330, 256 430 Z" fill="#FF2D55" ${CONTORNO}/>`),
  raio: svg(`<polygon points="300,40 120,290 240,290 200,470 390,200 270,200" fill="#FFD400" ${CONTORNO}/>`),
  explosao: svg(`<polygon points="${estrelaPontos(12, 230, 150)}" fill="#FF6B00" ${CONTORNO}/><polygon points="${estrelaPontos(12, 150, 100)}" fill="#FFD400"/>`),
  balao_fala: svg(`<path d="M256 70 C 390 70, 470 140, 470 225 C 470 310, 390 380, 256 380 C 230 380, 205 377, 182 372 L100 440 L118 350 C 70 320, 42 275, 42 225 C 42 140, 122 70, 256 70 Z" fill="#fff" stroke="#111" stroke-width="12" stroke-linejoin="round"/>`),
  balao_pensamento: svg(
    `<ellipse cx="256" cy="210" rx="210" ry="140" fill="#fff" stroke="#111" stroke-width="12"/>` +
      `<circle cx="140" cy="390" r="36" fill="#fff" stroke="#111" stroke-width="12"/><circle cx="92" cy="455" r="20" fill="#fff" stroke="#111" stroke-width="12"/>`,
  ),
  balao_grito: svg(`<polygon points="${estrelaPontos(14, 235, 175)}" fill="#fff" stroke="#111" stroke-width="12" stroke-linejoin="round"/>`),
  selo_novo: svg(
    `<polygon points="${estrelaPontos(16, 225, 185)}" fill="#FF2D55" ${CONTORNO}/>` +
      `<text x="256" y="256" dy="0.35em" text-anchor="middle" font-family="Selo" font-size="120" fill="#fff" transform="rotate(-12 256 256)">NOVO</text>`,
    `<style>@font-face{font-family:Selo;src:url('${fonte('Anton-Regular.ttf')}')}</style>`,
  ),
  selo_dica: selo('DICA', '#2F66FF'),
  selo_atencao: svg(
    `<path d="M256 60 L470 440 H42 Z" fill="#FFD400" ${CONTORNO}/>` +
      `<text x="256" y="330" dy="0.35em" text-anchor="middle" font-family="Selo" font-size="230" fill="#111">!</text>`,
    `<style>@font-face{font-family:Selo;src:url('${fonte('Anton-Regular.ttf')}')}</style>`,
  ),
  selo_top: svg(
    `<circle cx="256" cy="256" r="195" fill="#F5B301" ${CONTORNO}/><circle cx="256" cy="256" r="150" fill="none" stroke="#fff" stroke-width="10" stroke-dasharray="4 18"/>` +
      `<text x="256" y="256" dy="0.35em" text-anchor="middle" font-family="Selo" font-size="140" fill="#fff">TOP</text>`,
    `<style>@font-face{font-family:Selo;src:url('${fonte('Anton-Regular.ttf')}')}</style>`,
  ),
  selo_gratis: selo('GRÁTIS', '#1DB954', '#fff', 92),
  selo_oferta: selo('OFERTA', '#FF3B30', '#fff', 92),
  selo_ao_vivo: svg(
    `<rect x="36" y="176" width="440" height="160" rx="30" fill="#E0142B" ${CONTORNO}/><circle cx="110" cy="256" r="28" fill="#fff"/>` +
      `<text x="300" y="256" dy="0.35em" text-anchor="middle" font-family="Selo" font-size="84" fill="#fff">AO VIVO</text>`,
    `<style>@font-face{font-family:Selo;src:url('${fonte('Anton-Regular.ttf')}')}</style>`,
  ),
};

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 512, height: 512 } });
let feitos = 0;
for (const s of STICKERS) {
  const destino = join(aqui, `${s.id}.png`);
  if (s.noto) {
    if (existsSync(destino)) continue;
    const r = await fetch(`https://raw.githubusercontent.com/googlefonts/noto-emoji/main/2D/png/512/emoji_u${s.noto}.png`);
    if (!r.ok) throw new Error(`emoji ${s.noto}: ${r.status}`);
    writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
    feitos += 1;
    continue;
  }
  const desenho = DESENHOS[s.id];
  if (!desenho) throw new Error(`sem desenho para ${s.id}`);
  await pagina.setContent(`<html><body style="margin:0;background:transparent">${desenho}</body></html>`);
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.locator('svg').screenshot({ path: destino, omitBackground: true });
  feitos += 1;
}
await navegador.close();
console.log(`${feitos} stickers gerados em ${aqui}`);
