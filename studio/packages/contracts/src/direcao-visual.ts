// ============================================================
// MAKUCHO STUDIO - A direção visual da montagem: QUEM decide o que entra
// na tela e QUANDO, com critério, e o que o servidor confere sem gastar
// token.
//
// Antes, cada peça decidia sozinha: a seleção punha o título na abertura
// e a chamada no fim, o acabamento dava zoom em trechos, as mídias
// escolhiam momentos próprios e as animações vinham por COTA ("cerca de
// um cartão a cada 7 s"). O resultado era animação por cima do título,
// mídia no mesmo instante de uma animação e cartões inventados para
// cumprir a conta.
//
// Aqui ficam as regras da direção:
//   - a resposta da IA é lida mesmo quando vem cortada (os cartões
//     completos valem; um JSON truncado não derruba tudo);
//   - cada cartão precisa de um GATILHO literal na fala (o número dito,
//     a lista enumerada, a frase forte) -- sem gatilho, sem cartão;
//   - FIDELIDADE: número que o cartão mostra tem de ter sido dito;
//   - espaço reservado (o título da abertura, a chamada do fim, mídias
//     já no vídeo) não recebe cartão;
//   - RESPIRO: no máximo metade do vídeo com gráfico; entre cartões, 1 s
//     livre; tela cheia, no máximo uma.
// Zero cartão é uma resposta válida.
// ============================================================

import type { EditPlanV1 } from './edit-plan';
import { agendaDoPlano } from './agenda';

export interface PalavraNoTempo {
  /** Segundo no vídeo final. */
  s: number;
  texto: string;
}

export interface JanelaReservada {
  inicioS: number;
  fimS: number;
  motivo: string;
}

/** Um cartão como a direção pediu (depois de lido e conferido). */
export interface CartaoDirigido {
  inicioS: number;
  fimS: number;
  layout: 'meio_a_meio' | 'cartao' | 'tela_cheia' | 'pip';
  lado?: 'cima' | 'baixo';
  canto?: 'sup-esq' | 'sup-dir' | 'inf-esq' | 'inf-dir';
  tipo: string;
  /** O que o cartão explica. */
  intencao: string;
  /** kicker, título, detalhe, dado, itens (texto JSON ou livre). */
  conteudo: string;
  /** As palavras da fala que pedem o cartão (literais). */
  gatilho: string;
  /** 1 = essencial, 2 = ajuda, 3 = enfeite (sai primeiro). */
  prioridade: number;
  acento: number;
}

export interface CartaoDescartado {
  inicioS: number;
  tipo: string;
  motivo: string;
}

export interface LeituraDaDirecao {
  estilo?: string;
  tom?: string;
  cartoes: Array<Record<string, unknown>>;
  /** A resposta veio cortada: só os cartões completos foram lidos. */
  cortada: boolean;
}

// ---------- Leitura tolerante ----------

/** Os objetos completos de um array JSON, mesmo que o texto termine no meio. */
function objetosCompletos(texto: string, desde: number): Array<Record<string, unknown>> {
  const saida: Array<Record<string, unknown>> = [];
  let profundidade = 0;
  let inicio = -1;
  let emTexto = false;
  let escape = false;
  for (let i = desde; i < texto.length; i += 1) {
    const c = texto[i]!;
    if (emTexto) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') emTexto = false;
      continue;
    }
    if (c === '"') emTexto = true;
    else if (c === '{') {
      if (profundidade === 0) inicio = i;
      profundidade += 1;
    } else if (c === '}') {
      profundidade -= 1;
      if (profundidade === 0 && inicio >= 0) {
        try {
          saida.push(JSON.parse(texto.slice(inicio, i + 1)) as Record<string, unknown>);
        } catch {
          // um objeto malformado não derruba os outros
        }
        inicio = -1;
      }
    } else if (c === ']' && profundidade === 0) break;
  }
  return saida;
}

/**
 * Lê o roteiro visual da IA. Um JSON cortado no meio (resposta longa que
 * bateu no teto) ainda rende os cartões que chegaram inteiros.
 */
