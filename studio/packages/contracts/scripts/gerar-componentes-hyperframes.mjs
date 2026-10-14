// ============================================================
// Traz componentes do registro do HyperFrames (HeyGen, Apache 2.0) para o
// catálogo das animações.
//
//   node scripts/gerar-componentes-hyperframes.mjs <pasta registry/components>
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
