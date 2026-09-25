// ============================================================
// MAKUCHO STUDIO - Textos de tela: título, chamada, destaque...
//
// Um texto de tela é desenhado no MESMO .ass da legenda, então a prévia
// (libass no navegador) e o render (libass no FFmpeg) mostram a mesma
// coisa. Este arquivo decide COMO:
//
//   - o estilo resolvido (fonte, cor, contorno, sombra, fundo...), com
//     os padrões de cada componente e os campos antigos traduzidos;
//   - a MEDIDA do texto, pela largura real de cada letra da fonte
//     (metricas-de-fontes.ts): é o que permite desenhar um fundo
//     arredondado, em pílula ou em faixa do tamanho certo -- o libass
//     só sabe desenhar retângulo sozinho;
//   - os eventos: fundo (forma vetorial) e texto, com a entrada, a
//     animação durante a exibição e a saída. Entrada e saída são
//     eventos separados: dois `\move` não cabem num evento só.
// ============================================================

import type { EditPlanV1, EstiloDoTexto, KeyframeDoTexto } from './edit-plan';
import { FONTES_DE_VIDEO, fonteDaFamilia } from './estilos-de-legenda';
import type { FonteDeVideo, MarcaDoVideo } from './estilos-de-legenda';
import { CARACTERES_MEDIDOS, METRICAS_DE_FONTES } from './metricas-de-fontes';

// ---------- Vocabulário ----------

export const FORMAS_DE_FUNDO = ['nenhum', 'retangulo', 'arredondado', 'pilula', 'faixa'] as const;
export const ENTRADAS_DE_TEXTO = [
  'nenhuma',
  'surgir',
  'pop',
  'zoom',
  'elastico',
  'deslizar_esquerda',
  'deslizar_direita',
  'subir',
  'descer',
  'digitar',
  'desfocar',
  'quique',
  'letras',
] as const;
export const SAIDAS_DE_TEXTO = ['nenhuma', 'sumir', 'encolher', 'zoom', 'deslizar_esquerda', 'deslizar_direita', 'subir', 'descer', 'desfocar', 'letras'] as const;
export const ANIMACOES_DURANTE = ['nenhuma', 'pulsar', 'balancar', 'brilhar', 'tremer', 'piscar', 'batimento', 'onda', 'flutuar'] as const;
export const CURVAS_DE_KEYFRAME = ['suave', 'linear', 'acelerar', 'frear'] as const;
export type CurvaDeKeyframe = (typeof CURVAS_DE_KEYFRAME)[number];

export type FormaDeFundo = (typeof FORMAS_DE_FUNDO)[number];
export type EntradaDeTexto = (typeof ENTRADAS_DE_TEXTO)[number];
export type SaidaDeTexto = (typeof SAIDAS_DE_TEXTO)[number];
export type AnimacaoDurante = (typeof ANIMACOES_DURANTE)[number];

/** Componentes de texto que usam este desenho. */
export const TEXTOS_DE_TELA = ['HookTitle', 'CTA', 'Destaque', 'LowerThird', 'QuoteCard', 'StatCard'] as const;

// ---------- Padrões por componente ----------

const TAMANHO_BASE: Record<string, number> = {
  HookTitle: 86,
  CTA: 74,
  Destaque: 92,
  LowerThird: 48,
  QuoteCard: 68,
  StatCard: 68,
};

const POSICAO_PADRAO: Record<string, { x: number; y: number }> = {
  HookTitle: { x: 0.5, y: 0.17 },
  CTA: { x: 0.5, y: 0.62 },
  Destaque: { x: 0.5, y: 0.3 },
  LowerThird: { x: 0.5, y: 0.68 },
  QuoteCard: { x: 0.5, y: 0.45 },
  StatCard: { x: 0.5, y: 0.45 },
};

export interface TextoResolvido {
  fonte: FonteDeVideo;
  tamanhoPx: number;
  cor: string;
  contorno: { cor: string; largura: number };
  sombra: { cor: string; distancia: number };
  caixaAlta: boolean;
  espacamento: number;
  rotacao: number;
  sublinhado: boolean;
  fundo: { forma: Exclude<FormaDeFundo, 'nenhum'>; cor: string; opacidade: number; margem: number } | null;
  entrada: EntradaDeTexto;
  saida: SaidaDeTexto;
  durante: AnimacaoDurante;
  corDeDestaque: string;
  x: number;
  y: number;
}

/**
 * O estilo final de um texto de tela: o que a pessoa escolheu, os
 * padrões do componente e os campos antigos (`decoration`, `animation`)
 * traduzidos para o modelo atual.
 */
