// ============================================================
// MAKUCHO STUDIO - Liquid Glass: o estilo exclusivo das animações, no
// material de vidro da Apple (iOS 26 / "Liquid Glass"), a partir do
// sistema DigiUrban Glass.
//
// O vidro é incolor: tem borda de luz (um gradiente que acende nas
// quinas, com um toque da cor do que está embaixo), reflexo no alto,
// sombras internas que dão volume e um desfoque leve com saturação que
// "puxa" a cor do fundo. A cor vem do que está EMBAIXO.
//
// No Studio a animação é gerada à parte e posta sobre o vídeo depois:
// o desfoque não enxerga o vídeo. Por isso o vidro refrata um FUNDO VIVO
// da própria animação (bolhas de cor que derivam devagar) -- é o que o
// material precisa para existir. No cartão sobre o vídeo, o cartão é um
// painel vivo recortado e o vidro fica por dentro dele.
//
// O kit (as classes abaixo) entra no documento de toda animação deste
// estilo: a IA monta com as peças prontas em vez de reinventar o
// material a cada cartão.
// ============================================================

/** As chaves dos estilos Liquid Glass (claro e noite). */
export const ESTILOS_LIQUID_GLASS = ['liquid-glass', 'liquid-glass-noite'] as const;

export function ehLiquidGlass(estilo: string | undefined | null): boolean {
  return !!estilo && (ESTILOS_LIQUID_GLASS as readonly string[]).includes(estilo);
}

/**
 * O kit do material, com os tokens da variante. Tudo em #cena, na escala
 * do quadro 1080x1920 (o dobro do desenho de referência, que é de tela).
 */
