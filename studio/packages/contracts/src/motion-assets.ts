// ============================================================
// MAKUCHO STUDIO - Assets animados das cenas de motion.
//
// O que as bibliotecas da comunidade dão aos vídeos feitos com Remotion e
// HyperFrames (Remocn, Remotion Bits, Remotion Elements, os pacotes de
// rabiscos e os Lottie de ícones): objetos que SE MEXEM -- o celular que
// recebe a notificação, o sino que toca, as moedas que caem, a seta
// desenhada à mão que aponta, os brilhos que piscam. Aqui eles são SVG
// desenhado em código e animado na linha do tempo da cena (GSAP): nada vem
// da rede, e o mesmo quadro sai igual na prévia e no render.
//
//   objetos  -- pequenas ilustrações com movimento próprio (o "herói" de
//               uma cena, ou o acompanhante de um título);
//   rabiscos -- anotações à mão (seta, círculo, sublinhado, brilhos,
//               explosão): os enfeites dos visuais e das anotações.
//
// Tudo pinta com as variáveis do tema (currentColor, --cor-destaque,
// --cor-destaque-2): o mesmo asset sai nas cores de qualquer visual.
// ============================================================

export interface AssetDeMotion {
  chave: string;
  nome: string;
  tipo: 'objeto' | 'rabisco';
  /** O que ele mostra (para a IA escolher). */
  quando: string;
}

export const ASSETS_DE_MOTION: readonly AssetDeMotion[] = [
  { chave: 'celular', nome: 'Celular com notificação', tipo: 'objeto', quando: 'app, mensagem, venda que chega, rede social' },
  { chave: 'navegador', nome: 'Janela do navegador', tipo: 'objeto', quando: 'site, ferramenta online, página carregando' },
  { chave: 'cursor', nome: 'Cursor clicando', tipo: 'objeto', quando: 'clicar, tutorial, "é só apertar aqui"' },
  { chave: 'sino', nome: 'Sino tocando', tipo: 'objeto', quando: 'aviso, lembrete, ativar notificações' },
  { chave: 'cadeado', nome: 'Cadeado abrindo', tipo: 'objeto', quando: 'segurança, liberar acesso, desbloquear' },
  { chave: 'foguete', nome: 'Foguete decolando', tipo: 'objeto', quando: 'crescimento, lançamento, acelerar' },
  { chave: 'moedas', nome: 'Moedas caindo', tipo: 'objeto', quando: 'dinheiro, lucro, economia, preço' },
  { chave: 'grafico', nome: 'Gráfico subindo', tipo: 'objeto', quando: 'resultado, crescimento, métricas' },
  { chave: 'trofeu', nome: 'Troféu', tipo: 'objeto', quando: 'conquista, o melhor, vitória' },
  { chave: 'relogio', nome: 'Relógio girando', tipo: 'objeto', quando: 'tempo, prazo, rapidez, rotina' },
  { chave: 'bateria', nome: 'Bateria carregando', tipo: 'objeto', quando: 'energia, descanso, recarregar' },
  { chave: 'interruptor', nome: 'Interruptor ligando', tipo: 'objeto', quando: 'ativar, ligar, mudar de modo' },
  { chave: 'curtida', nome: 'Curtida', tipo: 'objeto', quando: 'gostar, engajamento, seguidores, amor' },
  { chave: 'envelope', nome: 'Envelope abrindo', tipo: 'objeto', quando: 'e-mail, mensagem, convite, lista' },
  { chave: 'lampada', nome: 'Lâmpada acendendo', tipo: 'objeto', quando: 'ideia, dica, descoberta' },
  { chave: 'alvo', nome: 'Flecha no alvo', tipo: 'objeto', quando: 'meta, foco, acertar, público-alvo' },
  { chave: 'seta_curva', nome: 'Seta à mão', tipo: 'rabisco', quando: 'apontar para algo, "olha isso"' },
  { chave: 'circulo', nome: 'Círculo à mão', tipo: 'rabisco', quando: 'destacar uma palavra ou um ponto' },
  { chave: 'sublinhado', nome: 'Sublinhado em onda', tipo: 'rabisco', quando: 'enfatizar' },
  { chave: 'brilhos', nome: 'Brilhos', tipo: 'rabisco', quando: 'novo, especial, mágico, premium' },
  { chave: 'explosao', nome: 'Explosão de traços', tipo: 'rabisco', quando: 'impacto, surpresa, "boom"' },
  { chave: 'x', nome: 'X rabiscado', tipo: 'rabisco', quando: 'errado, proibido, mito' },
  { chave: 'check', nome: 'Check rabiscado', tipo: 'rabisco', quando: 'certo, feito, aprovado' },
  { chave: 'estrela', nome: 'Estrela à mão', tipo: 'rabisco', quando: 'destaque, favorito, nota' },
  { chave: 'velocidade', nome: 'Linhas de velocidade', tipo: 'rabisco', quando: 'rápido, agora, movimento' },
  { chave: 'exclamacao', nome: 'Exclamação', tipo: 'rabisco', quando: 'atenção, alerta, surpresa' },
];

