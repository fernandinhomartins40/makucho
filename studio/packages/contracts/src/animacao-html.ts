// ============================================================
// MAKUCHO STUDIO - Animações em HTML (HyperFrames, HeyGen, Apache 2.0).
//
// A IA escreve a animação como uma página: HTML + CSS + um script GSAP
// que monta os movimentos numa linha do tempo (`tl`) pausada. O mesmo
// documento serve a três lugares:
//
//   prévia     -- um iframe isolado por cima do palco; a agulha da
//                 timeline manda o instante e o script faz `tl.seek`;
//   servidor   -- o HyperFrames abre a página num Chrome sem tela e tira
//                 um PNG com transparência por quadro;
//   exportação -- os PNGs viram um MP4 comum com a cor e a transparência
//                 lado a lado (qualquer navegador decodifica), que o
//                 compositor junta de volta.
//
// Segurança: o documento é montado AQUI, não pela IA. A IA só entrega
// o miolo; a página leva uma política de conteúdo que bloqueia rede, e
// o texto passa por uma checagem antes (sem rede, relógio, sorteio,
// eval, acesso à página de fora).
// ============================================================

import { z } from 'zod';
import { LAYOUTS_DA_CENA, NOME_DO_LAYOUT_DA_CENA, divisaoDaCena } from './cenas-animadas';
import { FONTES_DE_VIDEO } from './estilos-de-legenda';
import { QUADRO_DA_GRADE, cssDaGrade, janelaDoPip } from './grade-dos-layouts';
import { cssDoTema } from './tema-da-animacao';
import { NOMES_DOS_COMPONENTES } from './catalogo-de-componentes';
import { legendaHyperFrames } from './legendas-hyperframes-catalogo';

export const LIMITES_DA_ANIMACAO_HTML = { html: 40_000, css: 30_000, script: 30_000 } as const;

/**
 * Onde a animação passa. Além dos da cena, o "pip" (skill talking-head-
 * recut): a animação ocupa a tela e o vídeo com o rosto vai para uma
 * janela de cantos arredondados num canto -- para conteúdo denso.
 */
export const LAYOUTS_DA_ANIMACAO = [...LAYOUTS_DA_CENA, 'pip'] as const;
export type LayoutDaAnimacaoHtml = (typeof LAYOUTS_DA_ANIMACAO)[number];
export const NOME_DO_LAYOUT_DA_ANIMACAO: Record<LayoutDaAnimacaoHtml, string> = {
  ...NOME_DO_LAYOUT_DA_CENA,
  pip: 'Vídeo no canto (PiP)',
};
export const CANTOS_DO_PIP = ['sup-esq', 'sup-dir', 'inf-esq', 'inf-dir'] as const;
export type CantoDoPip = (typeof CANTOS_DO_PIP)[number];
export const NOME_DO_CANTO_DO_PIP: Record<CantoDoPip, string> = {
  'sup-esq': 'Em cima, à esquerda',
  'sup-dir': 'Em cima, à direita',
  'inf-esq': 'Embaixo, à esquerda',
  'inf-dir': 'Embaixo, à direita',
};

export const composicaoHtmlSchema = z
  .object({
    /** O miolo da animação (vai dentro de #area). Sem <script>. */
    html: z.string().min(1).max(LIMITES_DA_ANIMACAO_HTML.html),
    css: z.string().max(LIMITES_DA_ANIMACAO_HTML.css).default(''),
    /** Monta os movimentos em `tl` (gsap.timeline pausada, já criada). */
    script: z.string().max(LIMITES_DA_ANIMACAO_HTML.script).default(''),
    /** Onde passa: meio a meio (o vídeo desloca), cartão ou tela cheia. */
    layout: z.enum(LAYOUTS_DA_ANIMACAO),
    divisao: z.number().min(0.3).max(0.65).optional(),
    lado: z.enum(['cima', 'baixo']).optional(),
    foco: z.number().min(0).max(1).optional(),
    /** No pip: o canto da janela do vídeo e o tamanho dela (fração da largura). */
    canto: z.enum(CANTOS_DO_PIP).optional(),
    tamanhoPip: z.number().min(0.25).max(0.5).optional(),
    /** Sem o fundo escuro padrão no painel (meio a meio e tela cheia). */
    semFundo: z.boolean().optional(),
    /** Nome curto, para a timeline. */
    titulo: z.string().max(60).optional(),
    /** O estilo (chave de ESTILOS_DE_ANIMACAO): a IA o mantém ao refazer e o troca quando pedem. */
    estilo: z.string().max(40).optional(),
    /** Paleta que recolore o estilo ("clima:indice", PALETAS_DE_ANIMACAO). */
    paleta: z.string().max(40).optional(),
    /** O que a animação explica (tipo, ideia, conteúdo): a IA a redesenha a partir disto. */
    briefing: z.string().max(2000).optional(),
  })
  .strict();