export function resolverEstiloDoTexto(
  componente: string,
  e: EstiloDoTexto = {},
  marca?: MarcaDoVideo,
): TextoResolvido {
  const primaria = marca?.cores?.primary ?? '#2F66FF';
  const fonte =
    (e.fontId ? (FONTES_DE_VIDEO as Record<string, FonteDeVideo>)[e.fontId] : undefined) ??
    fonteDaFamilia(marca?.fonteTitulo ?? null, 'montserrat');
  const destaque = e.accentColor ?? '#FFD400';

  // Fundo: o campo novo manda; senão, a decoração antiga; senão, o padrão
  // do componente (título e chamada sempre tiveram caixa na cor da marca).
  let fundo: TextoResolvido['fundo'] = null;
  const forma = e.bgShape ?? (e.decoration === 'caixa' || e.decoration === 'marca_texto' ? 'retangulo' : undefined);
  const formaFinal =
    forma ??
    (componente === 'HookTitle' || componente === 'CTA'
      ? 'retangulo'
      : componente === 'Destaque'
        ? 'nenhum'
        : 'arredondado');
  if (formaFinal !== 'nenhum') {
    const corLegada = e.decoration === 'caixa' || e.decoration === 'marca_texto' ? destaque : undefined;
    const corPadrao = componente === 'HookTitle' || componente === 'CTA' ? primaria : '#0B1220';
    fundo = {
      forma: formaFinal,
      cor: e.bgColor ?? corLegada ?? corPadrao,
      opacidade: e.bgOpacity ?? (componente === 'LowerThird' || componente === 'QuoteCard' || componente === 'StatCard' ? 0.84 : 1),
      margem: e.bgPadding ?? 24,
    };
  }

  const corLegadaDoTexto = e.decoration === 'marca_texto' ? '#111111' : undefined;
  const contornoPadrao = fundo ? 0 : e.decoration === 'nenhuma' ? 0 : 7;

  const entradaLegada: Record<string, EntradaDeTexto> = { nenhuma: 'nenhuma', pop: 'pop', surgir: 'surgir', deslizar: 'deslizar_esquerda' };
  const pos = POSICAO_PADRAO[componente] ?? { x: 0.5, y: 0.4 };

  return {
    fonte,
    tamanhoPx: Math.round((TAMANHO_BASE[componente] ?? 80) * (e.sizeScale ?? 1)),
    cor: e.color ?? corLegadaDoTexto ?? '#FFFFFF',
    contorno: { cor: e.outlineColor ?? '#000000', largura: e.outlineWidth ?? contornoPadrao },
    sombra: { cor: e.shadowColor ?? '#000000', distancia: e.shadow ?? (e.decoration === 'sombra' ? 6 : 0) },
    caixaAlta: e.uppercase ?? false,
    espacamento: e.letterSpacing ?? 0,
    rotacao: e.rotation ?? 0,
    sublinhado: e.decoration === 'sublinhado',
    fundo,
    entrada: e.entrada ?? (e.animation ? entradaLegada[e.animation] ?? 'pop' : 'pop'),
    saida: e.saida ?? 'nenhuma',
    durante: e.durante ?? 'nenhuma',
    corDeDestaque: destaque,
    x: e.x ?? pos.x,
    y: e.y ?? pos.y,
  };
}

// ---------- Medida ----------

const INDICE = new Map([...CARACTERES_MEDIDOS].map((c, i) => [c, i]));

/** Largura de uma linha em pixels, pela fonte real. */
export function larguraDoTexto(texto: string, fonte: FonteDeVideo, tamanhoPx: number, espacamento = 0): number {
  const m = METRICAS_DE_FONTES[fonte.arquivo];
  let milesimos = 0;
  for (const c of texto) {
    const i = INDICE.get(c);
    milesimos += i !== undefined && m ? m.larguras[i]! : (m?.padrao ?? 550);
  }
  return (milesimos * tamanhoPx) / 1000 + espacamento * Math.max(0, [...texto].length - 1);
}

/**
 * O texto como vai na tela: caixa alta aplicada e as linhas -- as que a
 * pessoa quebrou e as que não cabem na largura, quebradas por palavra.
 */
function linhasDe(texto: string, r: TextoResolvido, larguraMax: number): string[] {
  const base = r.caixaAlta ? texto.toLocaleUpperCase('pt-BR') : texto;
  const mede = (l: string) => larguraDoTexto(l, r.fonte, r.tamanhoPx, r.espacamento);
  const linhas: string[] = [];
  for (const bruta of base.split(/\r?\n/)) {
    let atual = '';
    for (const palavra of bruta.trim().split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (atual && mede(tentativa) > larguraMax) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = tentativa;
      }
    }
    if (atual) linhas.push(atual);
  }
  return linhas;
}

/** "Nome | cargo" e "87% | dos clientes": a barra vira quebra de linha. */
function textoDoComponente(o: Pick<EditPlanV1['overlays'][number], 'component' | 'text'>): string {
  const t = o.text ?? '';
  if (o.component === 'LowerThird' || o.component === 'StatCard') return t.split('|').map((p) => p.trim()).join('\n');
  if (o.component === 'QuoteCard' && t.trim()) return `“${t.trim()}”`;
  return t;
}

/** Até onde uma linha pode ir antes de quebrar. */
function larguraUtil(plano: EditPlanV1, r: TextoResolvido): number {
  return plano.canvas.width * 0.86 - 2 * (r.fundo?.margem ?? r.contorno.largura);
}

