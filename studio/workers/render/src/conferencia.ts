// ============================================================
// A conferência de sobreposição: abre a animação no Chrome a 1080x1920,
// avança a linha do tempo para alguns instantes e mede cada texto visível
// (a caixa do TEXTO, pelos nós de texto -- não a do bloco com padding).
// O julgamento (grade, reservas, texto sobre texto) é do contrato:
// `problemasDeLayout`.
//
// A página vem de uma origem falsa interceptada (http://conferencia.local):
// o documento é o MESMO do render, com a mesma política de conteúdo
// ('self'), e gsap e fontes carregam como lá.
// ============================================================

import { FONTES_DOS_COMPONENTES } from '@makucho/studio-contracts/dist/componentes-hyperframes';
import { existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  COR_DO_VIDEO_NAS_FOTOS,
  INSTANTES_DA_CONFERENCIA,
  INSTANTES_DAS_FOTOS,
  documentoDaComposicao,
  fontesDoDocumento,
  problemasDeLayout,
  type JobDeConferencia,
  type MedidasDaAnimacao,
} from '@makucho/studio-contracts';

interface Pagina {
  setViewport(v: { width: number; height: number; deviceScaleFactor?: number }): Promise<void>;
  screenshot(o: { type: 'jpeg'; quality: number; encoding: 'base64' }): Promise<string>;
  setRequestInterception(v: boolean): Promise<void>;
  on(evento: 'request', f: (r: { url(): string; respond(r: { status: number; contentType: string; body: string | Buffer }): Promise<void>; abort(): Promise<void> }) => void): void;
  goto(url: string, o: { waitUntil: string; timeout: number }): Promise<unknown>;
  evaluate(expressao: string): Promise<unknown>;
  close(): Promise<void>;
}
interface Navegador {
  newPage(): Promise<Pagina>;
  close(): Promise<void>;
  connected: boolean;
}

// O puppeteer-core é dependência do produtor do HyperFrames: resolvido a
// partir dele (o pnpm não o expõe ao worker direto).
const requireDoProdutor = (() => {
  // O produtor não exporta o package.json: acha a pasta dele pelos caminhos
  // de resolução do Node (a real, fora do link simbólico do pnpm).
  for (const base of require.resolve.paths('@hyperframes/producer') ?? []) {
    const pasta = join(base, '@hyperframes', 'producer');
    if (existsSync(join(pasta, 'package.json'))) return createRequire(join(realpathSync(pasta), 'package.json'));
  }
  return require;
})();

let navegador: Promise<Navegador> | null = null;
// O worker tem 1 GB: o Chrome da conferência fecha depois de um tempo parado.
let ocioso: NodeJS.Timeout | null = null;
function fecharDepois() {
  if (ocioso) clearTimeout(ocioso);
  ocioso = setTimeout(() => {
    const b = navegador;
    navegador = null;
    void b?.then((n) => n.close()).catch(() => undefined);
  }, 90_000);
}
function abrirNavegador(): Promise<Navegador> {
  if (!navegador) {
    const puppeteer = requireDoProdutor('puppeteer-core') as { launch(o: Record<string, unknown>): Promise<Navegador> };
    navegador = puppeteer
      .launch({
        executablePath: process.env.HYPERFRAMES_BROWSER_PATH ?? '/usr/bin/chromium',
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
      })
      .catch((e: unknown) => {
        navegador = null;
        throw e;
      });
  }
  return navegador;
}

const ORIGEM = 'http://conferencia.local/';

/**
 * Roda NA PÁGINA (texto: o worker não tem os tipos do navegador): leva a
 * linha do tempo ao instante `t` e mede a caixa do texto de cada elemento
 * visível de #area, pelos nós de texto (não o bloco com padding).
 */
const MEDIR = `function (t) {
  var tl = window.__timelines && window.__timelines.cena;
  if (tl) tl.seek(t, false);
  var area = document.getElementById('area');
  var out = [];
  if (!area) return out;
  function visivel(el) {
    var o = 1;
    for (var e = el; e && e !== document.body; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      o *= parseFloat(cs.opacity || '1');
    }
    return o;
  }
  area.querySelectorAll('*').forEach(function (el) {
    var nos = Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 3 && (n.textContent || '').trim().length > 0; });
    if (!nos.length || visivel(el) < 0.3) return;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nos.forEach(function (n) {
      var rg = document.createRange();
      rg.selectNodeContents(n);
      Array.prototype.forEach.call(rg.getClientRects(), function (r) {
        if (r.width < 1 || r.height < 1) return;
        x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
      });
    });
    if (x1 > x0 && y1 > y0) out.push({ texto: nos.map(function (n) { return (n.textContent || '').trim(); }).join(' ').slice(0, 60), r: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
  });
  return out;
}`;

