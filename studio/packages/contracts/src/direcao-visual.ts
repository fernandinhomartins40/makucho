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
import { tecnicaDeCena } from './tecnicas-de-cena';
import { temaLivre, type TemaDaAnimacao } from './tema-da-animacao';

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
  /** Direção livre: COMO a cena mostra a ideia (a encenação visual, em texto livre). */
  conceito?: string;
  /** Direção livre: a técnica e as batidas, com os instantes conferidos na fala. */
  plano?: PlanoDaCena;
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
  /** Direção livre: a ideia visual do vídeo e o design que a IA escreveu. */
  conceito?: string;
  design?: Record<string, unknown>;
}

/**
 * O design que a direção livre escreve para UM vídeo (o "frame.md" do
 * HyperFrames): vai no começo do pedido de toda cena, e é o que faz dez
 * cenas escritas em paralelo parecerem do mesmo vídeo.
 */
export interface DesignDoVideo {
  /** A ideia visual do vídeo, em uma frase. */
  conceito: string;
  tom?: string;
  /** Formas, texturas, motivos que se repetem, composição -- texto livre da IA. */
  linguagem: string;
  /** Energia, eases, durações, a assinatura do movimento -- texto livre da IA. */
  movimento: string;
  tema: TemaDaAnimacao;
}