export interface CaixaDoTexto {
  /** Centro, em pixels do quadro. */
  cx: number;
  cy: number;
  /** Tamanho do conjunto (fundo, ou texto quando não há fundo). */
  largura: number;
  altura: number;
}

/** Onde o texto (com o fundo) fica no quadro -- para as alças da prévia. */
export function caixaDoTexto(
  plano: EditPlanV1,
  o: Pick<EditPlanV1['overlays'][number], 'component' | 'text' | 'style'>,
  marca?: MarcaDoVideo,
): CaixaDoTexto {
  const r = resolverEstiloDoTexto(o.component, o.style, marca);
  const { width, height } = plano.canvas;
  const linhas = linhasDe(textoDoComponente(o), r, larguraUtil(plano, r));
  if (!linhas.length) linhas.push('');
  const larguraTexto = Math.max(...linhas.map((l) => larguraDoTexto(l, r.fonte, r.tamanhoPx, r.espacamento)), r.tamanhoPx);
  const alturaTexto = linhas.length * r.tamanhoPx;
  const f = r.fundo;
  const largura = f ? (f.forma === 'faixa' ? width : larguraTexto + 2 * f.margem) : larguraTexto + 2 * r.contorno.largura;
  const altura = f ? alturaTexto + f.margem * 1.2 : alturaTexto + 2 * r.contorno.largura;
  return { cx: Math.round(r.x * width), cy: Math.round(r.y * height), largura: Math.round(largura), altura: Math.round(altura) };
}

// ---------- Desenho ----------

/** `&HBBGGRR&` do .ass. */
function cor(hex: string): string {
  const h = hex.replace('#', '');
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
}

/** Transparência do .ass: 00 opaco, FF invisível. */
function alfa(opacidade: number): string {
  const v = Math.round((1 - Math.max(0, Math.min(1, opacidade))) * 255);
  return `&H${v.toString(16).padStart(2, '0').toUpperCase()}&`;
}

