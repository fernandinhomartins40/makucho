// ============================================================
// Traz componentes do registro do HyperFrames (HeyGen, Apache 2.0) para o
// catálogo das animações.
//
//   node scripts/gerar-componentes-hyperframes.mjs <registry/components> [registry/blocks]
//
// Gera src/componentes-hyperframes-extra.ts (o miolo de cada componente) e
// src/catalogo-de-componentes-extra.ts (o que a IA lê para escolher). Os 34
// primeiros (catalogo-de-componentes.ts, componentes-hyperframes.ts) ficam
// como estão.
//
// Só entram componentes no formato montável (<template> com #root, timeline
// própria em window.__timelines), sem <canvas>/WebGL e sem nada da rede além
// do gsap (que o documento já carrega) e das fontes (que vêm do tema).
// ============================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = process.argv[2];
if (!pasta || !existsSync(pasta)) {
  console.error('uso: node scripts/gerar-componentes-hyperframes.mjs <registry/components>');
  process.exit(1);
}
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Curadoria: vídeo curto de quem fala para a câmera. grupo: dados | texto | destaque. */
const ESCOLHIDOS = {
  // Prova, números e listas.
  'logo-wall': 'dados',
  'trust-strip': 'dados',
  'avatar-cloud': 'dados',
  'testimonial-proof-card': 'dados',
  'social-proof-card': 'dados',
  'marker-checklist-card': 'dados',
  // Texto e títulos.
  'wordmark-tiles': 'texto',
  'titlecard-lockup': 'texto',
  'logo-brand-close': 'texto',
  'char-slam-explode': 'texto',
  'variable-axis-type': 'texto',
  'stitched-text-draw': 'texto',
  'whiteboard-ink': 'texto',
  'notes-typing': 'texto',
  'typed-prompt': 'texto',
  // Conversas, notificações, telas e chamadas.
  'chat-message': 'destaque',
  'chat-thread': 'destaque',
  'notification-pileup': 'destaque',
  'cta-lockup': 'destaque',
  'store-badge-lockup': 'destaque',
  'toggle-flip': 'destaque',
  'gesture-tap': 'destaque',
  'press-ripple': 'destaque',
  'before-after-wipe': 'destaque',
  'split-tilt-cards': 'destaque',
  'device-frame-stage': 'destaque',
  'browser-device-stage': 'destaque',
  'multi-device-splay': 'destaque',
  'scroll-feed': 'destaque',
  'swipe-rail': 'destaque',
  'focus-swap': 'destaque',
  'modal-morph': 'destaque',
  'screen-flow-carousel': 'destaque',
  'sticky-mock-swap': 'destaque',
  'ui-focus-zoom': 'destaque',
  'telemetry-hud': 'destaque',
  'spring-stack-shuffle': 'destaque',
  // Ponteiros e toques.
  'dart-cursor': 'destaque',
  'cursor-annotate': 'destaque',
  'magnetic-cursor': 'destaque',
  'touch-indicator': 'destaque',
  'cursor-drag-drop': 'destaque',
  'oversized-cursor': 'destaque',
  'cursor-text-select': 'destaque',
  'cursor-zoom-follow': 'destaque',
  'cursor-context-menu': 'destaque',
  'multiplayer-cursors': 'destaque',
  'agent-cursor': 'destaque',
  'pull-to-refresh': 'destaque',
  'cursor-glyph-trail': 'destaque',
  // Efeitos de destaque e marca.
  'gloss-sweep': 'destaque',
  'light-sweep-pass': 'destaque',
  'echo-trail': 'destaque',
  'svg-mask-reveal': 'destaque',
  'radial-surround': 'destaque',
  'overwhelm-surround': 'destaque',
  'locked-nucleus-orbit': 'destaque',
  'constellation-hub': 'destaque',
  'velocity-throw-snap': 'destaque',
  'facet-morph': 'destaque',
  'scan-band': 'destaque',
  'beat-accent': 'destaque',
  'icon-morph-beat': 'destaque',
  'tracing-beam': 'destaque',
  'offset-path-traveler': 'destaque',
  'stop-motion-cadence': 'destaque',
  'logo-sting': 'destaque',
  'paper-collage-reveal': 'destaque',
};
/**
 * Reprovados na bancada (scratchpad: cada um renderizado no Chrome em vários
 * instantes): erro de script, texto em inglês sem campo para trocar, ou tela
 * de aplicativo genérica que não serve ao vídeo de quem fala.
 */