export function lerDirecao(texto: string): LeituraDaDirecao {
  const limpo = texto.replace(/```(?:json)?/g, '');
  const i = limpo.indexOf('{');
  const f = limpo.lastIndexOf('}');
  if (i >= 0 && f > i) {
    try {
      const j = JSON.parse(limpo.slice(i, f + 1)) as Record<string, unknown>;
      const lista = (Array.isArray(j.cartoes) ? j.cartoes : Array.isArray(j.momentos) ? j.momentos : []) as Array<Record<string, unknown>>;
      return {
        ...(typeof j.estilo === 'string' ? { estilo: j.estilo } : {}),
        ...(typeof j.tom === 'string' ? { tom: j.tom } : {}),
        cartoes: lista.filter((x) => x && typeof x === 'object'),
        cortada: false,
      };
    } catch {
      // cai na leitura parcial
    }
  }
  const estilo = /"estilo"\s*:\s*"([^"]+)"/.exec(limpo)?.[1];
  const tom = /"tom"\s*:\s*"([^"]*)"/.exec(limpo)?.[1];
  const m = /"(?:cartoes|momentos)"\s*:\s*\[/.exec(limpo);
  if (!m) throw new Error('a resposta não trouxe o roteiro visual');
  return {
    ...(estilo ? { estilo } : {}),
    ...(tom ? { tom } : {}),
    cartoes: objetosCompletos(limpo, m.index + m[0].length),
    cortada: true,
  };
}

// ---------- Números: o que foi dito e o que o cartão mostra ----------

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900,
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "1.500" = 1500; "1,5" = 1.5; "10%" = 10. */
function valorDeDigitos(bruto: string): number {
  let t = bruto;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '');
  t = t.replace(',', '.');
  return Number(t);
}

/** Os números de um texto: em dígitos e por extenso ("vinte e cinco mil"). */
export function numerosDoTexto(texto: string): number[] {
  const saida: number[] = [];
  for (const m of texto.matchAll(/\d[\d.,]*\d|\d/g)) {
    const v = valorDeDigitos(m[0]);
    if (Number.isFinite(v)) saida.push(v);
    // "3 mil", "2 milhões" em dígitos seguidos da palavra
    const depois = semAcento(texto.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 10));
    if (/^\s*mil\b/.test(depois)) saida.push(v * 1000);
    if (/^\s*milh/.test(depois)) saida.push(v * 1_000_000);
  }
  // Por extenso
  const palavras = semAcento(texto).split(/[^a-z]+/).filter(Boolean);
  let total = 0;
  let atual = 0;
  let emNumero = false;
  const fechar = () => {
    if (emNumero) saida.push(total + atual);
    total = 0;
    atual = 0;
    emNumero = false;
  };
  for (const p of palavras) {
    if (p in UNIDADES) {
      atual += UNIDADES[p]!;
      emNumero = true;
    } else if (p === 'mil' && emNumero) {
      total += (atual || 1) * 1000;
      atual = 0;
    } else if (p === 'mil') {
      total = 1000;
      emNumero = true;
    } else if (/^milh(ao|oes)$/.test(p)) {
      total += (atual || 1) * 1_000_000;
      atual = 0;
      emNumero = true;
    } else if (p === 'e' && emNumero) {
      continue;
    } else fechar();
  }
  fechar();
  return saida;
}

/**
 * Os números que o cartão mostra e que NÃO foram ditos no trecho. Até 10
 * passa (numeração de lista, "3 passos"): a regra pega o dado inventado
 * -- o preço, a porcentagem, o ano, a estatística.
 */
export function numerosInventados(textoDoCartao: string, falaDoTrecho: string): number[] {
  const ditos = numerosDoTexto(falaDoTrecho);
  const perto = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.001, Math.abs(b) * 0.001);
  return [...new Set(numerosDoTexto(textoDoCartao))].filter((n) => n > 10 && !ditos.some((d) => perto(n, d)));
}

/** O texto visível de um HTML (sem tags, estilos e scripts). */
export function textoVisivelDoHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- O que já ocupa a tela ----------

/**
 * O que a animação não pode cobrir: o título da abertura, a chamada do
 * fim e as mídias/animações que já estão no vídeo.
 */
export function janelasReservadasDoPlano(plano: EditPlanV1): JanelaReservada[] {
  const saida: JanelaReservada[] = [];
  for (const o of plano.overlays) {
    if (o.component === 'HookTitle') saida.push({ inicioS: o.timelineStartMs / 1000, fimS: (o.timelineStartMs + o.durationMs) / 1000, motivo: 'título da abertura' });
    if (o.component === 'CTA') saida.push({ inicioS: o.timelineStartMs / 1000, fimS: (o.timelineStartMs + o.durationMs) / 1000, motivo: 'chamada do fim' });
  }
  for (const m of plano.mediaLayers ?? []) {
    saida.push({ inicioS: m.timelineStartMs / 1000, fimS: (m.timelineStartMs + m.durationMs) / 1000, motivo: m.kind === 'html' ? 'outra animação' : 'mídia já no vídeo' });
  }
  return saida.sort((a, b) => a.inicioS - b.inicioS);
}

/** Os trechos do vídeo final com o papel de cada um (gancho, prova...). */
export function papeisNoTempo(plano: EditPlanV1): Array<{ inicioS: number; fimS: number; papel: string }> {
  return agendaDoPlano(plano).trechos.map((t) => ({
    inicioS: t.inicioMs / 1000,
    fimS: (t.inicioMs + t.duracaoMs) / 1000,
    papel: String((t.clip as { role?: string }).role ?? ''),
  }));
}

// ---------- A conferência dos cartões ----------

const LAYOUTS = ['meio_a_meio', 'cartao', 'tela_cheia', 'pip'] as const;
const CANTOS = ['sup-esq', 'sup-dir', 'inf-esq', 'inf-dir'] as const;

/** O teto de cartões (é um teto, não uma meta: zero vale). */
export function tetoDeCartoes(duracaoS: number): number {
  return Math.max(1, Math.min(8, Math.floor(duracaoS / 8)));
}

/** Fração máxima do vídeo com gráfico por cima (o rosto também conta a história). */
export const FRACAO_MAXIMA_COM_GRAFICO = 0.5;
/** Respiro mínimo entre dois cartões (s). */
const RESPIRO_S = 1;

const palavrasSignificativas = (t: string) => semAcento(t).split(/[^a-z0-9]+/).filter((p) => p.length >= 3);

function falaEntre(palavras: readonly PalavraNoTempo[], de: number, ate: number): string {
  return palavras.filter((p) => p.s >= de && p.s < ate).map((p) => p.texto).join(' ');
}

/**
 * Lê, confere e escolhe os cartões da direção. Devolve os que entram (em
 * ordem de tempo) e os que saíram, cada um com o motivo -- o diagnóstico
 * que o editor mostra.
 */
export function conferirCartoes(
  brutos: ReadonlyArray<Record<string, unknown>>,
  ctx: { duracaoS: number; palavras: readonly PalavraNoTempo[]; reservadas: readonly JanelaReservada[] },
): { aceitos: CartaoDirigido[]; descartados: CartaoDescartado[] } {
  const descartados: CartaoDescartado[] = [];
  const candidatos: CartaoDirigido[] = [];

  for (const x of brutos) {
    const tipo = String(x.tipo ?? '').slice(0, 40);
    let inicio = Number(x.inicioS);
    let fim = Number(x.fimS);
    if (!Number.isFinite(inicio) || !Number.isFinite(fim)) {
      descartados.push({ inicioS: 0, tipo, motivo: 'sem instante válido' });
      continue;
    }
    // Resposta em milissegundos por engano: converte em vez de perder o cartão.
    if (inicio > ctx.duracaoS + 1 && inicio / 1000 <= ctx.duracaoS) {
      inicio /= 1000;
      fim /= 1000;
    }
    inicio = Math.max(0, inicio);
    fim = Math.min(ctx.duracaoS, Math.min(fim, inicio + 12));
    if (fim - inicio < 2) {
      descartados.push({ inicioS: inicio, tipo, motivo: 'curto demais (menos de 2 s)' });
      continue;
    }

    // Espaço reservado: encolhe para fora dele; se não sobrar, sai.
    let bloqueio = '';
    for (const r of ctx.reservadas) {
      if (inicio >= r.fimS || fim <= r.inicioS) continue;
      if (r.inicioS <= inicio) inicio = r.fimS + 0.3;
      else fim = r.inicioS - 0.3;
      if (fim - inicio < 2.5) {
        bloqueio = r.motivo;
        break;
      }
    }
    if (bloqueio) {
      descartados.push({ inicioS: Number(x.inicioS), tipo, motivo: `cairia sobre ${bloqueio}` });
      continue;
    }

    const conteudo = typeof x.conteudo === 'string' ? x.conteudo : x.conteudo ? JSON.stringify(x.conteudo) : '';
    const gatilho = String(x.gatilho ?? '').slice(0, 200);
    const fala = falaEntre(ctx.palavras, inicio - 1.5, fim + 0.5);

    // Gatilho: as palavras que pedem o cartão estão MESMO na fala do trecho?
    const doGatilho = palavrasSignificativas(gatilho);
    const naFala = new Set(palavrasSignificativas(fala));
    const achadas = doGatilho.filter((p) => naFala.has(p)).length;
    if (!doGatilho.length || achadas / doGatilho.length < 0.5) {
      descartados.push({ inicioS: inicio, tipo, motivo: gatilho ? `o gatilho "${gatilho.slice(0, 50)}" não está na fala do trecho` : 'sem gatilho na fala' });
      continue;
    }

    // Fidelidade: número no cartão tem de ter sido dito (numa janela maior).
    const inventados = numerosInventados(conteudo, falaEntre(ctx.palavras, inicio - 4, fim + 2));
    if (inventados.length) {
      descartados.push({ inicioS: inicio, tipo, motivo: `mostraria ${inventados.slice(0, 3).join(', ')}, que não foi dito` });
      continue;
    }

    const layout = (LAYOUTS as readonly string[]).includes(String(x.layout)) ? (x.layout as CartaoDirigido['layout']) : 'meio_a_meio';
    candidatos.push({
      inicioS: Math.round(inicio * 100) / 100,
      fimS: Math.round(fim * 100) / 100,
      layout,
      ...(layout === 'meio_a_meio' ? { lado: x.lado === 'baixo' ? ('baixo' as const) : ('cima' as const) } : {}),
      ...(layout === 'pip' ? { canto: (CANTOS as readonly string[]).includes(String(x.canto)) ? (x.canto as CartaoDirigido['canto']) : ('inf-dir' as const) } : {}),
      tipo,
      intencao: String(x.intencao ?? x.motivo ?? x.ideia ?? '').slice(0, 300),
      conteudo: conteudo.slice(0, 800),
      gatilho,
      prioridade: Math.max(1, Math.min(3, Math.round(Number(x.prioridade) || 2))),
      acento: Math.max(0, Math.min(4, Math.round(Number(x.acento) || 0))),
    });
  }

  // Escolha: o essencial primeiro, respeitando o respiro e o teto.
  const teto = tetoDeCartoes(ctx.duracaoS);
  const limiteComGrafico = ctx.duracaoS * FRACAO_MAXIMA_COM_GRAFICO;
  const aceitos: CartaoDirigido[] = [];
  let comGrafico = 0;
  const ordem = [...candidatos].sort((a, b) => a.prioridade - b.prioridade || a.inicioS - b.inicioS);
  for (const c of ordem) {
    const motivo =
      aceitos.length >= teto
        ? `passaria do teto de ${teto} cartões para ${Math.round(ctx.duracaoS)} s`
        : aceitos.some((a) => c.inicioS < a.fimS + RESPIRO_S && c.fimS > a.inicioS - RESPIRO_S)
          ? 'colado em outro cartão (sem respiro)'
          : comGrafico + (c.fimS - c.inicioS) > limiteComGrafico
            ? 'o vídeo ficaria mais de metade do tempo coberto'
            : c.layout === 'tela_cheia' && aceitos.some((a) => a.layout === 'tela_cheia')
              ? 'já há uma tela cheia'
              : '';
    if (motivo) {
      descartados.push({ inicioS: c.inicioS, tipo: c.tipo, motivo });
      continue;
    }
    aceitos.push(c);
    comGrafico += c.fimS - c.inicioS;
  }
  return { aceitos: aceitos.sort((a, b) => a.inicioS - b.inicioS), descartados };
}

/**
 * Trechos com zoom que ficariam escondidos (ou recortados) sob uma
 * animação que cobre o rosto: o zoom sai deles.
 */
export function zoomsEscondidos(plano: EditPlanV1, cartoes: readonly Pick<CartaoDirigido, 'inicioS' | 'fimS' | 'layout'>[]): string[] {
  const cobrem = cartoes.filter((c) => c.layout === 'tela_cheia' || c.layout === 'pip');
  if (!cobrem.length) return [];
  return agendaDoPlano(plano)
    .trechos.filter((t) => t.clip.effect)
    .filter((t) => {
      const ini = t.inicioMs / 1000;
      const fim = ini + t.duracaoMs / 1000;
      const coberto = cobrem.reduce((s, c) => s + Math.max(0, Math.min(fim, c.fimS) - Math.max(ini, c.inicioS)), 0);
      return coberto >= 0.6 * (fim - ini);
    })
    .map((t) => t.clip.id);
}

/** O diagnóstico das animações (fica no projeto, o editor mostra). */
export interface RelatorioDasAnimacoes {
  em: string;
  estilo?: string;
  tom?: string;
  /** A resposta da direção veio cortada (só os cartões completos valeram). */
  cortada?: boolean;
  pedidos: number;
  aceitos: Array<{ inicioS: number; fimS: number; tipo: string; layout: string; gatilho: string }>;
  descartados: CartaoDescartado[];
  /** O resultado de cada cartão aceito, na escrita. */
  escrita: Array<{ inicioS: number; tipo: string; ok: boolean; detalhe?: string }>;
  zoomsTirados?: number;
  erro?: string;
}