function escapar(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

/** Retângulo de cantos arredondados (raio 0 = retângulo), de 0,0 a w,h. */
function formaArredondada(w: number, h: number, raio: number): string {
  const r = Math.max(0, Math.min(raio, w / 2, h / 2));
  const W = Math.round(w);
  const H = Math.round(h);
  if (r < 1) return `m 0 0 l ${W} 0 l ${W} ${H} l 0 ${H}`;
  const R = Math.round(r);
  // Cada canto: uma curva de Bézier com os pontos de controle no vértice.
  return [
    `m ${R} 0`,
    `l ${W - R} 0`,
    `b ${W} 0 ${W} 0 ${W} ${R}`,
    `l ${W} ${H - R}`,
    `b ${W} ${H} ${W} ${H} ${W - R} ${H}`,
    `l ${R} ${H}`,
    `b 0 ${H} 0 ${H} 0 ${H - R}`,
    `l 0 ${R}`,
    `b 0 0 0 0 ${R} 0`,
  ].join(' ');
}

function dialogo(camada: number, inicioMs: number, fimMs: number, texto: string): string {
  const t = (ms: number) => {
    const cs = Math.max(0, Math.round(ms / 10));
    const h = Math.floor(cs / 360000);
    const m = Math.floor((cs % 360000) / 6000);
    const s = Math.floor((cs % 6000) / 100);
    const c = cs % 100;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
  };
  return `Dialogue: ${camada},${t(inicioMs)},${t(fimMs)},TextoDeTela,,0,0,,${texto}`;
}

/** Quanto dura a entrada e a saída. */
const DURACAO_DA_ENTRADA = 340;
const DURACAO_DA_SAIDA = 300;
const DESLOCAMENTO = 260;

/**
 * As linhas `Dialogue` de um texto de tela: fundo (camada 5) e texto
 * (camada 6), em até dois intervalos -- a exibição (entrada + animação
 * durante) e a saída.
 */
export function eventosDoTextoDeTela(
  plano: EditPlanV1,
  o: EditPlanV1['overlays'][number],
  inicio: number,
  fim: number,
  marca?: MarcaDoVideo,
): string[] {
  const r = resolverEstiloDoTexto(o.component, o.style, marca);
  const linhas = linhasDe(textoDoComponente(o), r, larguraUtil(plano, r));
  if (!linhas.length) return [];

  const { width } = plano.canvas;
  const caixa = caixaDoTexto(plano, o, marca);
  const x = caixa.cx;
  const y = caixa.cy;
  const total = fim - inicio;
  const temSaida = r.saida !== 'nenhuma' && total >= 900;
  const fimDaExibicao = temSaida ? fim - DURACAO_DA_SAIDA : fim;

  const textoAss = linhas.map(escapar).join('\\N');

  // ---------- Tags de cada parte ----------
  const base = (px: number, py: number) => `\\an5\\pos(${px},${py})\\org(${px},${py})${r.rotacao ? `\\frz${r.rotacao}` : ''}`;
  const doTexto =
    `\\fn${r.fonte.nomeAss}\\b${r.fonte.negrito ? 1 : 0}\\fs${r.tamanhoPx}\\q2` +
    `\\c${cor(r.cor)}\\3c${cor(r.contorno.cor)}\\bord${r.contorno.largura}` +
    `\\4c${cor(r.sombra.cor)}\\shad${r.sombra.distancia}` +
    (r.espacamento ? `\\fsp${r.espacamento}` : '') +
    (r.sublinhado ? '\\u1' : '');
  const doFundo = r.fundo ? `\\bord0\\shad0\\c${cor(r.fundo.cor)}\\1a${alfa(r.fundo.opacidade)}` : '';

  const forma = r.fundo
    ? formaArredondada(
        caixa.largura,
        caixa.altura,
        r.fundo.forma === 'pilula' ? caixa.altura / 2 : r.fundo.forma === 'arredondado' ? Math.min(caixa.altura / 3.2, 36) : 0,
      )
    : '';
  // A faixa atravessa o quadro: o centro dela é o meio da largura.
  const xDoFundo = r.fundo?.forma === 'faixa' ? Math.round(width / 2) : x;

  // ---------- Entrada ----------
  const entrada = (px: number, py: number, eTexto: boolean): string => {
    switch (r.entrada) {
      case 'surgir':
        return `${base(px, py)}\\fad(250,0)`;
      case 'pop':
        return `${base(px, py)}\\fad(80,0)\\fscx60\\fscy60\\t(0,140,\\fscx108\\fscy108)\\t(140,220,\\fscx100\\fscy100)`;
      case 'zoom':
        return `${base(px, py)}\\fad(200,0)\\fscx160\\fscy160\\t(0,${DURACAO_DA_ENTRADA - 80},\\fscx100\\fscy100)`;
      case 'elastico':
        return `${base(px, py)}\\fscx30\\fscy30\\t(0,160,\\fscx115\\fscy115)\\t(160,260,\\fscx92\\fscy92)\\t(260,${DURACAO_DA_ENTRADA},\\fscx100\\fscy100)`;
      case 'deslizar_esquerda':
      case 'deslizar_direita':
      case 'subir':
      case 'descer': {
        const dx = r.entrada === 'deslizar_esquerda' ? -DESLOCAMENTO : r.entrada === 'deslizar_direita' ? DESLOCAMENTO : 0;
        const dy = r.entrada === 'subir' ? DESLOCAMENTO * 0.6 : r.entrada === 'descer' ? -DESLOCAMENTO * 0.6 : 0;
        return `\\an5\\move(${px + dx},${py + dy},${px},${py},0,${DURACAO_DA_ENTRADA - 60})\\org(${px},${py})${r.rotacao ? `\\frz${r.rotacao}` : ''}\\fad(160,0)`;
      }
      case 'digitar':
      case 'letras':
        // O fundo entra suave; as letras, uma a uma (ver `porLetra`).
        return `${base(px, py)}${eTexto ? '' : '\\fad(150,0)'}`;
      case 'desfocar':
        return `${base(px, py)}\\fad(200,0)\\blur18\\t(0,${DURACAO_DA_ENTRADA},\\blur0)`;
      case 'quique':
        // Cai de cima, passa do ponto e volta: três \\move seguidos não
        // existem, então a queda é \\move e o quique é escala.
        return (
          `\\an5\\move(${px},${py - DESLOCAMENTO},${px},${py},0,220)\\org(${px},${py})${r.rotacao ? `\\frz${r.rotacao}` : ''}\\fad(120,0)` +
          `\\t(220,300,\\fscx112\\fscy84)\\t(300,380,\\fscx96\\fscy106)\\t(380,460,\\fscx100\\fscy100)`
        );
      default:
        return base(px, py);
    }
  };

  // ---------- Durante a exibição ----------
  const durante = (eTexto: boolean): string => {
    const de = DURACAO_DA_ENTRADA + 60;
    const ate = fimDaExibicao - inicio;
    if (ate - de < 500) return '';
    const passos: string[] = [];
    const limite = 40;
    switch (r.durante) {
      case 'pulsar':
        for (let t = de; t + 800 <= ate && passos.length < limite; t += 900) {
          passos.push(`\\t(${t},${t + 400},\\fscx106\\fscy106)\\t(${t + 400},${t + 800},\\fscx100\\fscy100)`);
        }
        break;
      case 'balancar':
        for (let t = de; t + 1000 <= ate && passos.length < limite; t += 1000) {
          passos.push(`\\t(${t},${t + 500},\\frz${r.rotacao + 3})\\t(${t + 500},${t + 1000},\\frz${r.rotacao - 3})`);
        }
        passos.push(`\\t(${ate - 1},${ate},\\frz${r.rotacao})`);
        break;
      case 'brilhar':
        if (!eTexto) return '';
        for (let t = de; t + 1200 <= ate && passos.length < limite; t += 1200) {
          passos.push(`\\t(${t},${t + 600},\\blur6\\3c${cor(r.corDeDestaque)})\\t(${t + 600},${t + 1200},\\blur0\\3c${cor(r.contorno.cor)})`);
        }
        break;
      case 'tremer':
        // Em rajadas: 300 ms tremendo a cada 1,5 s -- contínuo cansa.
        for (let t = de; t + 300 <= ate && passos.length < limite; t += 1500) {
          for (let k = 0; k < 5; k += 1) {
            const a = t + k * 60;
            passos.push(`\\t(${a},${a + 60},\\frz${r.rotacao + (k % 2 ? -2 : 2)})`);
          }
          passos.push(`\\t(${t + 300},${t + 320},\\frz${r.rotacao})`);
        }
        break;
      case 'piscar':
        // Some e volta rápido, de tempos em tempos.
        for (let t = de; t + 240 <= ate && passos.length < limite; t += 1400) {
          passos.push(`\\t(${t},${t + 60},\\alpha&HC0&)\\t(${t + 60},${t + 120},\\alpha&H00&)\\t(${t + 120},${t + 180},\\alpha&HC0&)\\t(${t + 180},${t + 240},\\alpha&H00&)`);
        }
        break;
      case 'batimento':
        // Duas batidas curtas e uma pausa, como um coração.
        for (let t = de; t + 700 <= ate && passos.length < limite; t += 1100) {
          passos.push(
            `\\t(${t},${t + 120},\\fscx110\\fscy110)\\t(${t + 120},${t + 240},\\fscx100\\fscy100)` +
              `\\t(${t + 300},${t + 420},\\fscx107\\fscy107)\\t(${t + 420},${t + 600},\\fscx100\\fscy100)`,
          );
        }
        break;
      case 'flutuar':
        // Balanço lento e leve, como algo boiando.
        for (let t = de; t + 2400 <= ate && passos.length < limite; t += 2400) {
          passos.push(`\\t(${t},${t + 1200},\\frz${r.rotacao + 1.5}\\fscx103\\fscy103)\\t(${t + 1200},${t + 2400},\\frz${r.rotacao - 1.5}\\fscx100\\fscy100)`);
        }
        passos.push(`\\t(${ate - 1},${ate},\\frz${r.rotacao})`);
        break;
      default:
        break;
    }
    return passos.join('');
  };

  // ---------- Saída ----------
  const saida = (px: number, py: number): string => {
    const d = DURACAO_DA_SAIDA;
    switch (r.saida) {
      case 'sumir':
        return `${base(px, py)}\\fad(0,${d})`;
      case 'encolher':
        return `${base(px, py)}\\t(0,${d},\\fscx0\\fscy0)`;
      case 'zoom':
        return `${base(px, py)}\\fad(0,${d})\\t(0,${d},\\fscx150\\fscy150)`;
      case 'deslizar_esquerda':
      case 'deslizar_direita':
      case 'subir':
      case 'descer': {
        const dx = r.saida === 'deslizar_esquerda' ? -DESLOCAMENTO : r.saida === 'deslizar_direita' ? DESLOCAMENTO : 0;
        const dy = r.saida === 'subir' ? -DESLOCAMENTO * 0.6 : r.saida === 'descer' ? DESLOCAMENTO * 0.6 : 0;
        return `\\an5\\move(${px},${py},${px + dx},${py + dy},0,${d})\\org(${px},${py})${r.rotacao ? `\\frz${r.rotacao}` : ''}\\fad(0,${d})`;
      }
      case 'desfocar':
        return `${base(px, py)}\\fad(0,${d})\\t(0,${d},\\blur18)`;
      default:
        return base(px, py);
    }
  };

  /**
   * Letra a letra: cada uma com as suas tags, sem mexer no layout (só
   * \\alpha e \\fscy, que não mudam a largura da linha).
   *   - digitar: acende no seu tempo;
   *   - letras: sobe de 0 a 100% de altura, uma depois da outra;
   *   - onda (durante): cada letra cresce e volta, em sequência;
   *   - saída "letras": some uma a uma, a partir do fim da exibição.
   */
  const porLetra = (modo: 'digitar' | 'letras' | 'onda' | 'sair', duracao = 0): string => {
    const letras = [...linhas.join('\n')];
    const n = Math.max(1, letras.filter((c) => c !== '\n').length);
    const passo = Math.max(25, Math.min(70, 800 / n));
    let i = -1;
    return letras
      .map((c) => {
        if (c === '\n') return '\\N';
        i += 1;
        const a = Math.round(80 + i * passo);
        if (modo === 'digitar') return `{\\alpha&HFF&\\t(${a},${a + 1},\\alpha&H00&)}${escapar(c)}`;
        if (modo === 'letras') return `{\\alpha&HFF&\\fscy0\\t(${a},${a + 1},\\alpha&H00&)\\t(${a},${a + 180},\\fscy100)}${escapar(c)}`;
        if (modo === 'sair') {
          const s = Math.round(Math.max(0, duracao - 40 - (n - i) * Math.min(passo, duracao / n)));
          return `{\\t(${s},${s + 1},\\alpha&HFF&)}${escapar(c)}`;
        }
        // onda: 600 ms por volta, cada letra 60 ms depois da anterior.
        const ondas: string[] = [];
        for (let t = DURACAO_DA_ENTRADA + 60 + i * 60; t + 300 <= duracao && ondas.length < 12; t += 1600) {
          ondas.push(`\\t(${t},${t + 150},\\fscy125)\\t(${t + 150},${t + 300},\\fscy100)`);
        }
        return `{${ondas.join('')}}${escapar(c)}`;
      })
      .join('');
  };

  if (o.style?.keyframes?.length) return eventosComKeyframes(plano, o, inicio, fim, r, textoAss, doTexto, forma, marca);

  const eventos: string[] = [];
  if (r.fundo) {
    eventos.push(dialogo(5, inicio, fimDaExibicao, `{${entrada(xDoFundo, y, false)}${durante(false)}${doFundo}\\p1}${forma}{\\p0}`));
    if (temSaida) eventos.push(dialogo(5, fimDaExibicao, fim, `{${saida(xDoFundo, y)}${doFundo}\\p1}${forma}{\\p0}`));
  }
  const corpo =
    r.entrada === 'digitar' || r.entrada === 'letras'
      ? porLetra(r.entrada)
      : r.durante === 'onda'
        ? porLetra('onda', fimDaExibicao - inicio)
        : textoAss;
  eventos.push(dialogo(6, inicio, fimDaExibicao, `{${entrada(x, y, true)}${durante(true)}${doTexto}}${corpo}`));
  if (temSaida) eventos.push(dialogo(6, fimDaExibicao, fim, `{${saida(x, y)}${doTexto}}${r.saida === 'letras' ? porLetra('sair', fim - fimDaExibicao) : textoAss}`));
  return eventos;
}

// ---------- Keyframes (animação livre) ----------

/** O estado de um texto num instante: posição (0-1), escala, giro e opacidade. */
export interface EstadoDoTexto {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

const PROPRIEDADES = ['x', 'y', 'scale', 'rotation', 'opacity'] as const;

function curva(ease: CurvaDeKeyframe | undefined, u: number): number {
  switch (ease) {
    case 'linear':
      return u;
    case 'acelerar':
      return u * u;
    case 'frear':
      return 1 - (1 - u) * (1 - u);
    default:
      return u * u * (3 - 2 * u);
  }
}

/**
 * Onde o texto está `t` ms depois de começar. Cada propriedade anda entre
 * os pontos que a definem, pela curva do ponto de onde sai; antes do
 * primeiro e depois do último, fica parada; sem ponto, vale o estilo.
 */
export function estadoDoTexto(
  o: Pick<EditPlanV1['overlays'][number], 'component' | 'style'>,
  t: number,
  marca?: MarcaDoVideo,
): EstadoDoTexto {
  const r = resolverEstiloDoTexto(o.component, o.style, marca);
  const base: EstadoDoTexto = { x: r.x, y: r.y, scale: 1, rotation: r.rotacao, opacity: 1 };
  const pontos = [...(o.style?.keyframes ?? [])].sort((a, b) => a.t - b.t);
  const estado = { ...base };
  for (const p of PROPRIEDADES) {
    const com = pontos.filter((k) => k[p] !== undefined);
    if (!com.length) continue;
    const primeiro = com[0]!;
    const ultimo = com.at(-1)!;
    if (t <= primeiro.t) estado[p] = primeiro[p]!;
    else if (t >= ultimo.t) estado[p] = ultimo[p]!;
    else {
      const i = com.findIndex((k) => k.t > t);
      const a = com[i - 1]!;
      const b = com[i]!;
      const u = curva(a.ease, (t - a.t) / (b.t - a.t));
      estado[p] = a[p]! + (b[p]! - a[p]!) * u;
    }
  }
  return estado;
}

/**
 * Os pontos com um novo (ou atualizado) em `t`, alinhado ao quadro. Um
 * ponto novo nasce com o estado do texto naquele instante -- pôr um ponto
 * não muda nada até a pessoa mexer.
 */
export function comKeyframe(
  o: Pick<EditPlanV1['overlays'][number], 'component' | 'style'>,
  t: number,
  valores: Partial<Omit<KeyframeDoTexto, 't'>>,
  marca?: MarcaDoVideo,
): KeyframeDoTexto[] {
  const quadro = Math.max(0, Math.round((t * 30) / 1000) * (1000 / 30));
  const tq = Math.round(quadro);
  const lista = [...(o.style?.keyframes ?? [])];
  const i = lista.findIndex((k) => Math.abs(k.t - tq) <= 20);
  const arred = (v: number, casas = 4) => Math.round(v * 10 ** casas) / 10 ** casas;
  if (i >= 0) {
    lista[i] = { ...lista[i]!, ...valores };
  } else {
    const e = estadoDoTexto(o, tq, marca);
    lista.push({ t: tq, x: arred(e.x), y: arred(e.y), scale: arred(e.scale), rotation: arred(e.rotation, 2), opacity: arred(e.opacity, 3), ...valores });
  }
  return lista.sort((a, b) => a.t - b.t);
}

/** Os pontos sem o de `t` (±20 ms). */
export function semKeyframe(o: Pick<EditPlanV1['overlays'][number], 'style'>, t: number): KeyframeDoTexto[] {
  return (o.style?.keyframes ?? []).filter((k) => Math.abs(k.t - t) > 20);
}

/**
 * O texto com keyframes: um evento por pedaço de até 80 ms entre os
 * pontos, cada um com \\move e \\t lineares do estado do começo ao do
 * fim -- a curva sai da soma dos pedaços. Onde nada muda, um evento só.
 * Com pontos, entrada, saída e animação durante ficam desligadas: duas
 * animações da mesma coisa brigariam.
 */
function eventosComKeyframes(
  plano: EditPlanV1,
  o: EditPlanV1['overlays'][number],
  inicio: number,
  fim: number,
  r: TextoResolvido,
  textoAss: string,
  doTexto: string,
  forma: string,
  marca?: MarcaDoVideo,
): string[] {
  const { width, height } = plano.canvas;
  const total = fim - inicio;
  const cortes = [...new Set([0, total, ...(o.style?.keyframes ?? []).map((k) => k.t).filter((t) => t > 0 && t < total)])].sort((a, b) => a - b);
  const pedacos: Array<[number, number]> = [];
  for (let i = 0; i + 1 < cortes.length; i += 1) {
    const a = cortes[i]!;
    const b = cortes[i + 1]!;
    const ea = estadoDoTexto(o, a, marca);
    const eb = estadoDoTexto(o, b, marca);
    const muda = PROPRIEDADES.some((p) => Math.abs(ea[p] - eb[p]) > 1e-6);
    const n = muda ? Math.max(1, Math.min(60, Math.ceil((b - a) / 80))) : 1;
    for (let k = 0; k < n; k += 1) pedacos.push([a + ((b - a) * k) / n, a + ((b - a) * (k + 1)) / n]);
  }
  const eventos: string[] = [];
  const xDoFundo = (e: EstadoDoTexto) => (r.fundo?.forma === 'faixa' ? Math.round(width / 2) : Math.round(e.x * width));
  const opFundo = r.fundo?.opacidade ?? 1;
  for (const [a, b] of pedacos) {
    const ea = estadoDoTexto(o, a, marca);
    const eb = estadoDoTexto(o, b, marca);
    const d = Math.max(1, Math.round(b - a));
    const pos = (xa: number, ya: number, xb: number, yb: number) =>
      xa === xb && ya === yb ? `\\an5\\pos(${xa},${ya})\\org(${xa},${ya})` : `\\an5\\move(${xa},${ya},${xb},${yb},0,${d})\\org(${xa},${ya})`;
    const escala = (e: EstadoDoTexto) => `\\fscx${Math.round(e.scale * 1000) / 10}\\fscy${Math.round(e.scale * 1000) / 10}\\frz${Math.round(e.rotation * 100) / 100}`;
    const ya = Math.round(ea.y * height);
    const yb = Math.round(eb.y * height);
    if (r.fundo) {
      const fundo = `\\bord0\\shad0\\c${cor(r.fundo.cor)}`;
      eventos.push(
        dialogo(
          5,
          inicio + a,
          inicio + b,
          `{${pos(xDoFundo(ea), ya, xDoFundo(eb), yb)}${fundo}${escala(ea)}\\1a${alfa(opFundo * ea.opacity)}\\t(0,${d},${escala(eb)}\\1a${alfa(opFundo * eb.opacity)})\\p1}${forma}{\\p0}`,
        ),
      );
    }
    eventos.push(
      dialogo(
        6,
        inicio + a,
        inicio + b,
        `{${pos(Math.round(ea.x * width), ya, Math.round(eb.x * width), yb)}${doTexto}${escala(ea)}\\alpha${alfa(ea.opacity)}\\t(0,${d},${escala(eb)}\\alpha${alfa(eb.opacity)})}${textoAss}`,
      ),
    );
  }
  return eventos;
}

// ---------- Estilos prontos ----------

export interface PresetDeTexto {
  id: string;
  rotulo: string;
  descricao: string;
  /** O estilo COMPLETO (sem posição): aplicar troca tudo, menos o lugar. */
  estilo: EstiloDoTexto;
}

const tudo = (e: EstiloDoTexto): EstiloDoTexto => ({
  sizeScale: 1,
  color: '#FFFFFF',
  outlineColor: '#000000',
  outlineWidth: 0,
  shadow: 0,
  shadowColor: '#000000',
  uppercase: false,
  letterSpacing: 0,
  rotation: 0,
  bgShape: 'nenhum',
  bgColor: '#000000',
  bgOpacity: 1,
  bgPadding: 24,
  entrada: 'pop',
  saida: 'nenhuma',
  durante: 'nenhuma',
  accentColor: '#FFD400',
  ...e,
});

export const PRESETS_DE_TEXTO: readonly PresetDeTexto[] = [
  {
    id: 'classico',
    rotulo: 'Clássico',
    descricao: 'Texto branco numa caixa arredondada azul.',
    estilo: tudo({ preset: 'classico', fontId: 'montserrat-black', bgShape: 'arredondado', bgColor: '#2F66FF', entrada: 'pop' }),
  },
  {
    id: 'impacto',
    rotulo: 'Impacto',
    descricao: 'Letras altas amarelas com contorno forte.',
    estilo: tudo({ preset: 'impacto', fontId: 'bebas', sizeScale: 1.35, color: '#FFD400', outlineWidth: 8, uppercase: true, letterSpacing: 2, entrada: 'zoom', durante: 'pulsar' }),
  },
  {
    id: 'etiqueta',
    rotulo: 'Etiqueta',
    descricao: 'Branco sobre preto, entrando de lado.',
    estilo: tudo({ preset: 'etiqueta', fontId: 'anton', uppercase: true, bgShape: 'retangulo', bgColor: '#0A0A0A', bgOpacity: 0.92, bgPadding: 22, entrada: 'deslizar_esquerda', saida: 'deslizar_direita' }),
  },
  {
    id: 'marca_texto',
    rotulo: 'Marca-texto',
    descricao: 'Grifado em amarelo, levemente inclinado.',
    estilo: tudo({ preset: 'marca_texto', fontId: 'archivo-black', color: '#111111', bgShape: 'retangulo', bgColor: '#FFD400', bgPadding: 18, rotation: -2, entrada: 'pop' }),
  },
  {
    id: 'pilula',
    rotulo: 'Pílula',
    descricao: 'Cápsula vermelha, entrada elástica.',
    estilo: tudo({ preset: 'pilula', fontId: 'poppins-extra', bgShape: 'pilula', bgColor: '#FF3B5C', bgPadding: 30, entrada: 'elastico' }),
  },
  {
    id: 'neon',
    rotulo: 'Neon',
    descricao: 'Contorno luminoso que pulsa em ciano.',
    estilo: tudo({ preset: 'neon', fontId: 'montserrat-black', color: '#E9FCFF', outlineColor: '#1DA1F2', outlineWidth: 4, accentColor: '#41C8FF', entrada: 'surgir', durante: 'brilhar' }),
  },
  {
    id: 'faixa',
    rotulo: 'Faixa',
    descricao: 'Tarja de ponta a ponta, estilo telejornal.',
    estilo: tudo({ preset: 'faixa', fontId: 'anton', uppercase: true, bgShape: 'faixa', bgColor: '#111827', bgOpacity: 0.86, bgPadding: 20, entrada: 'deslizar_direita', saida: 'deslizar_esquerda' }),
  },
  {
    id: 'minimal',
    rotulo: 'Minimal',
    descricao: 'Só o texto, com uma sombra suave.',
    estilo: tudo({ preset: 'minimal', fontId: 'inter', shadow: 4, entrada: 'surgir', saida: 'sumir' }),
  },
  {
    id: 'elegante',
    rotulo: 'Elegante',
    descricao: 'Serifada sobre fundo escuro translúcido.',
    estilo: tudo({ preset: 'elegante', fontId: 'playfair', bgShape: 'arredondado', bgColor: '#000000', bgOpacity: 0.55, bgPadding: 28, entrada: 'surgir', saida: 'sumir' }),
  },
  {
    id: 'digitando',
    rotulo: 'Digitando',
    descricao: 'Letra por letra, como quem digita.',
    estilo: tudo({ preset: 'digitando', fontId: 'source-sans', bgShape: 'arredondado', bgColor: '#FFFFFF', color: '#111111', bgPadding: 22, entrada: 'digitar', saida: 'sumir' }),
  },
  {
    id: 'alerta',
    rotulo: 'Alerta',
    descricao: 'Vermelho que treme para chamar atenção.',
    estilo: tudo({ preset: 'alerta', fontId: 'archivo-black', uppercase: true, bgShape: 'arredondado', bgColor: '#E11D48', bgPadding: 22, entrada: 'pop', durante: 'tremer' }),
  },
  {
    id: 'atras',
    rotulo: 'Atrás da pessoa',
    descricao: 'Letras enormes atrás de quem fala: a pessoa fica na frente do texto.',
    estilo: tudo({ preset: 'atras', fontId: 'anton', sizeScale: 2.6, uppercase: true, letterSpacing: 2, atras: true, entrada: 'zoom', saida: 'sumir' }),
  },
  {
    id: 'quadrinho',
    rotulo: 'Quadrinho',
    descricao: 'Letra de HQ com contorno grosso e balanço.',
    estilo: tudo({ preset: 'quadrinho', fontId: 'bangers', sizeScale: 1.2, color: '#FFFFFF', outlineColor: '#111111', outlineWidth: 9, letterSpacing: 2, rotation: -3, entrada: 'elastico', durante: 'balancar' }),
  },
];