/** Mede e julga uma animação. Devolve os problemas de layout (vazio = ok). */
export async function conferirAnimacao(job: JobDeConferencia, opcoes: { pastaDeFontes: string }): Promise<string[]> {
  return comAPagina(job, opcoes, 1, async (pagina, duracaoS) => {
    const medidas: MedidasDaAnimacao[] = [];
    for (const f of INSTANTES_DA_CONFERENCIA) {
      const t = Math.round(duracaoS * f * 100) / 100;
      const textos = (await pagina.evaluate(`(${MEDIR})(${t})`)) as MedidasDaAnimacao['textos'];
      medidas.push({ t, textos });
    }
    return problemasDeLayout(job.composicao, medidas);
  });
}

/**
 * Fotografa a animação para a crítica: um JPEG (base64) por instante, em
 * 540x960. O fundo da página fica cinza: é onde o vídeo da pessoa aparece.
 */
export async function fotografarAnimacao(job: JobDeConferencia, opcoes: { pastaDeFontes: string }): Promise<string[]> {
  return comAPagina(job, opcoes, 0.5, async (pagina, duracaoS) => {
    await pagina.evaluate(`document.documentElement.style.background = '${COR_DO_VIDEO_NAS_FOTOS}'`);
    const fotos: string[] = [];
    for (const f of INSTANTES_DAS_FOTOS) {
      const t = Math.round(duracaoS * f * 100) / 100;
      await pagina.evaluate(`(function (t) { var tl = window.__timelines && window.__timelines.cena; if (tl) tl.seek(t, false); })(${t})`);
      fotos.push(await pagina.screenshot({ type: 'jpeg', quality: 72, encoding: 'base64' }));
    }
    return fotos;
  });
}

/** Abre a animação no Chrome (o mesmo documento do render) e roda `fazer` com a página pronta. */
async function comAPagina<T>(job: JobDeConferencia, opcoes: { pastaDeFontes: string }, escala: number, fazer: (pagina: Pagina, duracaoS: number) => Promise<T>): Promise<T> {
  const doc = documentoDaComposicao(job.composicao, { duracaoMs: job.duracaoMs, gsap: 'gsap.min.js', fontes: '', origens: "'self'", componentes: FONTES_DOS_COMPONENTES });
  const gsap = await readFile(require.resolve('gsap/dist/gsap.min.js'));
  const fontes = new Map<string, Buffer>();
  for (const { arquivo } of fontesDoDocumento(job.composicao)) {
    const b = await readFile(join(opcoes.pastaDeFontes, arquivo)).catch(() => null);
    if (b) fontes.set(arquivo, b);
  }

  let b = await abrirNavegador();
  if (!b.connected) {
    navegador = null;
    b = await abrirNavegador();
  }
  const pagina = await b.newPage();
  try {
    await pagina.setViewport({ width: 1080, height: 1920, deviceScaleFactor: escala });
    await pagina.setRequestInterception(true);
    pagina.on('request', (r) => {
      const url = r.url();
      if (!url.startsWith(ORIGEM)) return void r.abort();
      const nome = decodeURIComponent(url.slice(ORIGEM.length).split('?')[0] ?? '');
      if (nome === '' || nome === 'index.html') return void r.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: doc });
      if (nome === 'gsap.min.js') return void r.respond({ status: 200, contentType: 'application/javascript', body: gsap });
      const f = fontes.get(nome);
      if (f) return void r.respond({ status: 200, contentType: 'font/ttf', body: f });
      return void r.abort();
    });
    await pagina.goto(`${ORIGEM}index.html`, { waitUntil: 'load', timeout: 20_000 });
    await pagina.evaluate('document.fonts.ready.then(() => true)');

    return await fazer(pagina, Math.max(0.5, job.duracaoMs / 1000));
  } finally {
    await pagina.close().catch(() => undefined);
    fecharDepois();
  }
}