export type ComposicaoHtml = z.infer<typeof composicaoHtmlSchema>;

/**
 * A janela do vídeo no pip, em frações do quadro (x, y de cima-esquerda).
 * Largura e altura na MESMA fração: a janela tem a proporção do quadro,
 * e o vídeo inteiro cabe nela. Longe das bordas e da faixa da legenda.
 * A mesma conta na prévia (shader), no render (scale + overlay) e no
 * documento (o furo arredondado por onde o vídeo aparece).
 */
export function janelaDaComposicao(c: Pick<ComposicaoHtml, 'layout' | 'canto' | 'tamanhoPip'>): { x: number; y: number; w: number; h: number } | null {
  if (c.layout !== 'pip') return null;
  // A conta mora na grade (grade-dos-layouts): a janela fica entre o
  // cabeçalho do app e a faixa da legenda.
  const j = janelaDoPip(c.canto, c.tamanhoPip);
  return { x: j.x / QUADRO_DA_GRADE.w, y: j.y / QUADRO_DA_GRADE.h, w: j.w / QUADRO_DA_GRADE.w, h: j.h / QUADRO_DA_GRADE.h };
}

/** Raio dos cantos da janela do pip (px no quadro de 1080). */
export const RAIO_DO_PIP = 36;

/** A área da animação no quadro (pixels de 1080x1920): o painel no meio a meio, o quadro todo no resto. */
export function areaDaComposicao(c: Pick<ComposicaoHtml, 'layout' | 'divisao' | 'lado' | 'foco'>, W = 1080, H = 1920): { x: number; y: number; w: number; h: number } {
  const d = divisaoDaCena(c);
  if (!d) return { x: 0, y: 0, w: W, h: H };
  const alturaDoPainel = Math.round((1 - d.h) * H);
  return d.a > 0 ? { x: 0, y: 0, w: W, h: alturaDoPainel } : { x: 0, y: H - alturaDoPainel, w: W, h: alturaDoPainel };
}

// ---------- Checagem ----------