/** O design do vídeo a partir da leitura da direção (sempre devolve um: o que faltar cai no padrão). */
export function designDoVideo(lida: Pick<LeituraDaDirecao, 'conceito' | 'tom' | 'design'>): DesignDoVideo {
  const d = lida.design ?? {};
  const texto = (v: unknown, teto: number) => (typeof v === 'string' ? v : v ? JSON.stringify(v) : '').slice(0, teto);
  // O design vem em campos (referência, motivo, fundo, fichas de movimento,
  // ritmo): cada um obriga a direção a ser específica. Aqui viram os dois
  // textos que a cena recebe.
  const fundo = Array.isArray(d.fundo) ? d.fundo.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 5) : [];
  const linguagem = [
    typeof d.referencia === 'string' && d.referencia.trim() ? `Referência: ${d.referencia.trim()}` : '',
    typeof d.motivo === 'string' && d.motivo.trim() ? `Motivo que atravessa o vídeo (aparece em TODA cena, transformado): ${d.motivo.trim()}` : '',
    fundo.length ? `Camada de fundo (as mesmas peças em toda cena, em movimento lento): ${fundo.join('; ')}` : '',
    texto(d.linguagem, 1200),
  ]
    .filter(Boolean)
    .join('\n');
  const m = d.movimento && typeof d.movimento === 'object' ? (d.movimento as Record<string, unknown>) : null;
  const num = (v: unknown, min: number, max: number) => (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : null);
  const fichas = m
    ? [
        typeof m.energia === 'string' ? `energia ${m.energia}` : '',
        typeof m.entrada === 'string' ? `entradas com ${m.entrada}` : '',
        typeof m.saida === 'string' ? `saídas com ${m.saida}` : '',
        num(m.duracaoBase, 0.1, 2) !== null ? `duração base ${num(m.duracaoBase, 0.1, 2)} s` : '',
        num(m.stagger, 0.01, 0.5) !== null ? `stagger ${num(m.stagger, 0.01, 0.5)} s` : '',
      ]
        .filter(Boolean)
        .join('; ')
    : '';
  const movimento = [
    fichas ? `Fichas: ${fichas}.` : '',
    m && typeof m.assinatura === 'string' ? `Assinatura: ${m.assinatura.trim()}` : '',
    !m ? texto(d.movimento, 1000) : '',
    typeof d.ritmo === 'string' && d.ritmo.trim() ? `Ritmo do vídeo: ${d.ritmo.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    conceito: texto(lida.conceito ?? d.conceito, 400),
    ...(lida.tom ? { tom: lida.tom.slice(0, 300) } : {}),
    linguagem: linguagem.slice(0, 1800),
    movimento: movimento.slice(0, 1200),
    tema: temaLivre(d),
  };
}

// ---------- O plano da cena (batidas ancoradas na fala) ----------

/** Um acontecimento da cena, preso a uma palavra da fala. */
export interface BatidaDaCena {
  /** Segundo DENTRO da cena em que a palavra é dita (null: a palavra não está na fala do trecho). */
  t: number | null;
  /** A palavra da fala que dispara a batida ("" = o começo da cena). */
  palavra: string;
  /** O que acontece: ELEMENTO + VERBO de movimento. */
  acao: string;
}

/** O plano de uma cena, como a direção o escreveu e o servidor conferiu. */
export interface PlanoDaCena {
  /** Chave de TECNICAS_DE_CENA ("livre" quando não é nenhuma). */
  tecnica: string;
  /** O papel no arco do vídeo: gancho, construcao, impacto, resolucao. */
  papel?: string;
  /** O elemento que domina o quadro. */
  foco?: string;
  /** As palavras que carregam o sentido (1 ou 2). */
  enfase: string[];
  batidas: BatidaDaCena[];
  /** Como a cena sai. */
  saida?: string;
}

/**
 * Prende cada batida ao instante REAL da palavra na fala. A direção diz
 * "quando ele fala 'oitenta', o número conta"; quem sabe o segundo exato é
 * a transcrição, não o modelo -- sincronia medida, não estimada.
 */
export function ancorarBatidas(brutas: unknown, palavras: readonly PalavraNoTempo[], inicioS: number, fimS: number): BatidaDaCena[] {
  if (!Array.isArray(brutas)) return [];
  const doTrecho = palavras.filter((p) => p.s >= inicioS - 0.4 && p.s < fimS);
  let cursor = 0;
  const saida: BatidaDaCena[] = [];
  for (const b of brutas.slice(0, 10)) {
    if (!b || typeof b !== 'object') continue;
    const x = b as Record<string, unknown>;
    const acao = String(x.acao ?? x.o_que ?? '').trim().slice(0, 180);
    if (!acao) continue;
    const palavra = String(x.palavra ?? x.na_palavra ?? '').trim().slice(0, 40);
    const alvo = semAcento(palavra).split(/[^a-z0-9]+/).filter(Boolean)[0];
    if (!alvo) {
      saida.push({ t: saida.length ? null : 0, palavra: '', acao });
      continue;
    }
    const achada = doTrecho.findIndex((p, i) => i >= cursor && semAcento(p.texto).replace(/[^a-z0-9]+/g, '') === alvo);
    if (achada < 0) {
      saida.push({ t: null, palavra, acao });
      continue;
    }
    cursor = achada + 1;
    saida.push({ t: Math.max(0, Math.round((doTrecho[achada]!.s - inicioS) * 100) / 100), palavra, acao });
  }
  return saida;
}

/** O plano em texto, para quem desenha a cena (e para quem a critica). */
export function textoDoPlano(p: PlanoDaCena): string {
  const linhas = [`Papel no vídeo: ${p.papel || 'construção'}.${p.foco ? ` Foco do quadro: ${p.foco}.` : ''}${p.enfase.length ? ` Palavras de ênfase: ${p.enfase.join(', ')}.` : ''}`];
  if (p.batidas.length) {
    linhas.push('BATIDAS (segundo DENTRO da cena, medido na fala pelo servidor -- use estes instantes na `tl`):');
    for (const b of p.batidas) linhas.push(`  ${b.t === null ? 'sem palavra na fala: encaixe entre as vizinhas' : `${b.t.toFixed(2)} s`}${b.palavra ? `  "${b.palavra}"` : '  (abertura)'}  ->  ${b.acao}`);
  }
  if (p.saida) linhas.push(`Saída: ${p.saida}`);
  return linhas.join('\n');
}

/** O design em texto, para o pedido de cada cena (e para a crítica). */
export function textoDoDesign(d: DesignDoVideo): string {
  const t = d.tema;
  return [
    `DESIGN DESTE VÍDEO (escrito pela direção; todas as cenas seguem):`,
    d.conceito ? `Conceito: ${d.conceito}` : '',
    d.tom ? `Tom: ${d.tom}` : '',
    `Cores (já nas variáveis de CSS): fundo ${t.fundo} var(--cor-fundo), texto ${t.texto} var(--cor-texto), apagado ${t.apagado} var(--cor-apagado), destaques ${t.destaque} var(--cor-destaque), ${t.destaque2} var(--cor-destaque-2), ${t.destaque3} var(--cor-destaque-3).`,
    `Fontes: título ${t.fonteTitulo} var(--fonte-titulo), texto ${t.fonteTexto} var(--fonte-texto).`,
    d.linguagem ? `Linguagem visual: ${d.linguagem}` : '',
    d.movimento ? `Movimento: ${d.movimento}` : '',
  ]
    .filter(Boolean)
    .join('\n');
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
      const lista = (Array.isArray(j.cartoes) ? j.cartoes : Array.isArray(j.cenas) ? j.cenas : Array.isArray(j.momentos) ? j.momentos : []) as Array<Record<string, unknown>>;
      return {
        ...(typeof j.estilo === 'string' ? { estilo: j.estilo } : {}),
        ...(typeof j.tom === 'string' ? { tom: j.tom } : {}),
        ...(typeof j.conceito === 'string' ? { conceito: j.conceito } : {}),
        ...(j.design && typeof j.design === 'object' ? { design: j.design as Record<string, unknown> } : {}),
        cartoes: lista.filter((x) => x && typeof x === 'object'),
        cortada: false,
      };
    } catch {
      // cai na leitura parcial
    }
  }
  const estilo = /"estilo"\s*:\s*"([^"]+)"/.exec(limpo)?.[1];
  const tom = /"tom"\s*:\s*"([^"]*)"/.exec(limpo)?.[1];
  const conceito = /"conceito"\s*:\s*"([^"]*)"/.exec(limpo)?.[1];
  const m = /"(?:cartoes|cenas|momentos)"\s*:\s*\[/.exec(limpo);
  if (!m) throw new Error('a resposta não trouxe o roteiro visual');
  // O design vem antes das cenas: mesmo cortada, a resposta o traz inteiro.
  const d = /"design"\s*:\s*\{/.exec(limpo);
  const design = d && d.index < m.index ? objetosCompletos(limpo, d.index + d[0].length - 1)[0] : undefined;
  return {
    ...(estilo ? { estilo } : {}),
    ...(tom ? { tom } : {}),
    ...(conceito ? { conceito } : {}),
    ...(design ? { design } : {}),
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

/** Os limites de ritmo que a conferência aplica (o que NÃO muda: âncora na fala, fidelidade, espaço reservado). */
export interface RegrasDaDirecao {
  teto: (duracaoS: number) => number;
  /** Fração máxima do vídeo com gráfico por cima. */
  fracaoComGrafico: number;
  /** No máximo uma cena em tela cheia. */
  umaTelaCheia: boolean;
  /** Duração máxima de uma cena (s). */
  duracaoMaximaS: number;
}

/** A direção por cartões (o estilo do catálogo): rosto em primeiro lugar. */
export const REGRAS_CLASSICAS: RegrasDaDirecao = { teto: tetoDeCartoes, fracaoComGrafico: FRACAO_MAXIMA_COM_GRAFICO, umaTelaCheia: true, duracaoMaximaS: 12 };

/**
 * A direção livre: a IA decide o ritmo. Ficam só os limites que protegem
 * o vídeo de virar uma apresentação de slides -- um quarto do tempo é do
 * rosto, e há um teto de cenas pelo custo de escrevê-las.
 */
export const REGRAS_LIVRES: RegrasDaDirecao = { teto: (s) => Math.max(2, Math.min(14, Math.floor(s / 5))), fracaoComGrafico: 0.75, umaTelaCheia: false, duracaoMaximaS: 16 };
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
  ctx: { duracaoS: number; palavras: readonly PalavraNoTempo[]; reservadas: readonly JanelaReservada[]; regras?: RegrasDaDirecao },
): { aceitos: CartaoDirigido[]; descartados: CartaoDescartado[] } {
  const regras = ctx.regras ?? REGRAS_CLASSICAS;
  const descartados: CartaoDescartado[] = [];
  const candidatos: CartaoDirigido[] = [];

  for (const x of brutos) {
    // Na direção livre o "tipo" é o nome que a IA deu à cena.
    const tipo = String(x.tipo ?? x.nome ?? '').slice(0, 40);
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
    fim = Math.min(ctx.duracaoS, Math.min(fim, inicio + regras.duracaoMaximaS));
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
    const gatilho = String(x.gatilho ?? x.ancora ?? '').slice(0, 200);
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
      ...(typeof x.conceito === 'string' && x.conceito.trim() ? { conceito: x.conceito.trim().slice(0, 700) } : {}),
      ...(x.tecnica || Array.isArray(x.batidas)
        ? {
            plano: {
              tecnica: tecnicaDeCena(String(x.tecnica ?? ''))?.chave ?? 'livre',
              ...(typeof x.papel === 'string' && x.papel.trim() ? { papel: x.papel.trim().slice(0, 30) } : {}),
              ...(typeof x.foco === 'string' && x.foco.trim() ? { foco: x.foco.trim().slice(0, 140) } : {}),
              enfase: (Array.isArray(x.enfase) ? x.enfase : []).filter((e): e is string => typeof e === 'string' && !!e.trim()).map((e) => e.trim().slice(0, 30)).slice(0, 3),
              batidas: ancorarBatidas(x.batidas, ctx.palavras, Math.round(inicio * 100) / 100, Math.round(fim * 100) / 100),
              ...(typeof x.saida === 'string' && x.saida.trim() ? { saida: x.saida.trim().slice(0, 140) } : {}),
            },
          }
        : {}),
    });
  }

  // Escolha: o essencial primeiro, respeitando o respiro e o teto.
  const teto = regras.teto(ctx.duracaoS);
  const limiteComGrafico = ctx.duracaoS * regras.fracaoComGrafico;
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
            ? regras.fracaoComGrafico === FRACAO_MAXIMA_COM_GRAFICO
              ? 'o vídeo ficaria mais de metade do tempo coberto'
              : `o vídeo ficaria mais de ${Math.round(regras.fracaoComGrafico * 100)}% do tempo coberto`
            : regras.umaTelaCheia && c.layout === 'tela_cheia' && aceitos.some((a) => a.layout === 'tela_cheia')
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

// ---------- A crítica (quem OLHA os quadros) ----------

/** Nota mínima para a cena entrar sem ser refeita. */
export const NOTA_MINIMA_DA_CENA = 7;

/** O que a crítica viu numa cena (a nota final e por quantas versões ela passou). */
export interface CriticaDaCena {
  /** 0 a 10. */
  nota: number;
  /** O que estava errado na versão que entrou (vazio = nada a apontar). */
  problemas: string[];
  /** Quantas vezes a cena foi refeita por causa da crítica. */
  refeita: number;
}

/**
 * Lê o parecer da crítica: {"nota": 0-10, "problemas": ["..."]}. Parecer
 * ilegível vale como "sem crítica" (null) -- nunca derruba a cena.
 */
export function lerCritica(texto: string): { nota: number; problemas: string[] } | null {
  const limpo = texto.replace(/```(?:json)?/g, '');
  const i = limpo.indexOf('{');
  const f = limpo.lastIndexOf('}');
  if (i < 0 || f <= i) return null;
  try {
    const j = JSON.parse(limpo.slice(i, f + 1)) as Record<string, unknown>;
    const nota = Number(j.nota);
    if (!Number.isFinite(nota)) return null;
    const problemas = (Array.isArray(j.problemas) ? j.problemas : [])
      .map((p) => (typeof p === 'string' ? p : p && typeof p === 'object' ? String((p as Record<string, unknown>).problema ?? JSON.stringify(p)) : ''))
      .map((p) => p.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 6);
    return { nota: Math.max(0, Math.min(10, Math.round(nota * 10) / 10)), problemas };
  } catch {
    return null;
  }
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
  escrita: Array<{ inicioS: number; tipo: string; ok: boolean; detalhe?: string; critica?: CriticaDaCena }>;
  /** Direção livre: o design que a IA escreveu para o vídeo (as cenas refeitas depois seguem o mesmo). */
  design?: DesignDoVideo;
  /** A análise do vídeo enviado, em uma linha (resumoDoPerfil). */
  analise?: string;
  zoomsTirados?: number;
  erro?: string;
}