export const CHAVES_DOS_OBJETOS = ASSETS_DE_MOTION.filter((a) => a.tipo === 'objeto').map((a) => a.chave);
export const CHAVES_DOS_RABISCOS = ASSETS_DE_MOTION.filter((a) => a.tipo === 'rabisco').map((a) => a.chave);

export function assetDeMotion(chave: string | undefined | null): AssetDeMotion | undefined {
  return ASSETS_DE_MOTION.find((a) => a.chave === chave);
}

/** Os assets, uma linha por tipo, para a IA escolher. */
export function textoDosAssets(): string {
  const linha = (tipo: AssetDeMotion['tipo']) =>
    ASSETS_DE_MOTION.filter((a) => a.tipo === tipo)
      .map((a) => `${a.chave} (${a.quando})`)
      .join('; ');
  return `OBJETOS ANIMADOS (campo "objeto"): ${linha('objeto')}.\nRABISCOS À MÃO (campo "rabisco"): ${linha('rabisco')}.`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Um traço que se desenha a partir de `t` (o runtime da cena anima data-in="desenha"). */
const traco = (t: number, d = 0.5) => `class="tr" pathLength="1" data-in="desenha" data-t="${r2(t)}" data-d="${d}"`;

/**
 * Um asset animado: o SVG (com os data-in que o runtime da cena entende) e
 * as linhas de script próprias dele. `id` é único na cena; `t` é o segundo
 * em que ele começa.
 */
export function assetAnimado(chave: string, id: string, t: number, classe = 'ast'): { html: string; script: string } {
  const T = r2(t);
  const svg = (miolo: string, vb = '0 0 120 120') => `<svg id="${id}" class="${classe} ast-${chave}" viewBox="${vb}" aria-hidden="true">${miolo}</svg>`;
  const s = (linhas: string[]) => linhas.join('\n');
  switch (chave) {
    case 'celular':
      return {
        html: svg(`<g id="${id}-c"><rect class="sv" x="34" y="8" width="52" height="104" rx="11"/><rect ${traco(T, 0.6)} x="34" y="8" width="52" height="104" rx="11"/><path ${traco(T + 0.2, 0.3)} d="M53 16h14"/></g><g id="${id}-n"><rect class="ch" x="38" y="30" width="44" height="20" rx="5"/><circle class="fu" cx="45" cy="40" r="3.5"/><path class="fu-tr" d="M52 37h22M52 43h14"/></g><g id="${id}-n2"><rect class="ch2" x="38" y="54" width="44" height="16" rx="5"/><path class="fu-tr" d="M44 62h28"/></g>`),
        script: s([
          `tl.fromTo('#${id}-c', { rotation: -10, transformOrigin: '50% 100%' }, { rotation: 0, duration: 0.6, ease: 'back.out(2)' }, ${T});`,
          `tl.fromTo('#${id}-n', { y: -26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: 'back.out(1.8)' }, ${r2(T + 0.55)});`,
          `tl.fromTo('#${id}-n2', { y: -20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: 'back.out(1.8)' }, ${r2(T + 1.05)});`,
          `tl.to('#${id}-c', { x: 2, duration: 0.05, yoyo: true, repeat: 5, ease: 'none' }, ${r2(T + 0.55)});`,
        ]),
      };
    case 'navegador':
      return {
        html: svg(`<rect class="sv" x="8" y="20" width="104" height="80" rx="9"/><rect ${traco(T, 0.6)} x="8" y="20" width="104" height="80" rx="9"/><path ${traco(T + 0.2, 0.3)} d="M8 36h104"/><circle class="ch" cx="18" cy="28" r="3"/><circle class="ch2" cx="27" cy="28" r="3"/><circle class="fu-c" cx="36" cy="28" r="3"/><rect class="sv" x="18" y="46" width="84" height="7" rx="3.5"/><rect id="${id}-b" class="ch" x="18" y="46" width="84" height="7" rx="3.5"/><path ${traco(T + 0.9, 0.35)} d="M18 66h60"/><path ${traco(T + 1.05, 0.35)} d="M18 76h76"/><path ${traco(T + 1.2, 0.35)} d="M18 86h40"/>`),
        script: s([`tl.fromTo('#${id}-b', { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.8, ease: 'power2.inOut' }, ${r2(T + 0.3)});`]),
      };
    case 'cursor':
      return {
        html: svg(`<circle id="${id}-o1" class="onda" cx="62" cy="58" r="16"/><circle id="${id}-o2" class="onda" cx="62" cy="58" r="16"/><rect class="sv" x="22" y="40" width="50" height="22" rx="11"/><rect ${traco(T, 0.5)} x="22" y="40" width="50" height="22" rx="11"/><g id="${id}-p"><path class="ch tr-ch" d="M60 56l0 34 9-8 7 15 7-3-7-15 12-1z"/></g>`),
        script: s([
          `tl.fromTo('#${id}-p', { x: 34, y: 30, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: 0.55, ease: 'power3.out' }, ${r2(T + 0.15)});`,
          `tl.to('#${id}-p', { scale: 0.85, duration: 0.09, yoyo: true, repeat: 1, transformOrigin: '20% 10%' }, ${r2(T + 0.75)});`,
          `tl.fromTo('#${id}-o1', { scale: 0.3, autoAlpha: 0.9, transformOrigin: '50% 50%' }, { scale: 1.9, autoAlpha: 0, duration: 0.6, ease: 'power2.out' }, ${r2(T + 0.8)});`,
          `tl.fromTo('#${id}-o2', { scale: 0.3, autoAlpha: 0.7, transformOrigin: '50% 50%' }, { scale: 1.5, autoAlpha: 0, duration: 0.6, ease: 'power2.out' }, ${r2(T + 0.95)});`,
        ]),
      };
    case 'sino':
      return {
        html: svg(`<g id="${id}-s"><path class="sv" d="M60 18c-17 0-28 13-28 30v20l-9 12h74l-9-12V48c0-17-11-30-28-30z"/><path ${traco(T, 0.6)} d="M60 18c-17 0-28 13-28 30v20l-9 12h74l-9-12V48c0-17-11-30-28-30z"/><circle class="ch" cx="60" cy="88" r="8"/><path ${traco(T + 0.1, 0.2)} d="M60 10v8"/></g><path ${traco(T + 0.6, 0.25)} d="M18 34c-6 6-8 14-6 22"/><path ${traco(T + 0.65, 0.25)} d="M102 34c6 6 8 14 6 22"/>`),
        script: s([`tl.fromTo('#${id}-s', { rotation: 0, transformOrigin: '50% 8%' }, { rotation: 16, duration: 0.12, yoyo: true, repeat: 7, ease: 'sine.inOut' }, ${r2(T + 0.5)});`]),
      };
    case 'cadeado':
      return {
        html: svg(`<path id="${id}-a" ${traco(T, 0.5)} d="M40 56V40a20 20 0 0 1 40 0v4"/><rect class="ch" x="28" y="56" width="64" height="50" rx="10"/><circle class="fu" cx="60" cy="78" r="6"/><path class="fu-tr" d="M60 82v10"/>`),
        script: s([`tl.to('#${id}-a', { y: -12, rotation: -14, transformOrigin: '100% 100%', duration: 0.4, ease: 'back.out(2.4)' }, ${r2(T + 0.9)});`]),
      };
    case 'foguete':
      return {
        html: svg(`<g id="${id}-f"><path class="sv" d="M60 8c16 12 22 30 22 48l-10 18H48L38 56c0-18 6-36 22-48z"/><path ${traco(T, 0.6)} d="M60 8c16 12 22 30 22 48l-10 18H48L38 56c0-18 6-36 22-48z"/><circle class="ch" cx="60" cy="40" r="8"/><path class="ch2" d="M38 56l-12 18 18-2zM82 56l12 18-18-2z"/><path id="${id}-fo" class="ch" d="M50 76h20l-10 24z"/></g><path ${traco(T + 0.7, 0.4)} d="M40 112v-10M60 116v-12M80 112v-10"/>`),
        script: s([
          `tl.fromTo('#${id}-fo', { scaleY: 0.4, transformOrigin: '50% 0%' }, { scaleY: 1.2, duration: 0.08, yoyo: true, repeat: 15, ease: 'none' }, ${r2(T + 0.3)});`,
          `tl.fromTo('#${id}-f', { y: 14 }, { y: -10, duration: 1.4, ease: 'power2.in' }, ${r2(T + 0.4)});`,
        ]),
      };
    case 'moedas': {
      const moeda = (k: number, y: number) =>
        `<g id="${id}-m${k}"><ellipse class="ch" cx="60" cy="${y}" rx="30" ry="9"/><rect class="ch" x="30" y="${y - 9}" width="60" height="9"/><ellipse class="ch2" cx="60" cy="${y - 9}" rx="30" ry="9"/><path class="fu-tr" d="M56 ${y - 12}h8"/></g>`;
      return {
        html: svg(`${moeda(0, 104)}${moeda(1, 88)}${moeda(2, 72)}${moeda(3, 56)}`),
        script: s([0, 1, 2, 3].map((k) => `tl.fromTo('#${id}-m${k}', { y: -90, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.42, ease: 'bounce.out' }, ${r2(T + k * 0.22)});`)),
      };
    }
    case 'grafico':
      return {
        html: svg(`<path ${traco(T, 0.4)} d="M14 106h96"/>${[0, 1, 2, 3].map((k) => `<rect id="${id}-b${k}" class="${k === 3 ? 'ch' : 'sv-f'}" x="${20 + k * 24}" y="${86 - k * 18}" width="16" height="${20 + k * 18}" rx="3"/>`).join('')}<path ${traco(T + 0.9, 0.5)} d="M22 78l24-16 22 6 34-36"/><path ${traco(T + 1.3, 0.25)} d="M88 32h14v14"/>`),
        script: s([0, 1, 2, 3].map((k) => `tl.fromTo('#${id}-b${k}', { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 0.45, ease: 'back.out(1.6)' }, ${r2(T + 0.15 + k * 0.14)});`)),
      };
    case 'trofeu':
      return {
        html: svg(`<path class="ch" d="M38 16h44v26c0 14-10 24-22 24S38 56 38 42z"/><path ${traco(T, 0.5)} d="M38 24H24c0 14 6 22 16 22M82 24h14c0 14-6 22-16 22"/><path ${traco(T + 0.2, 0.3)} d="M60 66v16"/><rect class="ch2" x="40" y="84" width="40" height="14" rx="4"/>${[0, 1, 2].map((k) => `<path id="${id}-e${k}" class="ch2" d="M${[16, 100, 92][k]} ${[60, 70, 10][k]}l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>`).join('')}`),
        script: s([0, 1, 2].map((k) => `tl.fromTo('#${id}-e${k}', { scale: 0, rotation: -45, transformOrigin: '50% 50%' }, { scale: 1, rotation: 0, duration: 0.35, ease: 'back.out(3)' }, ${r2(T + 0.6 + k * 0.15)});`)),
      };
    case 'relogio':
      return {
        html: svg(`<circle class="sv" cx="60" cy="60" r="44"/><circle ${traco(T, 0.6)} cx="60" cy="60" r="44"/>${[0, 90, 180, 270].map((a) => `<path class="fu-tr" d="M60 22v6" transform="rotate(${a} 60 60)"/>`).join('')}<path id="${id}-h" class="tr-fixo" d="M60 60V38"/><path id="${id}-m" class="tr-ch" d="M60 60h26"/><circle class="ch" cx="60" cy="60" r="5"/>`),
        script: s([
          `tl.fromTo('#${id}-m', { rotation: 0, transformOrigin: '0% 50%' }, { rotation: 720, duration: 2.2, ease: 'power2.inOut' }, ${r2(T + 0.3)});`,
          `tl.fromTo('#${id}-h', { rotation: 0, transformOrigin: '50% 100%' }, { rotation: 60, duration: 2.2, ease: 'power2.inOut' }, ${r2(T + 0.3)});`,
        ]),
      };
    case 'bateria':
      return {
        html: svg(`<rect class="sv" x="14" y="36" width="84" height="48" rx="9"/><rect ${traco(T, 0.5)} x="14" y="36" width="84" height="48" rx="9"/><rect class="ch2" x="100" y="50" width="8" height="20" rx="3"/>${[0, 1, 2, 3].map((k) => `<rect id="${id}-c${k}" class="ch" x="${21 + k * 19}" y="43" width="15" height="34" rx="3"/>`).join('')}<path id="${id}-r" class="fu" d="M62 46l-12 16h10l-4 14 14-18H60z"/>`),
        script: s([
          ...[0, 1, 2, 3].map((k) => `tl.fromTo('#${id}-c${k}', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05 }, ${r2(T + 0.4 + k * 0.28)});`),
          `tl.fromTo('#${id}-r', { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.35, ease: 'back.out(3)' }, ${r2(T + 1.6)});`,
        ]),
      };
    case 'interruptor':
      return {
        html: svg(`<rect class="sv" x="14" y="38" width="92" height="44" rx="22"/><rect id="${id}-f" class="ch" x="14" y="38" width="92" height="44" rx="22"/><rect ${traco(T, 0.5)} x="14" y="38" width="92" height="44" rx="22"/><circle id="${id}-k" class="fu-k" cx="36" cy="60" r="16"/>`),
        script: s([
          `tl.fromTo('#${id}-f', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, ${r2(T + 0.7)});`,
          `tl.fromTo('#${id}-k', { x: 0 }, { x: 48, duration: 0.4, ease: 'back.out(1.8)' }, ${r2(T + 0.6)});`,
        ]),
      };
    case 'curtida':
      return {
        html: svg(`${[0, 1, 2, 3, 4, 5].map((k) => `<circle id="${id}-p${k}" class="${k % 2 ? 'ch2' : 'ch'}" cx="60" cy="62" r="5"/>`).join('')}<path id="${id}-c" class="ch" d="M60 96S22 72 22 46c0-12 9-20 20-20 8 0 14 5 18 11 4-6 10-11 18-11 11 0 20 8 20 20 0 26-38 50-38 50z"/>`),
        script: s([
          `tl.fromTo('#${id}-c', { scale: 0, transformOrigin: '50% 60%' }, { scale: 1, duration: 0.5, ease: 'back.out(3)' }, ${r2(T + 0.1)});`,
          ...[0, 1, 2, 3, 4, 5].map((k) => {
            const a = (k / 6) * Math.PI * 2;
            return `tl.fromTo('#${id}-p${k}', { x: 0, y: 0, autoAlpha: 1, scale: 1, transformOrigin: '50% 50%' }, { x: ${Math.round(Math.cos(a) * 50)}, y: ${Math.round(Math.sin(a) * 50)}, autoAlpha: 0, scale: 0.4, duration: 0.6, ease: 'power2.out' }, ${r2(T + 0.25)});`;
          }),
        ]),
      };
    case 'envelope':
      return {
        html: svg(`<rect id="${id}-l" class="fu-k" x="30" y="30" width="60" height="50" rx="4"/><path id="${id}-ll" class="fu-tr" d="M40 44h40M40 54h30"/><rect class="ch" x="14" y="46" width="92" height="60" rx="8"/><path class="fu-tr" d="M14 54l46 30 46-30"/><path id="${id}-a" class="ch2" d="M14 50l46-32 46 32z"/>`),
        script: s([
          `tl.fromTo('#${id}-a', { scaleY: 1, transformOrigin: '50% 100%' }, { scaleY: -1, duration: 0.45, ease: 'power2.inOut' }, ${r2(T + 0.4)});`,
          `tl.fromTo(['#${id}-l', '#${id}-ll'], { y: 30 }, { y: -6, duration: 0.5, ease: 'back.out(1.6)' }, ${r2(T + 0.8)});`,
        ]),
      };
    case 'lampada':
      return {
        html: svg(`<circle id="${id}-g" class="brilho" cx="60" cy="48" r="44"/><path class="sv" d="M60 14a32 32 0 0 0-18 58c4 3 6 7 6 12v4h24v-4c0-5 2-9 6-12a32 32 0 0 0-18-58z"/><path ${traco(T, 0.6)} d="M60 14a32 32 0 0 0-18 58c4 3 6 7 6 12v4h24v-4c0-5 2-9 6-12a32 32 0 0 0-18-58z"/><path ${traco(T + 0.3, 0.3)} d="M50 98h20M53 108h14"/>${[-60, -30, 0, 30, 60].map((a, k) => `<path ${traco(T + 0.7 + k * 0.05, 0.2)} d="M60 0v-8" transform="rotate(${a} 60 48) translate(0 -6)"/>`).join('')}`),
        script: s([`tl.fromTo('#${id}-g', { autoAlpha: 0, scale: 0.6, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.18, yoyo: true, repeat: 2, ease: 'none' }, ${r2(T + 0.6)});`, `tl.to('#${id}-g', { autoAlpha: 1, scale: 1, duration: 0.2 }, ${r2(T + 1.2)});`]),
      };
    case 'alvo':
      return {
        html: svg(`<g id="${id}-t"><circle class="sv" cx="56" cy="64" r="44"/><circle ${traco(T, 0.5)} cx="56" cy="64" r="44"/><circle class="ch2" cx="56" cy="64" r="28"/><circle class="ch" cx="56" cy="64" r="12"/></g><g id="${id}-f"><path class="tr-fixo" d="M56 64l50-38"/><path class="ch" d="M100 22l14-4-4 14-8 2z"/></g>`),
        script: s([
          `tl.fromTo('#${id}-f', { x: 70, y: -54, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: 0.35, ease: 'power4.in' }, ${r2(T + 0.5)});`,
          `tl.to('#${id}-t', { x: -4, duration: 0.05, yoyo: true, repeat: 3, ease: 'none' }, ${r2(T + 0.85)});`,
        ]),
      };
    // ---------- Rabiscos ----------
    case 'seta_curva':
      return { html: svg(`<path ${traco(T, 0.55)} d="M14 20c40-6 78 14 84 72"/><path ${traco(T + 0.45, 0.2)} d="M82 80l16 14 10-20"/>`), script: '' };
    case 'circulo':
      return { html: svg(`<path ${traco(T, 0.6)} d="M30 30C64 12 112 30 106 62c-6 34-82 40-94 8C4 46 32 24 64 22"/>`), script: '' };
    case 'sublinhado':
      return { html: svg(`<path ${traco(T, 0.5)} d="M6 34c14-14 24 14 38 0s24 14 38 0 24 14 32 2"/>`, '0 0 120 60'), script: '' };
    case 'brilhos': {
      const estrela = (k: number, x: number, y: number, e: number) =>
        `<path id="${id}-b${k}" class="ch" d="M${x} ${y - 14 * e}C${x + 2 * e} ${y - 2 * e} ${x + 2 * e} ${y - 2 * e} ${x + 14 * e} ${y}C${x + 2 * e} ${y + 2 * e} ${x + 2 * e} ${y + 2 * e} ${x} ${y + 14 * e}C${x - 2 * e} ${y + 2 * e} ${x - 2 * e} ${y + 2 * e} ${x - 14 * e} ${y}C${x - 2 * e} ${y - 2 * e} ${x - 2 * e} ${y - 2 * e} ${x} ${y - 14 * e}z"/>`;
      return {
        html: svg(`${estrela(0, 40, 46, 2)}${estrela(1, 88, 30, 1.1)}${estrela(2, 84, 86, 1.4)}`),
        script: s([0, 1, 2].map((k) => `tl.fromTo('#${id}-b${k}', { scale: 0, rotation: -60, transformOrigin: '50% 50%' }, { scale: 1, rotation: 0, duration: 0.4, ease: 'back.out(3)' }, ${r2(T + k * 0.14)}); tl.to('#${id}-b${k}', { scale: 0.7, duration: 0.3, yoyo: true, repeat: 3, ease: 'sine.inOut' }, ${r2(T + 0.6 + k * 0.1)});`)),
      };
    }
    case 'explosao':
      return {
        html: svg([0, 45, 90, 135, 180, 225, 270, 315].map((a, k) => `<path ${traco(T + (k % 2) * 0.05, 0.25)} d="M60 ${k % 2 ? 28 : 22}V${k % 2 ? 12 : 4}" transform="rotate(${a} 60 60)"/>`).join('')),
        script: '',
      };
    case 'x':
      return { html: svg(`<path ${traco(T, 0.3)} d="M24 22c24 22 50 52 74 78"/><path ${traco(T + 0.25, 0.3)} d="M96 20C72 46 44 72 22 98"/>`), script: '' };
    case 'check':
      return { html: svg(`<path ${traco(T, 0.45)} d="M18 62c10 8 20 20 28 32 14-30 32-56 58-78"/>`), script: '' };
    case 'estrela':
      return { html: svg(`<path ${traco(T, 0.7)} d="M60 12l12 32 34 2-27 20 10 34-29-20-29 20 10-34-27-20 34-2z"/>`), script: '' };
    case 'velocidade':
      return { html: svg(`<path ${traco(T, 0.25)} d="M10 40h70"/><path ${traco(T + 0.08, 0.25)} d="M30 60h84"/><path ${traco(T + 0.16, 0.25)} d="M16 80h56"/>`), script: '' };
    case 'exclamacao':
      return { html: svg(`<path ${traco(T, 0.3)} d="M46 16l4 62"/><path ${traco(T + 0.1, 0.3)} d="M76 16l-4 62"/><circle class="ch" cx="51" cy="96" r="6"/><circle class="ch" cx="71" cy="96" r="6"/>`), script: '' };
    default:
      return { html: '', script: '' };
  }
}

/** O CSS dos assets: traço e cores do tema (o mesmo asset em qualquer visual). */
export const CSS_DOS_ASSETS = `
.ast { overflow: visible; display: block; }
.ast .tr { fill: none; stroke: currentColor; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
.ast .tr-fixo { fill: none; stroke: currentColor; stroke-width: 5; stroke-linecap: round; }
.ast .tr-ch { fill: none; stroke: var(--cor-destaque); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
.ast path.ch.tr-ch { fill: var(--cor-destaque); stroke: var(--cor-fundo); stroke-width: 3; }
.ast .ch { fill: var(--cor-destaque); }
.ast .ch2 { fill: var(--cor-destaque-2); }
.ast .sv { fill: color-mix(in srgb, currentColor 10%, transparent); }
.ast .sv-f { fill: color-mix(in srgb, currentColor 28%, transparent); }
.ast .fu { fill: var(--cor-fundo); }
.ast .fu-c { fill: var(--cor-destaque-3); }
.ast .fu-k { fill: color-mix(in srgb, var(--cor-fundo) 30%, #ffffff); }
.ast .fu-tr { fill: none; stroke: var(--cor-fundo); stroke-width: 3.5; stroke-linecap: round; }
.ast .onda { fill: none; stroke: var(--cor-destaque); stroke-width: 3; }
.ast .brilho { fill: color-mix(in srgb, var(--cor-destaque) 32%, transparent); }
.ast * { transform-box: fill-box; }
.ast-seta_curva, .ast-circulo, .ast-sublinhado, .ast-explosao, .ast-x, .ast-check, .ast-estrela, .ast-velocidade, .ast-exclamacao { color: var(--cor-destaque); }
`;