const PROIBIDOS_NO_SCRIPT: ReadonlyArray<[RegExp, string]> = [
  [/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/, 'nada de rede'],
  [/\bimport\s*\(|\bimportScripts\b|\brequire\s*\(/, 'nada de importar código'],
  [/\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/, 'nada de eval'],
  [/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/, 'nada de armazenamento'],
  [/\b(parent|top|opener)\s*\.|window\.(parent|top|opener)\b/, 'nada de acessar a página de fora'],
  [/\bDate\.now\b|\bnew\s+Date\b|performance\.now/, 'nada de relógio: o tempo é o da linha do tempo'],
  [/Math\.random/, 'nada de sorteio: a animação tem de sair igual em todo quadro'],
  [/\bset(Timeout|Interval)\b|requestAnimationFrame/, 'nada de temporizador: tudo vai na linha do tempo (tl)'],
  [/repeat\s*:\s*-1/, 'nada de repetir para sempre (repeat: -1); use um número'],
  [/gsap\.timeline\s*\(/, 'não crie outra linha do tempo: use a `tl` que já existe'],
  [/\.play\s*\(\s*\)|\bpaused\s*:\s*false/, 'não dê play: quem move a linha do tempo é o Studio'],
];

const PROIBIDOS_NO_HTML: ReadonlyArray<[RegExp, string]> = [
  [/<\s*script\b/i, 'sem <script> no html (o código vai em `script`)'],
  [/<\s*(iframe|object|embed|link|meta|base|form|frame)\b/i, 'tag não permitida'],
  [/\son[a-z]+\s*=/i, 'sem atributos de evento (onclick, onload...)'],
  [/javascript\s*:/i, 'sem javascript: em links'],
  [/<\s*(video|audio)\b/i, 'sem vídeo ou áudio dentro da animação (use as faixas do Studio)'],
];

const PROIBIDOS_NO_CSS: ReadonlyArray<[RegExp, string]> = [
  [/@import/i, 'sem @import'],
  [/url\s*\(\s*['"]?\s*(https?:|\/\/)/i, 'sem arquivos de fora (url com http)'],
  [/<\s*\/?\s*style/i, 'sem <style> dentro do css'],
];

/**
 * O que impede a composição de ir para o vídeo (vazio = pode). Barreira
 * antes do lint do HyperFrames e da política de conteúdo da página.
 */
export function problemasDaComposicao(c: ComposicaoHtml): string[] {
  const out: string[] = [];
  for (const [re, msg] of PROIBIDOS_NO_SCRIPT) if (re.test(c.script)) out.push(`script: ${msg}`);
  for (const [re, msg] of PROIBIDOS_NO_HTML) if (re.test(c.html)) out.push(`html: ${msg}`);
  for (const [re, msg] of PROIBIDOS_NO_CSS) if (re.test(c.css)) out.push(`css: ${msg}`);
  if (/https?:\/\//i.test(c.html)) out.push('html: sem endereços de fora (imagens vão como SVG no próprio html)');
  if (!/\btl\s*\./.test(c.script)) out.push('script: monte os movimentos em `tl` (tl.from, tl.to, tl.fromTo...)');
  for (const m of c.html.matchAll(/<[^>]*\bdata-hf\s*=\s*["']([^"']+)["'][^>]*>/g)) {
    const nome = m[1]!;
    if (!NOMES_DOS_COMPONENTES.includes(nome) && !legendaHyperFrames(nome)) out.push(`html: o componente "${nome}" não existe no catálogo (use um de: ${NOMES_DOS_COMPONENTES.join(', ')})`);
    const vars = /data-vars\s*=\s*'([^']*)'/.exec(m[0]!)?.[1];
    if (vars) {
      try {
        JSON.parse(vars);
      } catch {
        out.push(`html: data-vars do componente "${nome}" não é JSON válido (use aspas simples fora e duplas dentro)`);
      }
    }
  }
  return out;
}

/**
 * Monta os componentes do catálogo do HyperFrames que a IA declarou no
 * html (`<div data-hf="nome" data-inicio data-duracao data-vars>`): cada
 * instância com id próprio, as variáveis dela em getVariables() e a linha
 * do tempo dela guardada para entrar na `tl` no segundo pedido. Roda
 * antes do script da IA (o DOM dos componentes já existe para ela).
 */
const MONTAR_COMPONENTES = `(function () {
  var dados = document.getElementById('hf-componentes');
  var fontes = dados ? JSON.parse(dados.textContent) : {};
  // Os fontes vêm em base64 (UTF-8): o lint não lê como código o que só é montado aqui.
  function decodificar(b64) { var bin = atob(b64); var bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }
  var montados = [];
  var hosts = document.querySelectorAll('#area [data-hf]');
  for (var k = 0; k < hosts.length; k++) {
    var el = hosts[k];
    var nome = el.getAttribute('data-hf');
    var src = fontes[nome] ? decodificar(fontes[nome]) : '';
    if (!src) continue;
    var uid = 'hf' + (k + 1) + '-' + nome;
    var inicio = parseFloat(el.getAttribute('data-inicio')) || 0;
    var dur = parseFloat(el.getAttribute('data-duracao')) || 3;
    var vars = {};
    try { vars = JSON.parse(el.getAttribute('data-vars') || '{}'); } catch (e) {}
    var html = src.split('id="root"').join('id="' + uid + '"').split('getElementById("root")').join('getElementById("' + uid + '")').split("getElementById('root')").join("getElementById('" + uid + "')").split('#root').join('#' + uid);
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var scripts = Array.prototype.slice.call(tmp.querySelectorAll('script'));
    scripts.forEach(function (s) { s.parentNode.removeChild(s); });
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    while (tmp.firstChild) el.appendChild(tmp.firstChild);
    var raiz = document.getElementById(uid);
    if (raiz) { raiz.setAttribute('data-duration', String(dur)); raiz.style.position = 'absolute'; raiz.style.inset = '0'; }
    window.__hyperframes = { getVariables: function () { return vars; } };
    var tls = (window.__timelines = window.__timelines || {});
    var antes = {};
    Object.keys(tls).forEach(function (c) { antes[c] = tls[c]; });
    scripts.forEach(function (s) { var x = document.createElement('script'); x.text = s.textContent; el.appendChild(x); });
    var sub = null;
    Object.keys(tls).forEach(function (c) { if (c !== 'cena' && tls[c] !== antes[c]) { sub = tls[c]; delete tls[c]; } });
    montados.push({ el: el, sub: sub, inicio: inicio, dur: dur });
  }
  window.__hfMontados = montados;
})();`;

/** Depois do script da IA: cada componente entra na `tl` no seu segundo, visível só na sua janela. */
const ENCAIXAR_COMPONENTES = `(window.__hfMontados || []).forEach(function (m) {
    if (m.sub) { m.sub.paused(false); tl.add(m.sub, m.inicio); }
    tl.set(m.el, { autoAlpha: 0 }, 0);
    tl.set(m.el, { autoAlpha: 1 }, m.inicio);
    tl.set(m.el, { autoAlpha: 0 }, m.inicio + m.dur);
  });`;

/** Texto em base64 (UTF-8), igual no Node e no navegador. */
function paraBase64(texto: string): string {
  // Globais do Node e do navegador (o pacote não carrega os tipos do DOM).
  const g = globalThis as unknown as { TextEncoder: new () => { encode(s: string): Uint8Array }; btoa(s: string): string };
  const bytes = new g.TextEncoder().encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return g.btoa(bin);
}

/** Os componentes do catálogo que o html declara (data-hf="nome"). */
export function componentesDaComposicao(html: string): string[] {
  return [...new Set([...html.matchAll(/data-hf\s*=\s*["']([a-z0-9-]+)["']/g)].map((m) => m[1]!))];
}

// ---------- O documento ----------

export interface OpcoesDoDocumento {
  duracaoMs: number;
  /** Onde está o gsap.min.js (render: "gsap.min.js"; prévia: URL do Studio). */
  gsap: string;
  /** Pasta das fontes (render: "" = a própria pasta; prévia: "/fonts/"). */
  fontes: string;
  /** Origens liberadas na política de conteúdo (render: 'self'; prévia: a do Studio). */
  origens: string;
  /** Prévia: ouve o instante que a página de fora manda. */
  previa?: boolean;
  corDaMarca?: string;
  largura?: number;
  altura?: number;
  /**
   * Os fontes dos componentes do catálogo (FONTES_DOS_COMPONENTES, em
   * '@makucho/studio-contracts/componentes-hyperframes'): só os que o html
   * usa entram no documento.
   */
  componentes?: Record<string, string>;
}

const ESC = (s: string) => s.replace(/<\/(script|style)/gi, '<\\/$1');

// ---------- Fontes ----------

/** As famílias que a animação pode usar: as mesmas 70+ fontes livres das legendas. */
export const FAMILIAS_DA_ANIMACAO: ReadonlyArray<{ familia: string; arquivo: string; categoria: string }> = (() => {
  const vistas = new Set<string>();
  const out: Array<{ familia: string; arquivo: string; categoria: string }> = [];
  for (const f of Object.values(FONTES_DE_VIDEO)) {
    if (vistas.has(f.nomeAss)) continue;
    vistas.add(f.nomeAss);
    out.push({ familia: f.nomeAss, arquivo: f.arquivo, categoria: f.categoria });
  }
  return out;
})();

/**
 * As fontes que o CSS da animação usa (pelo nome da família). As Inter
 * vão sempre: são o texto padrão da cena. Só as usadas entram no
 * documento -- e só os arquivos delas vão para o render.
 */
export function fontesDaComposicao(css: string): Array<{ familia: string; arquivo: string }> {
  const baixo = css.toLowerCase();
  const usadas = FAMILIAS_DA_ANIMACAO.filter((f) => {
    const nome = f.familia.toLowerCase();
    return f.familia.startsWith('Inter ') || baixo.includes(`'${nome}'`) || baixo.includes(`"${nome}"`);
  });
  return usadas.map(({ familia, arquivo }) => ({ familia, arquivo }));
}

/** As fontes que o documento carrega: as do CSS da IA e as do tema (var(--fonte-*)). */
export function fontesDoDocumento(c: Pick<ComposicaoHtml, 'css' | 'estilo' | 'paleta'>): Array<{ familia: string; arquivo: string }> {
  return fontesDaComposicao(`${c.css}\n${cssDoTema(c)}`);
}

/** O CSS base: fontes, cores da paleta e o fundo escuro do painel (o visual das referências). */
function cssBase(o: OpcoesDoDocumento, area: { x: number; y: number; w: number; h: number }, comFundo: boolean, css: string, grade = '', tema = '') {
  // font-display: block -- o quadro espera a fonte em vez de desenhar
  // com a reserva (serifada) e trocar depois.
  const faces = fontesDaComposicao(`${css}\n${tema}`)
    .map((f) => `@font-face { font-family: '${f.familia}'; src: url('${o.fontes}${f.arquivo}'); font-display: block; }`)
    .join('\n');
  return `${faces}
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
#cena { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: 'Inter SemiBold', 'Inter ExtraBold', sans-serif; color: #F1F3F4;
  --azul: #7BAAF7; --azul-forte: #4285F4; --vermelho: #EA4335; --amarelo: #FBBC04; --verde: #34A853; --roxo: #A142F4; --laranja: #FA7B17;
  --texto: #F1F3F4; --apagado: #9AA0A6; --cartao: #1E2126; --borda-cor: rgba(255,255,255,0.10); --marca: ${o.corDaMarca ?? '#7BAAF7'};
  ${tema} }
#cena * { box-sizing: border-box; }
#area { position: absolute; left: ${area.x}px; top: ${area.y}px; width: ${area.w}px; height: ${area.h}px; ${grade} }
${comFundo ? `#area-fundo { position: absolute; inset: 0; background:
  radial-gradient(ellipse 70% 45% at 50% 0%, rgba(66,133,244,0.22), transparent 70%),
  radial-gradient(ellipse 55% 40% at 85% 100%, rgba(52,168,83,0.16), transparent 70%),
  radial-gradient(ellipse 45% 35% at 10% 90%, rgba(251,188,4,0.08), transparent 70%),
  linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px) 0 0 / 54px 54px,
  linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px) 0 0 / 54px 54px,
  #0B0E13; }` : ''}`;
}

/**
 * A página inteira da animação. Montada pelo Studio (a IA só entrega o
 * miolo): política de conteúdo sem rede, raiz da composição no formato
 * do HyperFrames e uma única linha do tempo pausada, `tl`.
 */
export function documentoDaComposicao(c: ComposicaoHtml, o: OpcoesDoDocumento): string {
  const W = o.largura ?? 1080;
  const H = o.altura ?? 1920;
  const area = areaDaComposicao(c, W, H);
  const comFundo = c.layout !== 'cartao' && !c.semFundo;
  // Pip: um furo de cantos arredondados em #area (máscara SVG, alfa) por
  // onde o vídeo aparece, e a moldura por cima, fora da máscara.
  // Os componentes do catálogo que o html declara e que vieram com fonte.
  const usados = componentesDaComposicao(c.html).filter((n) => o.componentes?.[n]);
  const janela = janelaDaComposicao(c);
  let furo = '';
  let moldura = '';
  if (janela) {
    const x = Math.round(janela.x * W);
    const y = Math.round(janela.y * H);
    const w = Math.round(janela.w * W);
    const h = Math.round(janela.h * H);
    const r = RAIO_DO_PIP;
    const d = `M0 0H${W}V${H}H0Z M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><path fill-rule='evenodd' d='${d}'/></svg>`;
    const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    furo = `#area { -webkit-mask: ${url} 0 0 / 100% 100% no-repeat; mask: ${url} 0 0 / 100% 100% no-repeat; }`;
    moldura = `<div id="pip-moldura" style="position:absolute;left:${x - 3}px;top:${y - 3}px;width:${w + 6}px;height:${h + 6}px;border:6px solid rgba(255,255,255,0.92);border-radius:${r + 3}px;box-shadow:0 18px 50px rgba(0,0,0,0.35);box-sizing:border-box;pointer-events:none"></div>`;
  }
  const duracaoS = Math.max(0.5, o.duracaoMs / 1000).toFixed(3);
  const csp = `default-src 'none'; script-src 'unsafe-inline' ${o.origens}; style-src 'unsafe-inline'; font-src ${o.origens} data:; img-src ${o.origens} data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'`;
  const escuta = o.previa
    ? `window.addEventListener('message', function (e) { var d = e.data; if (d && typeof d.hfT === 'number') tl.seek(d.hfT, false); });
  tl.seek(0, false);`
    : '';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>${cssBase(o, area, comFundo, c.css, cssDaGrade(c, area), cssDoTema(c))}
${ESC(c.css)}
${furo}</style>
<script src="${o.gsap}"></script>
</head><body>
<div id="cena" data-composition-id="cena" data-start="0" data-duration="${duracaoS}" data-width="${W}" data-height="${H}">
${comFundo ? `<div id="area"><div id="area-fundo"></div>` : `<div id="area">`}
${c.html}
</div>
${moldura}
</div>
${usados.length ? `<script type="application/json" id="hf-componentes">${JSON.stringify(Object.fromEntries(usados.map((n) => [n, paraBase64(o.componentes![n]!)])))}</script>
<script>${MONTAR_COMPONENTES}</script>` : ''}
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
  (function (tl) {
${ESC(c.script)}
  })(tl);
  ${usados.length ? ENCAIXAR_COMPONENTES : ''}
  window.__timelines["cena"] = tl;
  ${escuta}
</script>
</body></html>`;
}

// ---------- Identidade (o vídeo pronto de cada composição) ----------

/** Hash de texto (cyrb53): o mesmo no navegador e no servidor. */
function cyrb53(s: string, semente = 0): string {
  let h1 = 0xdeadbeef ^ semente;
  let h2 = 0x41c6ce57 ^ semente;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Versão do formato do vídeo pronto: mudar invalida os antigos. */
// v2: as fontes que o CSS usa (antes só as Inter carregavam).
// v3: a grade de segurança (variáveis --util-*) e o pip entre o cabeçalho e a legenda.
// v4: a escala e o tema em variáveis (--t-*, --cor-*, --fonte-*).
// v5: componentes do catálogo do HyperFrames (data-hf).
// v6: fontes dos componentes em base64 no documento.
const VERSAO_DO_VIDEO = 'v6';

/**
 * A chave do vídeo pronto de uma animação: muda com o conteúdo, a área
 * e a duração -- a mesma composição nunca é renderizada duas vezes.
 */
export function chaveDaAnimacao(c: ComposicaoHtml, duracaoMs: number, corDaMarca = ''): string {
  const quadros = Math.max(1, Math.round((duracaoMs * 30) / 1000));
  const texto = JSON.stringify([VERSAO_DO_VIDEO, c.html, c.css, c.script, c.layout, c.divisao ?? null, c.lado ?? null, c.foco ?? null, c.semFundo ?? false, quadros, corDaMarca, c.canto ?? null, c.tamanhoPip ?? null, c.estilo ?? null, c.paleta ?? null]);
  return `${cyrb53(texto)}${cyrb53(texto, 7)}`.slice(0, 24);
}

export const pedidoDeAnimacaoSchema = z.object({
  composicao: composicaoHtmlSchema,
  duracaoMs: z.number().int().min(300).max(60_000),
});

export type EstadoDaAnimacao = 'pronta' | 'preparando' | 'falhou';

/** O que a fila do render recebe para preparar o vídeo de uma animação. */
export interface JobDeAnimacao {
  workspaceId: string;
  chave: string;
  composicao: ComposicaoHtml;
  duracaoMs: number;
  corDaMarca?: string;
}

/** Onde o vídeo pronto fica no storage. */
export function chaveDoArquivoDaAnimacao(workspaceId: string, chave: string): string {
  return `animacoes/${workspaceId.replace(/[^A-Za-z0-9_-]/g, '')}/${chave.replace(/[^a-z0-9]/g, '')}.mp4`;
}

// ---------- Para a IA ----------

/** As fontes, agrupadas, para a IA escolher pelo nome exato. */
function listaDeFontes(): string {
  const grupos: Record<string, string[]> = {};
  for (const f of FAMILIAS_DA_ANIMACAO) (grupos[f.categoria] ??= []).push(`'${f.familia}'`);
  return Object.entries(grupos)
    .map(([c, fs]) => `${c.replace('_', ' ')}: ${fs.join(', ')}`)
    .join('\n  ');
}

/** As regras do HyperFrames (skills hyperframes-core / -animation / talking-head-recut), resumidas para a IA. */
export const REGRAS_DA_ANIMACAO_HTML = `ANIMAÇÃO EM HTML (HyperFrames). Você entrega três textos:
- html: o miolo. Ele vai DENTRO de #area (a área da animação: no meio_a_meio é o painel, 1080 x a altura do painel; no cartão e na tela cheia é o quadro todo, 1080x1920). Use position:absolute ou flex dentro de #area.
- css: estilos (classes e ids seus). Use SÓ estas fontes, pelo nome exato entre aspas (outra fonte não existe no servidor e sai serifada):
  ${listaDeFontes()}
  Variáveis prontas (opcionais): var(--texto) var(--apagado) var(--cartao) var(--borda-cor) var(--marca) var(--azul) var(--vermelho) var(--amarelo) var(--verde) var(--roxo) var(--laranja).
- script: os movimentos, com GSAP, na linha do tempo \`tl\` que JÁ EXISTE (pausada). Ex.: tl.from('#titulo', { y: 40, opacity: 0, duration: 0.4, ease: 'back.out(1.6)' }, 0.2). O 3º argumento é o SEGUNDO em que o movimento começa, contado do início da animação -- ponha cada coisa no instante da palavra que a fala diz.
Regras técnicas (senão a animação é recusada ou sai errada):
- Nada de rede, fetch, imagens de fora, emoji (não há fonte de emoji no servidor): ícones e desenhos em SVG no próprio html.
- Nada de Math.random, Date, setTimeout, setInterval, requestAnimationFrame, repeat:-1, play(); nada de criar outra timeline. Irregularidade "à mão": números fixos escritos por você.
- Anime transform e opacidade (x, y, scale, rotation, opacity), cores e strokeDashoffset (desenhar SVG); clipPath para revelar. Nada de animar width/height/top/left.
- Estado inicial dentro do tween (tl.from / tl.fromTo), não num transform do CSS do mesmo elemento.
- Nada de <br>; o texto quebra sozinho (defina largura). Centralize com flex, não com translate(-50%).
- Vídeo vertical, visto no celular: título 88-132px, texto 30-40px, rótulo 20-24px, número em destaque 64-120px; margens laterais 48-72px.
- GRADE DE SEGURANÇA: cada pedido traz a grade do layout com números. Todo texto e elemento importante fica DENTRO da área útil (use var(--util-x/-y/-w/-h)); nada sobre as áreas reservadas (cabeçalho do app e logo, faixa da legenda, interface do app embaixo, janela do vídeo). O fundo pode ocupar #area inteira. Carimbos, selos e setas também respeitam a área útil e não cobrem outro texto.
- No cartão (sobre o vídeo), fundo transparente fora do cartão.`;
