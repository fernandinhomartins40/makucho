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
import { LAYOUTS_DA_CENA, divisaoDaCena } from './cenas-animadas';
import { FONTES_DE_VIDEO } from './estilos-de-legenda';

export const LIMITES_DA_ANIMACAO_HTML = { html: 40_000, css: 30_000, script: 30_000 } as const;

export const composicaoHtmlSchema = z
  .object({
    /** O miolo da animação (vai dentro de #area). Sem <script>. */
    html: z.string().min(1).max(LIMITES_DA_ANIMACAO_HTML.html),
    css: z.string().max(LIMITES_DA_ANIMACAO_HTML.css).default(''),
    /** Monta os movimentos em `tl` (gsap.timeline pausada, já criada). */
    script: z.string().max(LIMITES_DA_ANIMACAO_HTML.script).default(''),
    /** Onde passa: meio a meio (o vídeo desloca), cartão ou tela cheia. */
    layout: z.enum(LAYOUTS_DA_CENA),
    divisao: z.number().min(0.3).max(0.65).optional(),
    lado: z.enum(['cima', 'baixo']).optional(),
    foco: z.number().min(0).max(1).optional(),
    /** Sem o fundo escuro padrão no painel (meio a meio e tela cheia). */
    semFundo: z.boolean().optional(),
    /** Nome curto, para a timeline. */
    titulo: z.string().max(60).optional(),
  })
  .strict();

export type ComposicaoHtml = z.infer<typeof composicaoHtmlSchema>;

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
  return out;
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

/** O CSS base: fontes, cores da paleta e o fundo escuro do painel (o visual das referências). */
function cssBase(o: OpcoesDoDocumento, area: { x: number; y: number; w: number; h: number }, comFundo: boolean, css: string) {
  // font-display: block -- o quadro espera a fonte em vez de desenhar
  // com a reserva (serifada) e trocar depois.
  const faces = fontesDaComposicao(css)
    .map((f) => `@font-face { font-family: '${f.familia}'; src: url('${o.fontes}${f.arquivo}'); font-display: block; }`)
    .join('\n');
  return `${faces}
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
#cena { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: 'Inter SemiBold', 'Inter ExtraBold', sans-serif; color: #F1F3F4;
  --azul: #7BAAF7; --azul-forte: #4285F4; --vermelho: #EA4335; --amarelo: #FBBC04; --verde: #34A853; --roxo: #A142F4; --laranja: #FA7B17;
  --texto: #F1F3F4; --apagado: #9AA0A6; --cartao: #1E2126; --borda: rgba(255,255,255,0.10); --marca: ${o.corDaMarca ?? '#7BAAF7'}; }
#cena * { box-sizing: border-box; }
#area { position: absolute; left: ${area.x}px; top: ${area.y}px; width: ${area.w}px; height: ${area.h}px; }
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
  const duracaoS = Math.max(0.5, o.duracaoMs / 1000).toFixed(3);
  const csp = `default-src 'none'; script-src 'unsafe-inline' ${o.origens}; style-src 'unsafe-inline'; font-src ${o.origens} data:; img-src ${o.origens} data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'`;
  const escuta = o.previa
    ? `window.addEventListener('message', function (e) { var d = e.data; if (d && typeof d.hfT === 'number') tl.seek(d.hfT, false); });
  tl.seek(0, false);`
    : '';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>${cssBase(o, area, comFundo, c.css)}
${ESC(c.css)}</style>
<script src="${o.gsap}"></script>
</head><body>
<div id="cena" data-composition-id="cena" data-start="0" data-duration="${duracaoS}" data-width="${W}" data-height="${H}">
${comFundo ? `<div id="area"><div id="area-fundo"></div>` : `<div id="area">`}
${c.html}
</div>
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
  (function (tl) {
${ESC(c.script)}
  })(tl);
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
const VERSAO_DO_VIDEO = 'v2';

/**
 * A chave do vídeo pronto de uma animação: muda com o conteúdo, a área
 * e a duração -- a mesma composição nunca é renderizada duas vezes.
 */
export function chaveDaAnimacao(c: ComposicaoHtml, duracaoMs: number, corDaMarca = ''): string {
  const quadros = Math.max(1, Math.round((duracaoMs * 30) / 1000));
  const texto = JSON.stringify([VERSAO_DO_VIDEO, c.html, c.css, c.script, c.layout, c.divisao ?? null, c.lado ?? null, c.foco ?? null, c.semFundo ?? false, quadros, corDaMarca]);
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
  Variáveis prontas (opcionais): var(--texto) var(--apagado) var(--cartao) var(--borda) var(--marca) var(--azul) var(--vermelho) var(--amarelo) var(--verde) var(--roxo) var(--laranja).
- script: os movimentos, com GSAP, na linha do tempo \`tl\` que JÁ EXISTE (pausada). Ex.: tl.from('#titulo', { y: 40, opacity: 0, duration: 0.4, ease: 'back.out(1.6)' }, 0.2). O 3º argumento é o SEGUNDO em que o movimento começa, contado do início da animação -- ponha cada coisa no instante da palavra que a fala diz.
Regras técnicas (senão a animação é recusada ou sai errada):
- Nada de rede, fetch, imagens de fora, emoji (não há fonte de emoji no servidor): ícones e desenhos em SVG no próprio html.
- Nada de Math.random, Date, setTimeout, setInterval, requestAnimationFrame, repeat:-1, play(); nada de criar outra timeline. Irregularidade "à mão": números fixos escritos por você.
- Anime transform e opacidade (x, y, scale, rotation, opacity), cores e strokeDashoffset (desenhar SVG); clipPath para revelar. Nada de animar width/height/top/left.
- Estado inicial dentro do tween (tl.from / tl.fromTo), não num transform do CSS do mesmo elemento.
- Nada de <br>; o texto quebra sozinho (defina largura). Centralize com flex, não com translate(-50%).
- Vídeo vertical, visto no celular: título 88-132px, texto 30-40px, rótulo 20-24px, número em destaque 64-120px; margens laterais 48-72px.
- No cartão (sobre o vídeo), não cubra o rosto: topo do quadro (top 140-360px) ou a faixa de baixo (acima da legenda, bottom 380-700px). Fundo transparente fora do cartão.`;