export function cssDoLiquidGlass(estilo: string | undefined | null, paleta?: string | null): string {
  if (!ehLiquidGlass(estilo)) return '';
  const noite = estilo === 'liquid-glass-noite';
  const tokens = noite
    ? `--lg-bg:#15161A;--lg-ink:#F5F5F7;--lg-ink2:rgba(235,235,245,.72);--lg-ink3:rgba(235,235,245,.46);--lg-fill:rgba(118,118,128,.3);--lg-blue:#3B8BFF;--lg-green:#34D15B;--lg-red:#FF3B5C;--lg-orange:#FF9A3C;--lg-pink:#FF4D84;--lg-purple:#B36CF2;--lg-teal:#2FC6DB;`
    : `--lg-bg:#D9DCE3;--lg-ink:#1D1D1F;--lg-ink2:rgba(60,60,67,.74);--lg-ink3:rgba(60,60,67,.52);--lg-fill:rgba(120,120,128,.18);--lg-blue:#2F7BE3;--lg-green:#4CBB55;--lg-red:#E8284A;--lg-orange:#FF8A1F;--lg-pink:#FF2D6F;--lg-purple:#9B51E0;--lg-teal:#12B5CB;`;
  // O vidro: mesma receita do DigiUrban Glass, com as medidas em dobro.
  const vidro = noite
    ? `background:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.02));-webkit-backdrop-filter:blur(10px) saturate(170%) brightness(.92);backdrop-filter:blur(10px) saturate(170%) brightness(.92);box-shadow:0 28px 60px -20px rgba(0,0,0,.7),0 4px 12px rgba(0,0,0,.4),inset 0 2px 2px rgba(255,255,255,.42),inset 0 -2px 2px rgba(255,255,255,.1),inset 0 24px 32px -28px rgba(255,255,255,.35),inset 0 -28px 36px -28px rgba(0,0,0,.55);`
    : `background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.05));-webkit-backdrop-filter:blur(8px) saturate(185%) brightness(1.06);backdrop-filter:blur(8px) saturate(185%) brightness(1.06);box-shadow:0 28px 60px -24px rgba(20,28,48,.32),0 4px 12px rgba(20,28,48,.08),inset 0 2px 2px rgba(255,255,255,.95),inset 0 -2px 2px rgba(255,255,255,.5),inset 0 24px 32px -28px rgba(255,255,255,.95),inset 0 -28px 36px -28px rgba(30,40,70,.26),inset 16px 0 24px -24px rgba(255,255,255,.75),inset -16px 0 24px -24px rgba(30,40,70,.16);`;
  return `
#cena { ${tokens} --lg-raio: 56px; }
${paleta ? '/* Paleta escolhida: as cores vivas vêm dos destaques do tema. */ #cena { --lg-blue: var(--cor-destaque); --lg-pink: var(--cor-destaque-2); --lg-orange: var(--cor-destaque-3); }' : ''}
/* O fundo vivo: é ele que o vidro refrata (bolhas de cor desfocadas). */
#cena .lg-fundo { position:absolute; inset:0; overflow:hidden; background:var(--lg-bg); }
#cena .lg-bolha { position:absolute; border-radius:50%; filter:blur(${noite ? 70 : 60}px); opacity:${noite ? 0.75 : 0.9}; will-change:transform; }
#cena .lg-painel { position:relative; overflow:hidden; border-radius:var(--lg-raio); background:var(--lg-bg); }
/* O vidro incolor: borda de luz (::before), reflexo no alto (::after). */
#cena .vidro { position:relative; --ta:150,205,255; --tb:255,160,215; border-radius:var(--lg-raio); ${vidro} }
#cena .vidro::before { content:""; position:absolute; inset:0; border-radius:inherit; padding:3px; background:linear-gradient(155deg,rgba(255,255,255,1) 0%,rgba(255,255,255,.6) 10%,rgba(var(--ta),.75) 22%,rgba(255,255,255,0) 40%,rgba(255,255,255,0) 58%,rgba(var(--tb),.7) 80%,rgba(255,255,255,.95) 100%); -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none; z-index:2; opacity:${noite ? 0.6 : 1}; }
#cena .vidro::after { content:""; position:absolute; left:8%; right:8%; top:4px; height:42%; border-radius:999px; background:linear-gradient(180deg,rgba(255,255,255,.42),rgba(255,255,255,0)); pointer-events:none; opacity:${noite ? 0.18 : 0.55}; z-index:2; }
#cena .vidro > * { position:relative; z-index:3; }
/* Barra (abas, controles): mais leitosa, para o texto ler sobre qualquer fundo. */
#cena .vidro-barra { -webkit-backdrop-filter:blur(14px) saturate(${noite ? '170%' : '185%'}) brightness(${noite ? 1 : 1.08}); backdrop-filter:blur(14px) saturate(${noite ? '170%' : '185%'}) brightness(${noite ? 1 : 1.08}); background:${noite ? 'linear-gradient(180deg,rgba(60,60,68,.42),rgba(30,30,36,.3))' : 'linear-gradient(180deg,rgba(255,255,255,.3),rgba(255,255,255,.12))'}; }
/* Lente: o vidro que AMPLIA o que passa por baixo (ponha dentro uma cópia maior do que está atrás). */
#cena .vidro-lente { overflow:hidden; border-radius:999px; }
/* Vidro tingido: botão, selo, pílula de destaque (--tint = uma cor do tema). */
#cena .vidro-tinta { --tint: var(--lg-blue); position:relative; color:#fff; border-radius:999px; background:linear-gradient(180deg,color-mix(in srgb,var(--tint) 72%,white),color-mix(in srgb,var(--tint) 92%,transparent) 55%,color-mix(in srgb,var(--tint) 88%,black)); -webkit-backdrop-filter:blur(8px) saturate(180%); backdrop-filter:blur(8px) saturate(180%); box-shadow:inset 0 2px 2px rgba(255,255,255,.75),inset 0 -4px 8px rgba(0,0,0,.18),inset 0 20px 28px -24px rgba(255,255,255,.7),0 20px 44px -16px color-mix(in srgb,var(--tint) 65%,transparent); }
/* Pílula ativa (a aba acesa da barra). */
#cena .lg-pilula { border-radius:999px; padding:18px 32px; display:inline-flex; align-items:center; gap:16px; font-family:var(--fonte-texto); font-size:30px; color:var(--lg-ink); }
#cena .lg-pilula.acesa { color:var(--lg-blue); background:${noite ? 'linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.07))' : 'linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,.22))'}; box-shadow:inset 0 2px 2px rgba(255,255,255,${noite ? '.4' : '1'}),inset 0 -12px 20px -16px rgba(${noite ? '0,0,0,.5' : '30,40,70,.25'}),0 12px 28px -12px rgba(${noite ? '0,0,0,.6' : '20,28,48,.3'}); }
/* Trilho e preenchimento (barra de progresso, régua de valor). */
#cena .lg-trilho { position:relative; height:60px; border-radius:999px; background:var(--lg-fill); overflow:visible; }
#cena .lg-enche { position:absolute; left:0; top:0; bottom:0; border-radius:999px; background:var(--lg-blue); transform-origin:0 50%; }
/* Tipografia do sistema: rótulo (eyebrow), título, texto. */
#cena .lg-rotulo { font-family:var(--fonte-texto); font-size:24px; letter-spacing:.06em; text-transform:uppercase; color:var(--lg-ink3); }
#cena .lg-titulo { font-family:var(--fonte-titulo); color:var(--lg-ink); letter-spacing:-0.02em; line-height:1.08; }
#cena .lg-texto { font-family:var(--fonte-texto); color:var(--lg-ink2); line-height:1.35; }
`;
}