const REPROVADOS = new Set([
  'cursor-text-select', // erro de script (offsetWidth de undefined)
  'logo-wall', 'notification-pileup', 'device-frame-stage', 'multi-device-splay', 'focus-swap', 'modal-morph',
  'ui-focus-zoom', 'cursor-zoom-follow', 'pull-to-refresh', 'browser-device-stage', 'stop-motion-cadence', 'echo-trail',
  'paper-collage-reveal',
  ...(process.env.REPROVADOS || '').split(',').filter(Boolean),
]);

function secao(md, ...titulos) {
  for (const t of titulos) {
    const m = new RegExp(`^##+\\s*${t}[^\\n]*\\n([\\s\\S]*?)(?=^##|$)`, 'im').exec(md);
    if (m) return m[1].replace(/\s+/g, ' ').trim().slice(0, 400);
  }
  return '';
}

const fontes = {};
const catalogo = [];
const pulados = [];
for (const [nome, grupo] of Object.entries(ESCOLHIDOS)) {
  if (REPROVADOS.has(nome)) continue;
  const html = join(pasta, nome, `${nome}.html`);
  const item = join(pasta, nome, 'registry-item.json');
  if (!existsSync(html) || !existsSync(item)) {
    pulados.push(`${nome} (não existe)`);
    continue;
  }
  const s = readFileSync(html, 'utf8');
  // O <template> de verdade: o cabeçalho (comentário) de alguns cita "<template>" no texto.
  const tpl = /<template>([\s\S]*?)<\/template>/.exec(s.replace(/<!--[\s\S]*?-->/g, ''))?.[1];
  if (!tpl || !/id="root"/.test(tpl)) {
    pulados.push(`${nome} (formato não montável)`);
    continue;
  }
  let miolo = tpl
    .replace(/<script[^>]*src=["'][^"']*gsap[^"']*["'][^>]*>\s*<\/script>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/@import[^;]+;/g, '')
    .trim();
  // Sem os comentários (explicações do autor), que só pesam no documento --
  // mas só nos estilos e fora dos scripts: dentro do código um "/*" pode
  // estar numa string, e cortar ali quebra o componente.
  miolo = miolo
    .replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_t, attrs, css) => `<style${attrs}>${css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]+/gm, '').replace(/\n{2,}/g, '\n')}</style>`)
    .split(/(<script[\s\S]*?<\/script>)/i)
    .map((parte) => (/^<script/i.test(parte) ? parte : parte.replace(/<!--[\s\S]*?-->/g, '')))
    .join('');
  if (/<canvas|getContext\(/.test(miolo)) {
    pulados.push(`${nome} (canvas)`);
    continue;
  }
  if (/(src|href)\s*=\s*["']https?:|url\(\s*["']?https?:/i.test(miolo)) {
    pulados.push(`${nome} (usa a rede)`);
    continue;
  }
  const m = JSON.parse(readFileSync(item, 'utf8'));
  const readme = existsSync(join(pasta, nome, 'README.md')) ? readFileSync(join(pasta, nome, 'README.md'), 'utf8') : '';
  fontes[nome] = miolo;
  catalogo.push({
    nome,
    grupo,
    titulo: m.title ?? nome,
    oQue: (m.description ?? '').trim(),
    quando: secao(readme, 'When to use', 'Use when', 'Use it when', 'When'),
    evitar: secao(readme, 'Avoid', 'When not to use', "Don't use"),
    envelope: secao(readme, 'Envelope', 'Timing'),
    variaveis: (m.variables ?? []).map((v) => ({
      id: v.id,
      tipo: v.type,
      padrao: v.default ?? null,
      descricao: v.description ?? v.label ?? '',
      ...(v.options ? { opcoes: v.options.map((o) => (typeof o === 'object' ? o.value : o)) } : {}),
      ...(v.min !== undefined ? { min: v.min } : {}),
      ...(v.max !== undefined ? { max: v.max } : {}),
    })),
  });
}

// ---------- Cenas prontas (registry/blocks) ----------
//
// Páginas inteiras (1080x1920 ou 1920x1080) com texto, cores e fontes fixos.
// Viram componentes: as regras gerais (*, html, body) saem, o palco é
// enquadrado na caixa (mantendo a proporção), cada texto da tela
// vira um campo (t1, t2...) que a IA preenche, e fotos de exemplo viram uma
// silhueta. Só as curtas (até ~9 s) e sem canvas/rede. O desenho é enquadrado na caixa.
const CENAS = {
  'instagram-follow': 'destaque', 'tiktok-follow': 'destaque', 'spotify-card': 'destaque',
  'x-post': 'destaque', 'reddit-post': 'destaque', 'macos-notification': 'destaque',
  'lt-accent-underline': 'texto', 'lt-bold-block': 'texto', 'lt-clean-bar': 'texto', 'lt-color-block': 'texto',
  'lt-dark-card': 'texto', 'lt-kicker-name': 'texto', 'lt-mask-reveal': 'texto', 'lt-side-rule': 'texto',
  'lt-soft-pill': 'texto', 'lt-stack-bars': 'texto', 'yt-lower-third': 'texto',
  // Reprovadas na bancada: thread-message-stack (erro de script), news-ticker (quebra fora do
  // palco inteiro), logo-outro (logo de outra marca) e yt-comment-card, split-flap-board, mk-*
  // (texto em inglês montado pelo script, sem campo para trocar).
};
const SILHUETA = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#3a3f4b"/><circle cx="50" cy="38" r="18" fill="#9aa3b5"/><path d="M14 100c4-22 18-34 36-34s32 12 36 34z" fill="#9aa3b5"/></svg>')}`;

/**
 * O script que enquadra o desenho na caixa: mede o que aparece no meio da
 * animação e ajusta (sem distorcer, centrado). `W`x`H` é o palco original --
 * o que ocupa quase ele todo é fundo e não entra na medida.
 */
function jsDeEnquadrar(nome, W, H) {
  return `(function () {
var palco = document.getElementById('palco-hf'); if (!palco) return;
var raiz = palco.parentElement; var lw = raiz.clientWidth || ${W}; var lh = raiz.clientHeight || ${H};
var tl = window.__timelines && window.__timelines[${JSON.stringify(nome)}];
var enquadrar = function () {
var k = Math.min(1, lw / ${W}); var tx = 0; var ty = 0;
var t0 = tl && tl.totalTime ? tl.totalTime() : 0;
palco.style.transform = 'none';
try {
var base = palco.getBoundingClientRect(); var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
[0.3, 0.5, 0.7].forEach(function (p) {
if (tl && tl.progress) tl.progress(p, true);
palco.querySelectorAll('*').forEach(function (el) {
var r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
if (r.width >= ${W} * 0.9 && r.height >= ${H} * 0.9) return;
for (var a = el; a && a !== palco; a = a.parentElement) { var cs = getComputedStyle(a); if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return; if (a !== el && cs.overflowX !== 'visible') return; }
x0 = Math.min(x0, r.left - base.left); y0 = Math.min(y0, r.top - base.top); x1 = Math.max(x1, r.right - base.left); y1 = Math.max(y1, r.bottom - base.top);
});
});
if (x1 > x0 && y1 > y0) { k = Math.min(lw / (x1 - x0), lh / (y1 - y0)) * 0.94; tx = lw / 2 - k * (x0 + x1) / 2; ty = lh / 2 - k * (y0 + y1) / 2; }
} catch (e) {}
if (tl && tl.totalTime) tl.totalTime(t0, true);
palco.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + k + ')';
};
enquadrar();
// As fontes chegam depois e mudam a largura dos textos: mede de novo com elas.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(enquadrar);
})();`;
}

/** Os textos da tela viram campos (t1, t2...): cada um num <span data-hf-t>. Fora de svg. */
function comCamposDeTexto(markup) {
  const textos = [];
  const html = markup
    .split(/(<svg[\s\S]*?<\/svg>)/i)
    .map((parte) =>
      /^<svg/i.test(parte)
        ? parte
        : parte.replace(/>([^<>]*[A-Za-zÀ-ÿ0-9][^<>]*)</g, (_t, txt) => {
            const limpo = txt.replace(/\s+/g, ' ').trim();
            if (!limpo) return `>${txt}<`;
            textos.push(limpo);
            return `><span data-hf-t="t${textos.length}">${limpo}</span><`;
          }),
    )
    .join('');
  return { html, textos };
}
const JS_DOS_TEXTOS = `(function () {
var palco = document.getElementById('palco-hf'); if (!palco) return;
var vars = (window.__hyperframes && window.__hyperframes.getVariables && window.__hyperframes.getVariables()) || {};
palco.querySelectorAll('[data-hf-t]').forEach(function (el) { var v = vars[el.getAttribute('data-hf-t')]; if (typeof v === 'string' && v) el.textContent = v; });
})();`;

function converterCena(nome, s, m) {
  const css = [...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((x) => x[1]).join('\n');
  const corpo = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(s)?.[1] ?? '';
  const scripts = [...corpo.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((x) => x[1]);
  let markup = corpo.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  // A raiz da cena: o elemento com data-composition-id (nem todas usam id="root").
  const tagDaRaiz = /<\w+\b[^>]*\bdata-composition-id=["'][^"']*["'][^>]*>/.exec(markup)?.[0];
  if (!tagDaRaiz) return null;
  const AQUI = /\[data-composition-id=["']?[\w-]+["']?\]/g;
  // Regras que valem para o documento todo (e vazariam para o resto da animação) saem.
  const cssLimpo = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@import[^;]+;/g, '')
    .replace(/@font-face\s*{[^}]*}/g, '')
    .replace(/(^|})\s*([^{}@]+){([^{}]*)}/g, (t, ini, sel, dec) => {
      const sels = sel
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x && !/^(html|body|\*|:root)(\s|$|::|:|\[)/.test(x) && x !== '*');
      return sels.length ? `${ini} ${sels.join(', ')} {${dec}}` : ini;
    })
    .replace(/font-family:\s*([^;}]+)/g, (_t, f) => `font-family: var(--font-body, ${f.trim()})`)
    .split('#root')
    .join('#palco-hf')
    .replace(AQUI, '#palco-hf')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{2,}/g, '\n');
  // Fotos de exemplo (assets/...) viram silhueta.
  markup = markup.replace(/(<img\b[^>]*\bsrc=)["'][^"']*["']/gi, `$1"${SILHUETA}"`).replace(/\s(crossorigin|alt)="[^"]*"/gi, '');
  if (/(src|href)\s*=\s*["']https?:|url\(\s*["']?https?:/i.test(markup + cssLimpo)) return null;
  // Cada texto da tela vira um campo (fora de svg: ícones têm texto de desenho).
  const textos = [];
  markup = markup
    .split(/(<svg[\s\S]*?<\/svg>)/i)
    .map((parte) =>
      /^<svg/i.test(parte)
        ? parte
        : parte.replace(/>([^<>]*[A-Za-zÀ-ÿ0-9][^<>]*)</g, (_t, txt) => {
            const limpo = txt.replace(/\s+/g, ' ').trim();
            if (!limpo) return `>${txt}<`;
            textos.push(limpo);
            return `><span data-hf-t="t${textos.length}">${limpo}</span><`;
          }),
    )
    .join('');
  // O palco: a raiz original (#root) vira #palco-hf, encolhido para a largura da caixa.
  const W = m.dimensions?.width ?? 1080;
  const H = m.dimensions?.height ?? 1920;
  const estiloDaRaiz = /\sstyle="([^"]*)"/.exec(tagDaRaiz)?.[1] ?? '';
  const tagNova = tagDaRaiz
    .replace(/\s(id|style|data-composition-id)="[^"]*"/g, '')
    .replace(/>$/, ` id="palco-hf" style="${estiloDaRaiz ? `${estiloDaRaiz};` : ''}position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0">`);
  markup = markup.replace(tagDaRaiz, () => tagNova);
  const aplicar = `(function () {
var palco = document.getElementById('palco-hf'); if (!palco) return;
var vars = (window.__hyperframes && window.__hyperframes.getVariables && window.__hyperframes.getVariables()) || {};
palco.querySelectorAll('[data-hf-t]').forEach(function (el) { var v = vars[el.getAttribute('data-hf-t')]; if (typeof v === 'string' && v) el.textContent = v; });
})();`;
  const script = scripts
    .map((x) => x.split('getElementById("root")').join('getElementById("palco-hf")').split("getElementById('root')").join("getElementById('palco-hf')").split('#root').join('#palco-hf').replace(AQUI, '#palco-hf'))
    .join('\n');
  // Enquadrar: a cena foi desenhada num palco de ${W}x${H} com o desenho num canto;
  // mede-se o que aparece no meio da animação e isso é ajustado (sem distorcer) à caixa.
  const enquadrar = jsDeEnquadrar(nome, W, H);
  const miolo = `<div id="root" data-composition-id="${nome}" style="position:absolute;inset:0">
<style>${cssLimpo}</style>
${markup}
<script>${aplicar}
(function () {
${script}
})();
${enquadrar}</script>
</div>`;
  return { miolo, textos, W, H };
}

const pastaDasCenas = process.argv[3];
if (pastaDasCenas && existsSync(pastaDasCenas)) {
  for (const [nome, grupo] of Object.entries(CENAS)) {
    if (REPROVADOS.has(nome)) continue;
    const item = join(pastaDasCenas, nome, 'registry-item.json');
    if (!existsSync(item)) {
      pulados.push(`${nome} (cena não existe)`);
      continue;
    }
    const m = JSON.parse(readFileSync(item, 'utf8'));
    const arq = (m.files ?? []).find((f) => f.path.endsWith('.html'));
    const s = arq ? readFileSync(join(pastaDasCenas, nome, arq.path), 'utf8') : '';
    if (!s || /<canvas|getContext\(/.test(s)) {
      pulados.push(`${nome} (cena com canvas ou sem html)`);
      continue;
    }
    const c = converterCena(nome, s, m);
    if (!c) {
      pulados.push(`${nome} (cena não convertida)`);
      continue;
    }
    fontes[nome] = c.miolo;
    catalogo.push({
      nome,
      grupo,
      titulo: m.title ?? nome,
      oQue: `${(m.description ?? '').trim()} (Cena pronta: o desenho se ajusta sozinho à caixa, sem distorcer e centrado nela; dê à caixa o tamanho e o lugar que o desenho deve ocupar, ex.: tarja de nome ou cartão de seguir = width:900px; height:260px; cartão de post = width:920px; height:520px. Uma por animação. Os textos t1, t2... são os da tela, na ordem.)`,
      quando: '',
      evitar: '',
      envelope: m.duration ? `dura ${m.duration}s` : '',
      variaveis: c.textos.map((t, i) => ({ id: `t${i + 1}`, tipo: 'string', padrao: t, descricao: `texto ${i + 1} da tela (exemplo: "${t}")` })),
    });
  }
}

// ---------- Receitas (componentes em formato de demonstração) ----------
//
// Metade do registro não vem pronta para montar: é a marcação e o CSS de um
// cartão de demonstração, com a animação descrita num comentário ("Timeline
// integration: tl.fromTo(...)"). Aqui a receita vira componente: o trecho do
// comentário passa a ser a linha do tempo dele, os textos viram campos
// (t1, t2...) e o desenho é enquadrado na caixa.
const RECEITAS = {
  typewriter: 'texto', 'per-word-crossfade': 'texto', 'rgb-glitch-text': 'texto',
  'top-down-letters': 'texto', 'bottom-up-letters': 'texto', 'text-stagger': 'texto', 'text-state-swap': 'texto',
  'blur-in': 'texto', 'blur-out-up': 'texto', 'focus-blur-resolve': 'texto', 'line-by-line-slide': 'texto',
  'soft-blur-in': 'texto', 'staggered-fade-up': 'texto', 'tracking-in': 'texto', 'shared-axis-y': 'texto',
  'shared-axis-z': 'texto', 'strikethrough-replace': 'destaque', 'inline-highlight': 'destaque',
  'number-pop-in': 'dados', 'number-wheel': 'dados', 'slot-machine-roll': 'dados', 'animated-bar-chart': 'dados',
  'success-check': 'destaque', 'badge-pop': 'destaque', 'typing-indicator': 'destaque',
  'tilt-card': 'destaque', 'x-follow-card': 'destaque', 'skeleton-reveal': 'destaque',
  'tabs-slide-indicator': 'destaque', 'input-feedback': 'destaque',
  // Reprovadas na bancada: matrix-decode (não decodifica: fica em zeros), perspective-marquee e
  // spotlight-card (ilegíveis), icon-swap (o texto cobre o ícone), confetti e terminal-simulator
  // (cartão de demonstração, não o efeito), svg-line-draw-loader (só uma linha), panel-reveal
  // (linhas fixas em inglês). As que são só estilo, sem desenho (tracking-in, soft-blur-in,
  // bottom-up-letters, separator...), só entram com marcação escrita em MARCACAO_DAS_RECEITAS.
};

/**
 * Receitas que são só estilo e script (uma classe para pôr num texto): a
 * marcação é escrita aqui. `antes` roda antes do script da receita, com as
 * variáveis em `v`; `variaveis` entram no catálogo.
 */
const TEXTO_SOLTO = 'font:800 96px/1.2 var(--font-display, var(--font-body, Inter, system-ui, sans-serif));color:#fff;text-align:center;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)';
const MARCACAO_DAS_RECEITAS = {
  'inline-highlight': {
    markup: `<div style="${TEXTO_SOLTO}"><span>Isso é</span> <span class="hf-inline-highlight" style="color:#111;text-shadow:none;--hf-highlight-height:1.12em;margin-left:.12em">importante</span></div>`,
  },
  'number-wheel': {
    markup: `<div style="${TEXTO_SOLTO.replace('800 96px', '900 200px')}"><span class="hf-number-wheel" data-value="1250"></span></div>`,
    antes: `var el = document.querySelector('#palco-hf .hf-number-wheel'); if (el && (typeof v.valor === 'string' || typeof v.valor === 'number') && String(v.valor)) el.setAttribute('data-value', String(v.valor));`,
    variaveis: [{ id: 'valor', type: 'string', default: '1250', description: 'o número que os dígitos rolam até mostrar (pode ter ponto, vírgula, % ou R$)' }],
    semCampos: true,
  },
};

function converterReceita(nome, s) {
  const integracao = /Timeline integration:([\s\S]*?)-->/.exec(s)?.[1]?.trim();
  if (!integracao || !/\btl\./.test(integracao)) return null;
  const semComentarios = s
    .split(/(<script[\s\S]*?<\/script>)/i)
    .map((parte) => (/^<script/i.test(parte) ? parte : parte.replace(/<!--[\s\S]*?-->/g, '')))
    .join('');
  const css = [...semComentarios.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((x) => x[1])
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@import[^;]+;/g, '')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{2,}/g, '\n');
  const scripts = [...semComentarios.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((x) => x[1]);
  let markup = semComentarios.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').trim();
  const escrita = MARCACAO_DAS_RECEITAS[nome];
  if (escrita) markup = escrita.markup;
  // Só estilo, sem desenho e sem marcação escrita aqui: não há o que mostrar.
  if (!markup.replace(/<[^>]*>/g, '').trim() && !/<(svg|img|span|div|i|b)\b/i.test(markup)) return null;
  if (/(src|href)\s*=\s*["']https?:|url\(\s*["']?https?:/i.test(markup + css)) return null;
  // As variáveis que a receita declara (na própria marcação).
  let variaveis = [];
  const declaradas = /data-composition-variables='([\s\S]*?)'/.exec(semComentarios)?.[1];
  if (declaradas) {
    try {
      variaveis = JSON.parse(declaradas);
    } catch {
      return null;
    }
  }
  markup = markup.replace(/\sdata-composition-variables='[\s\S]*?'/, '');
  // Quem já tem campo de texto próprio não ganha t1, t2... (seriam dois donos do mesmo texto).
  if (escrita?.variaveis) variaveis = [...escrita.variaveis, ...variaveis];
  const temTextoProprio = escrita ? !!escrita.semCampos : variaveis.some((v) => v.type === 'string');
  const campos = temTextoProprio ? { html: markup, textos: [] } : comCamposDeTexto(markup);
  // O padrão das receitas é letra escura (para fundo claro); em cima do vídeo, a clara.
  const padroes = {};
  for (const v of variaveis) {
    if (v.id === 'tone' && (v.options ?? []).some((o) => (typeof o === 'object' ? o.value : o) === 'paper')) {
      padroes.tone = 'paper';
      v.default = 'paper';
    }
  }
  const jsDosPadroes =
    Object.keys(padroes).length || escrita?.antes
      ? `(function () { var v = (window.__hyperframes && window.__hyperframes.getVariables && window.__hyperframes.getVariables()) || {}; var p = ${JSON.stringify(padroes)}; for (var k in p) if (v[k] === undefined) v[k] = p[k]; ${escrita?.antes ?? ''} })();\n`
      : '';
  const miolo = `<div id="root" data-composition-id="${nome}" style="position:absolute;inset:0">
<style>${css}</style>
<div id="palco-hf" style="position:absolute;left:0;top:0;width:max-content;height:max-content;transform-origin:0 0">
${campos.html}
</div>
<script>${jsDosPadroes}${JS_DOS_TEXTOS}
${scripts.join('\n')}
(function () {
window.__timelines = window.__timelines || {};
var tl = gsap.timeline({ paused: true });
var startTime = 0; var endTime = 2.4;
{
${integracao}
}
window.__timelines[${JSON.stringify(nome)}] = tl;
})();
${jsDeEnquadrar(nome, 100000, 100000)}</script>
</div>`;
  return { miolo, textos: campos.textos, variaveis };
}

if (pastaDasCenas) {
  for (const [nome, grupo] of Object.entries(RECEITAS)) {
    if (REPROVADOS.has(nome)) continue;
    const html = join(pasta, nome, `${nome}.html`);
    const item = join(pasta, nome, 'registry-item.json');
    if (!existsSync(html) || !existsSync(item)) {
      pulados.push(`${nome} (receita não existe)`);
      continue;
    }
    const s = readFileSync(html, 'utf8');
    const c = /<canvas|getContext\(/.test(s) ? null : converterReceita(nome, s);
    if (!c) {
      pulados.push(`${nome} (receita não convertida)`);
      continue;
    }
    const m = JSON.parse(readFileSync(item, 'utf8'));
    fontes[nome] = c.miolo;
    catalogo.push({
      nome,
      grupo,
      titulo: m.title ?? nome,
      oQue: `${(m.description ?? '').trim()} (O desenho se ajusta sozinho à caixa, sem distorcer e centrado nela: dê à caixa o tamanho e o lugar que ele deve ocupar. Um por animação. Os textos t1, t2... são os da tela, na ordem.)`,
      quando: '',
      evitar: '',
      envelope: '',
      variaveis: [
        ...c.textos.map((t, i) => ({ id: `t${i + 1}`, tipo: 'string', padrao: t, descricao: `texto ${i + 1} da tela (exemplo: "${t}")` })),
        ...c.variaveis.map((v) => ({
          id: v.id,
          tipo: v.type,
          padrao: v.default ?? null,
          descricao: v.description ?? v.label ?? '',
          ...(v.options ? { opcoes: v.options.map((o) => (typeof o === 'object' ? o.value : o)) } : {}),
          ...(v.min !== undefined ? { min: v.min } : {}),
          ...(v.max !== undefined ? { max: v.max } : {}),
        })),
      ],
    });
  }
}

const cab = `// ============================================================
// GERADO por scripts/gerar-componentes-hyperframes.mjs a partir do registro
// de componentes do HyperFrames (HeyGen, Apache 2.0): registry/components/*.
// Não editar à mão.
// ============================================================
`;
writeFileSync(
  join(SRC, 'componentes-hyperframes-extra.ts'),
  `${cab}\n/** O miolo (a raiz #root do <template>) de cada componente, sem o gsap de CDN. */\nexport const FONTES_DOS_COMPONENTES_EXTRA: Record<string, string> = ${JSON.stringify(fontes, null, 1)};\n`,
);
writeFileSync(
  join(SRC, 'catalogo-de-componentes-extra.ts'),
  `${cab}\nimport type { ComponenteDoCatalogo } from './catalogo-de-componentes';\n\nexport const COMPONENTES_DO_CATALOGO_EXTRA: readonly ComponenteDoCatalogo[] = ${JSON.stringify(catalogo, null, 2)};\n`,
);
console.log(`entraram ${catalogo.length}; ficaram de fora: ${pulados.join(', ') || 'nenhum'}`);