/** Como a IA monta com o kit (vai na escrita, no lugar do cartão de referência). */
export const REGRAS_DO_LIQUID_GLASS = `LIQUID GLASS (estilo exclusivo do Studio, o material de vidro da Apple). O KIT já está no documento -- use as classes, não reescreva o material:
- .lg-fundo (absolute, inset 0) com 3 a 5 .lg-bolha dentro (divs redondas de 360-620 px, background com as cores var(--lg-blue), var(--lg-pink), var(--lg-orange), var(--lg-teal), var(--lg-purple), var(--lg-green)). É o FUNDO VIVO que o vidro refrata: sem ele o vidro não aparece. Mova as bolhas devagar no tl (x/y de 40-120 px ao longo da duração, ease "sine.inOut") -- nada de animação CSS.
- .vidro: o vidro incolor (borda de luz, reflexo, volume). Cartões, janelas, a "gota" de um controle. Tinja a borda com --ta e --tb (triplas RGB, ex.: style="--ta:90,160,255;--tb:60,120,230"), da cor do que está embaixo. Raio: var(--lg-raio) nos cartões, 999px nas pílulas e gotas.
- .vidro.vidro-barra: barra de abas/controles, mais leitosa (texto sempre legível).
- .vidro-tinta com style="--tint: var(--lg-blue)" (ou outra cor do tema): botão, selo, chamada. Texto branco.
- .vidro.vidro-lente: a LENTE -- um vidro redondo sobre uma faixa colorida, com uma cópia maior da faixa por dentro (a mesma faixa, 1.25x, deslocada para alinhar): parece que o vidro amplia o que passa por baixo. Ótimo para destacar um número ou um ponto numa barra.
- .lg-trilho + .lg-enche: barra de progresso/valor (encha com scaleX, nunca width); ponha uma gota .vidro (140x96, raio 999px) na ponta do preenchimento -- ela desliza junto quando a barra enche (o controle deslizante do iOS), com x (transform), nunca left: meça o percurso no script (ex.: var p = document.getElementById('trilho').offsetWidth * 0.87) e anime x de -p a 0.
- .lg-pilula (e .lg-pilula.acesa): as abas de uma barra.
- Texto: .lg-rotulo (eyebrow), .lg-titulo (títulos, 72-120 px), .lg-texto (corpo, 30-40 px). Cores: var(--lg-ink), var(--lg-ink2), var(--lg-ink3).
- Layout "cartao" (sobre o vídeo): o cartão é um .lg-painel (fundo vivo recortado, com as .lg-bolha dentro) e o vidro fica por dentro dele. Nos outros layouts, .lg-fundo cobre #area.
- MOVIMENTO LÍQUIDO: o vidro entra como uma gota -- de scale 0.86 e border-radius 999px para o tamanho e o raio finais (0.6-0.8 s, ease "back.out(1.4)"); a gota do controle desliza com "power3.inOut"; a lente passa sobre a faixa. O fundo vivo nunca para (as bolhas derivam o tempo todo). Um vidro por vez em destaque; no máximo 3 peças de vidro no quadro.
- Contraste: texto em cima do vidro claro é var(--lg-ink) (escuro); no noite, var(--lg-ink) é claro. Nunca texto branco sobre o vidro claro.`;
