// ============================================================
// MAKUCHO STUDIO - A revisão final: o que um editor humano confere antes de
// entregar, no vídeo MONTADO.
//
// As outras conferências olham uma peça de cada vez (o HTML de uma animação,
// o fechamento do assunto). Aqui o vídeo é olhado inteiro, no tempo: a
// animação naquele trecho com a pessoa, a legenda, os outros textos, a
// trilha e os sons. Duas saídas por achado:
//
//   corrigir  -- é objetivo e tem conserto sem IA (aumentar a peça pequena,
//                tirar o cartão de cima do rosto, baixar a trilha, dar tempo
//                de leitura ao texto): `aplicarCorrecoes` faz;
//   conferir  -- pede julgamento (palavra que o whisper pode ter ouvido
//                errado, estilos misturados, duas animações ao mesmo
//                tempo): vai para a IA revisora, com o que foi medido.
//
// Tudo aqui é determinístico e sem token. Os números vêm de quem já mede:
// o worker (as peças da animação no instante de descanso, no Chrome), a
// máscara da pessoa (pessoa-no-quadro) e a transcrição (confiança de cada
// palavra). Sem medida, a regra que depende dela simplesmente não roda.
// ============================================================

import type { EditPlanV1 } from './edit-plan';
import type { ComposicaoHtml } from './animacao-html';
import type { PessoaNoQuadro } from './pessoa-no-quadro';
import type { Retangulo } from './grade-dos-layouts';
import { gradeDaComposicao, QUADRO_DA_GRADE } from './grade-dos-layouts';
import { ajusteDaComposicao, comAjuste, lerAjuste, type AjusteDaCena, type AjusteDaPeca } from './motion-presets';
import { agendaDoPlano } from './agenda';

// ---------- O que entra ----------

/** Uma peça da animação medida no Chrome (px no quadro 1080x1920). */
export interface PecaMedida {
  /** data-ed da peça ("cena" = a animação inteira). */
  chave: string;
  /** O campo de texto que ela mostra ('' = figura ou grupo). */
  campo: string;
  /** A peça que a contém (ou "cena"). */
  pai: string | null;
  r: Retangulo;
  /** Largura e altura de layout (sem escala, px): estreitar parte delas. */
  lw?: number;
  lh?: number;
  /** A caixa só do TEXTO dentro dela (as linhas, sem padding nem fundo); null = sem texto. */
  rt?: Retangulo | null;
  /** A altura da MENOR linha de texto dentro dela (px); null = sem texto. */
  letra: number | null;
  /** O texto que ela mostra (começo), para a mensagem. */
  texto: string;
}

/** As peças de uma animação no instante de descanso (JOB_DE_PECAS do worker). */
export interface MedidasDaRevisao {
  /** Segundo da animação em que foi medido (o descanso). */
  t: number;
  pecas: PecaMedida[];
}

/** O job do worker que mede as peças (mesma fila da conferência de layout). */
export const JOB_DE_PECAS = 'medir-pecas';

/** O job do worker que mede a loudness da fala e da trilha (o worker tem o ffmpeg e o storage). */
export const JOB_DE_AUDIO = 'medir-audio';

export interface JobDeAudio {
  projectId: string;
  /** Os trechos do vídeo, no tempo do ORIGINAL. */
  trechos: Array<{ id: string; inicioMs: number; fimMs: number }>;
  musicaAssetId?: string;
}

/** A loudness medida (LUFS integrados, EBU R128). `null` = sem medida (silêncio, arquivo ausente). */
export interface MedidasDoAudio {
  /** A fala do vídeo inteiro (a média em energia dos trechos). */
  voz: number | null;
  /** Cada trecho, pelo id do clipe. */
  trechos: Record<string, number | null>;
  /** A trilha, como o arquivo veio (antes do ganho do plano). */
  musica: number | null;
}

/** Uma palavra da fala, já no tempo da TIMELINE. */
export interface PalavraDaRevisao {
  id?: string;
  texto: string;
  inicioMs: number;
  fimMs: number;
  /** 0-1, do whisper. */
  confianca?: number;
}

/**
 * As palavras da transcrição (tempo do ORIGINAL) levadas para a timeline,
 * com o id (a âncora das correções da legenda) e a confiança do whisper.
 * Só as que caem dentro de um trecho, na posição dele.
 */
export function palavrasDaRevisao(
  plano: EditPlanV1,
  palavras: ReadonlyArray<{ id: string; word: string; startMs: number; endMs: number; confidence?: number | null }>,
  desligados: readonly string[] = [],
): PalavraDaRevisao[] {
  const agenda = agendaDoPlano(plano, [...desligados]);
  const lista: PalavraDaRevisao[] = [];
  for (const t of agenda.trechos) {
    for (const p of palavras) {
      if (p.startMs < t.clip.sourceStartMs || p.startMs >= t.clip.sourceEndMs) continue;
      lista.push({
        id: p.id,
        texto: p.word,
        inicioMs: Math.round(t.inicioMs + (p.startMs - t.clip.sourceStartMs) / t.velocidade),
        fimMs: Math.round(t.inicioMs + (Math.min(p.endMs, t.clip.sourceEndMs) - t.clip.sourceStartMs) / t.velocidade),
        ...(typeof p.confidence === 'number' ? { confianca: p.confidence } : {}),
      });
    }
  }
  return lista.sort((a, b) => a.inicioMs - b.inicioMs);
}

/**
 * O pedido da revisão da legenda: as palavras incertas, cada uma com a
 * frase em volta (o que a IA precisa para saber se "vuatsap" é "WhatsApp").
 */
export function pedidoDaRevisaoDaLegenda(palavras: readonly PalavraDaRevisao[], ids: readonly string[]): string {
  const linhas: string[] = [];
  for (const id of ids.slice(0, 40)) {
    const i = palavras.findIndex((p) => p.id === id);
    if (i < 0) continue;
    const antes = palavras.slice(Math.max(0, i - 8), i).map((p) => p.texto).join(' ');
    const depois = palavras.slice(i + 1, i + 9).map((p) => p.texto).join(' ');
    linhas.push(`- id ${id}: ...${antes} [[${palavras[i]!.texto}]] ${depois}...`);
  }
  return linhas.join('\n');
}

/** A resposta da IA da legenda: só correções de grafia (curtas, de uma palavra para poucas). */
export function lerRevisaoDaLegenda(texto: string, palavras: readonly PalavraDaRevisao[]): Array<{ wordId: string; text: string; original: string }> {
  const bruto = texto.match(/\{[\s\S]*\}/)?.[0];
  if (!bruto) return [];
  let j: unknown;
  try {
    j = JSON.parse(bruto);
  } catch {
    return [];
  }
  const lista = (j as { correcoes?: unknown }).correcoes;
  if (!Array.isArray(lista)) return [];
  const porId = new Map(palavras.filter((p) => p.id).map((p) => [p.id!, p]));
  const out: Array<{ wordId: string; text: string; original: string }> = [];
  for (const c of lista.slice(0, 40)) {
    const id = typeof c?.id === 'string' ? c.id : '';
    const novo = typeof c?.texto === 'string' ? c.texto.trim() : '';
    const p = porId.get(id);
    // Corrigir grafia, não reescrever a fala: no máximo 3 palavras e 40 letras.
    if (!p || !novo || novo.length > 40 || novo.split(/\s+/).length > 3 || novo === p.texto.trim()) continue;
    out.push({ wordId: id, text: novo, original: p.texto.slice(0, 80) });
  }
  return out;
}

export interface ContextoDaRevisao {
  palavras: readonly PalavraDaRevisao[];
  /** As peças de cada animação, pelo id da camada. */
  medidas?: Readonly<Record<string, MedidasDaRevisao | null>>;
  /** Onde está a pessoa no trecho de cada animação, pelo id da camada. */
  pessoa?: Readonly<Record<string, PessoaNoQuadro | null>>;
  /** A loudness medida da fala e da trilha. Sem ela, a trilha é julgada só pelo número do plano. */
  audio?: MedidasDoAudio | null;
}

// ---------- O que sai ----------

export type CategoriaDaRevisao = 'animacao' | 'legenda' | 'audio' | 'texto';

/** O conserto sem IA de um achado. Dados, não função: vai para o log e para a IA. */
export type CorrecaoDaRevisao =
  | { tipo: 'musica'; gainDb: number; duckUnderVoice: boolean }
  | { tipo: 'som'; soundEffectId: string; gainDb: number }
  /** Relativo ao que a peça tem na hora de aplicar: correções na mesma peça se somam. */
  | { tipo: 'ajuste'; camadaId: string; chave: string; dx?: number; dy?: number; fator?: number; w?: number }
  | { tipo: 'legenda'; wordsPerBlock: number }
  | { tipo: 'duracao'; overlayId: string; durationMs: number }
  | { tipo: 'tirar-efeito'; efeitoId: string }
  | { tipo: 'ganho-do-trecho'; clipId: string; gainDb: number | null };

export interface AchadoDaRevisao {
  /** Estável entre rodadas (categoria|tipo|alvo): a segunda revisão sabe o que já foi visto. */
  id: string;
  categoria: CategoriaDaRevisao;
  tipo: string;
  gravidade: 'corrigir' | 'conferir';
  inicioMs: number;
  fimMs: number;
  /** A camada, o texto, o som ou a palavra de que se trata. */
  alvo?: string;
  /** Em português, para a pessoa e para a IA: o que está errado e onde. */
  mensagem: string;
  correcao?: CorrecaoDaRevisao;
}

// ---------- Os números da casa ----------

/** A menor linha de texto legível no celular (px no quadro de 1080; ~14 px na tela de um iPhone). */
export const LETRA_MINIMA = 40;
/** O tamanho que a peça pequena ganha (a linha passa a ter isto). */
const LETRA_ALVO = 48;
/** Quanto a revisão aumenta uma peça, no máximo (mais que isso desmonta o desenho). */
const AUMENTO_MAXIMO = 1.8;
/** A trilha sob a fala: com o abaixar ligado, no máximo isto; sem ele, nunca é seguro. */
export const TRILHA_MAXIMA_COM_DUCKING_DB = -12;
const TRILHA_SEGURA_DB = -16;
/**
 * A trilha sob a fala, medida: quantos dB (LU) abaixo da voz ela fica enquanto alguém fala.
 * Menos de 14 cobre a voz; mais de 28 some. O alvo é 19 (o que as produtoras usam para
 * música de fundo sob locução), com o abaixar-na-fala ligado (12 dB a menos sob a voz).
 */
const TRILHA_ABAIXO_DA_VOZ = { min: 14, alvo: 19, max: 28, subindo: 24 };
const DUCKING_DB = 12;
/** Um trecho de fala mais alto ou mais baixo que o resto por mais que isto: iguala. */
const DIFERENCA_ENTRE_TRECHOS = 4;
/** Som por cima de uma palavra: acima disto atrapalha entender. */
const SOM_MAXIMO_NA_FALA_DB = -6;
const SOM_NA_FALA_DB = -12;
/** Legenda no vertical: mais palavras que isto por bloco viram 3 linhas e cobrem o rosto. */
const PALAVRAS_POR_BLOCO_MAX = 5;
const PALAVRAS_POR_BLOCO_ALVO = 4;
/**
 * O whisper com menos certeza que isto: a palavra vale uma conferência. Só
 * palavras de 4 letras ou mais: as curtas e comuns ("não", "por", "vai")
 * vêm com pouca certeza e certas; o erro que importa (marca, nome, termo)
 * é de palavra longa. Medido num vídeo real: 0,6 e 3 letras mandavam seis
 * palavras certas para a IA.
 */
export const CONFIANCA_SUSPEITA = 0.55;
const LETRAS_DA_PALAVRA_SUSPEITA = 4;
/** Ler um texto de tela: meio segundo para achar e um quarto de segundo por palavra. */
const leitura = (texto: string) => Math.min(4500, 600 + 260 * texto.trim().split(/\s+/).filter(Boolean).length);
/** Animação mais curta que isto não dá tempo de ver. */
const ANIMACAO_MINIMA_MS = 1400;
/** O rosto: a área da cabeça que a animação pode cobrir sem incomodar. */
const ROSTO_COBERTO_MAXIMO = 0.15;
/** A informação ocupa menos que isto da área útil (na dimensão que mais ocupa): sobra vazio. */
const OCUPACAO_MINIMA = 0.62;
/** Quanto ela passa a ocupar quando a revisão aumenta a cena. */
const OCUPACAO_ALVO = 0.86;
const AUMENTO_DA_CENA_MAXIMO = 1.6;
/** O texto principal ocupa menos que isto da largura do conjunto (o cartão): sobra vazio dentro dele. */
const OCUPACAO_DO_CONJUNTO = 0.6;
const AUMENTO_DO_TEXTO_NO_CONJUNTO = 1.5;
/** Onde o conteúdo pode começar no alto (o cabeçalho do app e o logo ficam acima). */
const GRADE_TOPO = 200;
/** A folga entre o cartão e o rosto quando a revisão o tira de cima. */
const FOLGA_DO_ROSTO = 36;

const { w: W, h: H } = QUADRO_DA_GRADE;
const area = (r: Retangulo) => Math.max(0, r.w) * Math.max(0, r.h);
function intersecao(a: Retangulo, b: Retangulo): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
const curto = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const seg = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const pct = (db: number) => `${Math.round(10 ** (db / 20) * 100)}%`;
const falaEm = (palavras: readonly PalavraDaRevisao[], inicioMs: number, fimMs: number) => palavras.some((p) => p.fimMs > inicioMs && p.inicioMs < fimMs);

/** A cabeça como retângulo (px do quadro). */
export function retanguloDaCabeca(p: PessoaNoQuadro): Retangulo {
  return { x: p.cabeca.x - p.cabeca.largura / 2, y: p.cabeca.topo, w: p.cabeca.largura, h: p.cabeca.base - p.cabeca.topo };
}

// ============================================================
// As regras
// ============================================================

/** Os achados da revisão do vídeo inteiro, do mais grave ao mais leve, em ordem de tempo. */
export function revisarVideo(plano: EditPlanV1, ctx: ContextoDaRevisao): AchadoDaRevisao[] {
  const achados = [...revisarAudio(plano, ctx), ...revisarLegenda(plano, ctx), ...revisarTextos(plano), ...revisarAnimacoes(plano, ctx)];
  const vistos = new Set<string>();
  return achados
    .filter((a) => (vistos.has(a.id) ? false : (vistos.add(a.id), true)))
    .sort((a, b) => (a.gravidade === b.gravidade ? a.inicioMs - b.inicioMs : a.gravidade === 'corrigir' ? -1 : 1));
}

// ---------- Áudio ----------

function revisarAudio(plano: EditPlanV1, ctx: ContextoDaRevisao): AchadoDaRevisao[] {
  const out: AchadoDaRevisao[] = [];
  const temFala = ctx.palavras.length > 0;
  const m = plano.music;
  const a = ctx.audio;
  if (m && temFala && a?.voz != null && a.musica != null) {
    // Com a medida: o que se ouve de verdade é a loudness do arquivo mais o ganho do plano.
    const sobAVoz = a.musica + m.gainDb - (m.duckUnderVoice ? DUCKING_DB : 0);
    const abaixo = a.voz - sobAVoz;
    if (abaixo < TRILHA_ABAIXO_DA_VOZ.min || abaixo > TRILHA_ABAIXO_DA_VOZ.max) {
      // Inaudível costuma ser escolha (a pessoa abaixou): sobe só até 24 dB abaixo da voz.
      const alvoAbaixo = abaixo < TRILHA_ABAIXO_DA_VOZ.min ? TRILHA_ABAIXO_DA_VOZ.alvo : TRILHA_ABAIXO_DA_VOZ.subindo;
      const gainDb = Math.round(Math.max(-40, Math.min(0, a.voz - alvoAbaixo - a.musica + DUCKING_DB)) * 2) / 2;
      out.push({
        id: 'audio|trilha-medida',
        categoria: 'audio',
        tipo: abaixo < TRILHA_ABAIXO_DA_VOZ.min ? 'trilha-alta' : 'trilha-baixa',
        gravidade: 'corrigir',
        inicioMs: m.timelineStartMs ?? 0,
        fimMs: (m.timelineStartMs ?? 0) + (m.durationMs ?? 0),
        mensagem:
          abaixo < TRILHA_ABAIXO_DA_VOZ.min
            ? `A trilha ficava só ${Math.max(0, Math.round(abaixo))} dB abaixo da voz enquanto alguém fala e cobria a fala. Ajustei para ficar ${TRILHA_ABAIXO_DA_VOZ.alvo} dB abaixo, abaixando sozinha na fala.`
            : `A trilha ficava ${Math.round(abaixo)} dB abaixo da voz: quase não se ouvia. Subi para ${TRILHA_ABAIXO_DA_VOZ.subindo} dB abaixo da fala, abaixando sozinha quando alguém fala.`,
        correcao: { tipo: 'musica', gainDb, duckUnderVoice: true },
      });
    }
  } else if (m && temFala) {
    const alta = m.duckUnderVoice ? m.gainDb > TRILHA_MAXIMA_COM_DUCKING_DB : m.gainDb > TRILHA_SEGURA_DB;
    if (alta) {
      const alvo = m.duckUnderVoice ? Math.min(m.gainDb, -14) : Math.min(m.gainDb, TRILHA_SEGURA_DB);
      out.push({
        id: 'audio|trilha-alta',
        categoria: 'audio',
        tipo: 'trilha-alta',
        gravidade: 'corrigir',
        inicioMs: m.timelineStartMs ?? 0,
        fimMs: (m.timelineStartMs ?? 0) + (m.durationMs ?? 0),
        mensagem: `A trilha está em ${pct(m.gainDb)}${m.duckUnderVoice ? '' : ', sem abaixar na fala'}: cobre a voz. Fica em ${pct(alvo)}, abaixando enquanto alguém fala.`,
        correcao: { tipo: 'musica', gainDb: alvo, duckUnderVoice: true },
      });
    }
  }
  // A fala com volumes diferentes entre os trechos (um gravado mais longe do celular, outro
  // mais perto): o trecho que destoa da mediana ganha ou perde ganho até ficar igual.
  if (a && temFala) {
    const medidos = plano.clips.filter((c) => !c.audio?.muted && typeof a.trechos[c.id] === 'number');
    const valores = medidos.map((c) => a.trechos[c.id]!).sort((x, y) => x - y);
    if (valores.length >= 3) {
      const mediana = valores[Math.floor(valores.length / 2)]!;
      for (const c of medidos) {
        const l = a.trechos[c.id]!;
        const diferenca = mediana - l;
        if (Math.abs(diferenca) <= DIFERENCA_ENTRE_TRECHOS) continue;
        const alvo = Math.round(Math.max(-30, Math.min(12, diferenca)) * 2) / 2;
        if (Math.abs(alvo - (c.audio?.gainDb ?? 0)) < 2) continue;
        out.push({
          id: `audio|trecho-desigual|${c.id}`,
          categoria: 'audio',
          tipo: 'trecho-desigual',
          gravidade: 'corrigir',
          inicioMs: c.timelineStartMs,
          fimMs: c.timelineStartMs + (c.sourceEndMs - c.sourceStartMs),
          alvo: c.id,
          mensagem: `A fala aos ${seg(c.timelineStartMs)} estava ${Math.round(Math.abs(diferenca))} dB ${diferenca > 0 ? 'mais baixa' : 'mais alta'} que o resto do vídeo: igualei.`,
          correcao: { tipo: 'ganho-do-trecho', clipId: c.id, gainDb: alvo === 0 ? null : alvo },
        });
      }
    }
  }

  // O contorno de luz em volta da pessoa (a borda laranja): recusado nos vídeos, sai sempre.
  for (const e of plano.screenEffects ?? []) {
    if (e.type !== 'contorno_luz') continue;
    out.push({
      id: `efeito|contorno|${e.id}`,
      categoria: 'animacao',
      tipo: 'contorno-na-pessoa',
      gravidade: 'corrigir',
      inicioMs: e.timelineStartMs,
      fimMs: e.timelineStartMs + e.durationMs,
      alvo: e.id,
      mensagem: `Tirei o contorno de luz em volta da pessoa aos ${seg(e.timelineStartMs)}.`,
      correcao: { tipo: 'tirar-efeito', efeitoId: e.id },
    });
  }
  for (const s of plano.soundEffects ?? []) {
    if (s.gainDb <= SOM_MAXIMO_NA_FALA_DB) continue;
    // O ataque do som (o pedaço alto) é o primeiro quarto de segundo.
    if (!falaEm(ctx.palavras, s.timelineStartMs, s.timelineStartMs + 250)) continue;
    out.push({
      id: `audio|som-na-fala|${s.id}`,
      categoria: 'audio',
      tipo: 'som-na-fala',
      gravidade: 'corrigir',
      inicioMs: s.timelineStartMs,
      fimMs: s.timelineStartMs + (s.durationMs ?? 600),
      alvo: s.id,
      mensagem: `Um efeito sonoro alto aos ${seg(s.timelineStartMs)} cai em cima de uma palavra: abaixado para não atrapalhar a fala.`,
      correcao: { tipo: 'som', soundEffectId: s.id, gainDb: SOM_NA_FALA_DB },
    });
  }
  return out;
}

// ---------- Legenda ----------

function revisarLegenda(plano: EditPlanV1, ctx: ContextoDaRevisao): AchadoDaRevisao[] {
  const out: AchadoDaRevisao[] = [];
  const c = plano.captions;
  if (!c.enabled || !ctx.palavras.length) return out;
  if (plano.canvas.aspectRatio === '9:16' && c.wordsPerBlock > PALAVRAS_POR_BLOCO_MAX) {
    out.push({
      id: 'legenda|bloco-longo',
      categoria: 'legenda',
      tipo: 'bloco-longo',
      gravidade: 'corrigir',
      inicioMs: 0,
      fimMs: 0,
      mensagem: `A legenda mostra ${c.wordsPerBlock} palavras por vez: no vertical vira três linhas e sobe para o rosto. Passa a mostrar ${PALAVRAS_POR_BLOCO_ALVO}.`,
      correcao: { tipo: 'legenda', wordsPerBlock: PALAVRAS_POR_BLOCO_ALVO },
    });
  }
  const corrigidas = new Set(c.corrections.map((x) => x.wordId));
  const ocultas = new Set(c.hiddenWordIds ?? []);
  const visiveis = ctx.palavras.filter((p) => !p.id || (!corrigidas.has(p.id) && !ocultas.has(p.id)));
  // Palavra que o whisper não teve certeza: a IA revisora olha com a frase em volta.
  for (const p of visiveis) {
    if (!p.id || p.confianca === undefined || p.confianca >= CONFIANCA_SUSPEITA) continue;
    if (p.texto.replace(/[^\p{L}\p{N}]/gu, '').length < LETRAS_DA_PALAVRA_SUSPEITA) continue;
    out.push({
      id: `legenda|palavra-incerta|${p.id}`,
      categoria: 'legenda',
      tipo: 'palavra-incerta',
      gravidade: 'conferir',
      inicioMs: p.inicioMs,
      fimMs: p.fimMs,
      alvo: p.id,
      mensagem: `"${p.texto}" aos ${seg(p.inicioMs)}: a transcrição teve pouca certeza (${Math.round(p.confianca * 100)}%).`,
    });
  }
  // A mesma palavra duas vezes seguidas ("que que"): gagueira que a legenda repete.
  for (let i = 1; i < visiveis.length; i += 1) {
    const a = visiveis[i - 1]!;
    const b = visiveis[i]!;
    const limpa = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (b.id && limpa(a.texto).length > 1 && limpa(a.texto) === limpa(b.texto) && b.inicioMs - a.fimMs < 400) {
      out.push({
        id: `legenda|repetida|${b.id}`,
        categoria: 'legenda',
        tipo: 'repetida',
        gravidade: 'conferir',
        inicioMs: a.inicioMs,
        fimMs: b.fimMs,
        alvo: b.id,
        mensagem: `"${a.texto} ${b.texto}" aos ${seg(a.inicioMs)}: a palavra repetida (gagueira) aparece duas vezes na legenda.`,
      });
    }
  }
  return out;
}

// ---------- Textos de tela ----------

const TEXTOS_COM_LEITURA = new Set(['HookTitle', 'LowerThird', 'CTA', 'QuoteCard', 'StatCard', 'Destaque']);

function revisarTextos(plano: EditPlanV1): AchadoDaRevisao[] {
  const out: AchadoDaRevisao[] = [];
  for (const o of plano.overlays) {
    if (!TEXTOS_COM_LEITURA.has(o.component) || !o.text?.trim()) continue;
    const minimo = leitura(o.text);
    if (o.durationMs >= minimo - 50) continue;
    out.push({
      id: `texto|rapido|${o.id}`,
      categoria: 'texto',
      tipo: 'rapido',
      gravidade: 'corrigir',
      inicioMs: o.timelineStartMs,
      fimMs: o.timelineStartMs + o.durationMs,
      alvo: o.id,
      mensagem: `O texto "${curto(o.text)}" fica ${seg(o.durationMs)} na tela: não dá tempo de ler. Passa a ficar ${seg(minimo)}.`,
      correcao: { tipo: 'duracao', overlayId: o.id, durationMs: minimo },
    });
  }
  return out;
}

// ---------- Animações ----------

function revisarAnimacoes(plano: EditPlanV1, ctx: ContextoDaRevisao): AchadoDaRevisao[] {
  const out: AchadoDaRevisao[] = [];
  const animacoes = (plano.mediaLayers ?? []).filter((m) => m.kind === 'html' && m.composicao).sort((a, b) => a.timelineStartMs - b.timelineStartMs);

  // O mesmo vídeo, a mesma linguagem: estilos de catálogo diferentes entre as animações.
  const estilos = new Map<string, number>();
  for (const a of animacoes) {
    const e = a.composicao!.estilo;
    if (e) estilos.set(e, (estilos.get(e) ?? 0) + 1);
  }
  if (estilos.size > 1) {
    const [principal] = [...estilos].sort((a, b) => b[1] - a[1])[0]!;
    const fora = animacoes.filter((a) => a.composicao!.estilo && a.composicao!.estilo !== principal);
    out.push({
      id: 'animacao|estilos-misturados',
      categoria: 'animacao',
      tipo: 'estilos-misturados',
      gravidade: 'conferir',
      inicioMs: fora[0]?.timelineStartMs ?? 0,
      fimMs: (fora[0]?.timelineStartMs ?? 0) + (fora[0]?.durationMs ?? 0),
      mensagem: `As animações usam ${estilos.size} estilos visuais (${[...estilos.keys()].join(', ')}): ${fora.length} fogem do estilo do vídeo (${principal}), aos ${fora.map((a) => seg(a.timelineStartMs)).join(', ')}.`,
    });
  }

  for (let i = 0; i < animacoes.length; i += 1) {
    const a = animacoes[i]!;
    const c = a.composicao!;
    const fimA = a.timelineStartMs + a.durationMs;
    if (a.durationMs < ANIMACAO_MINIMA_MS) {
      out.push({
        id: `animacao|curta|${a.id}`,
        categoria: 'animacao',
        tipo: 'curta',
        gravidade: 'conferir',
        inicioMs: a.timelineStartMs,
        fimMs: fimA,
        alvo: a.id,
        mensagem: `A animação "${curto(c.titulo ?? 'sem título')}" aos ${seg(a.timelineStartMs)} dura ${seg(a.durationMs)}: some antes de dar para ver.`,
      });
    }
    const proxima = animacoes[i + 1];
    if (proxima && proxima.timelineStartMs < fimA - 200) {
      out.push({
        id: `animacao|ao-mesmo-tempo|${a.id}|${proxima.id}`,
        categoria: 'animacao',
        tipo: 'ao-mesmo-tempo',
        gravidade: 'conferir',
        inicioMs: proxima.timelineStartMs,
        fimMs: Math.min(fimA, proxima.timelineStartMs + proxima.durationMs),
        alvo: proxima.id,
        mensagem: `Duas animações ao mesmo tempo aos ${seg(proxima.timelineStartMs)} ("${curto(c.titulo ?? '')}" e "${curto(proxima.composicao!.titulo ?? '')}"): uma cobre a outra.`,
      });
    }
    const medidas = ctx.medidas?.[a.id];
    if (medidas) out.push(...revisarPecas(a.id, a.timelineStartMs, fimA, c, medidas, ctx.pessoa?.[a.id] ?? null));
  }
  return out;
}

/** As peças medidas de uma animação: pequenas, sobre o rosto, fora do quadro, umas sobre as outras. */
function revisarPecas(camadaId: string, inicioMs: number, fimMs: number, c: ComposicaoHtml, m: MedidasDaRevisao, pessoa: PessoaNoQuadro | null): AchadoDaRevisao[] {
  const out: AchadoDaRevisao[] = [];
  const titulo = curto(c.titulo ?? 'animação');
  const quando = `aos ${seg(inicioMs + m.t * 1000)}`;
  const ajuste = ajusteDaComposicao(c);
  const ajusteDaPeca = (chave: string): AjusteDaPeca => (chave === 'cena' ? { x: ajuste?.x ?? 0, y: ajuste?.y ?? 0, escala: ajuste?.escala ?? 1 } : (ajuste?.elementos?.[chave] ?? { x: 0, y: 0, escala: 1 }));
  const pecas = m.pecas.filter((p) => area(p.r) > 40);
  const cena = pecas.find((p) => p.chave === 'cena');
  const textos = pecas.filter((p) => p.chave !== 'cena' && p.letra !== null && p.texto.trim());

  // 1. Pequena demais para o celular: a peça de texto ganha escala (no máximo 1,8x).
  // Só a de texto mais funda (a folha): aumentar o grupo e a folha juntos dobraria.
  const folhas = textos.filter((p) => !textos.some((q) => q.pai === p.chave));
  for (const p of folhas) {
    if (p.letra! >= LETRA_MINIMA) continue;
    const atual = ajusteDaPeca(p.chave);
    const fator = Math.min(AUMENTO_MAXIMO, LETRA_ALVO / Math.max(8, p.letra!));
    const escala = Math.round(Math.min(4, atual.escala * fator) * 100) / 100;
    if (escala <= atual.escala + 0.04) continue;
    out.push({
      id: `animacao|pequena|${camadaId}|${p.chave}`,
      categoria: 'animacao',
      tipo: 'pequena',
      gravidade: 'corrigir',
      inicioMs,
      fimMs,
      alvo: camadaId,
      mensagem: `Em "${titulo}" ${quando}, o texto "${curto(p.texto)}" tem ${Math.round(p.letra!)} px de altura: ilegível no celular. Aumentado ${Math.round((escala / atual.escala - 1) * 100)}%.`,
      correcao: { tipo: 'ajuste', camadaId, chave: p.chave, fator: escala / atual.escala },
    });
  }

  // 2. Sobre o rosto: só onde o vídeo aparece por trás (cartão em cima do vídeo).
  let mexeuNaCena = false;
  if (pessoa && c.layout === 'cartao') {
    const rosto = retanguloDaCabeca(pessoa);
    const caixa = cena?.r ?? juntar(pecas.map((p) => p.r));
    if (caixa && intersecao(caixa, rosto) > ROSTO_COBERTO_MAXIMO * area(rosto)) {
      const grade = gradeDaComposicao(c);
      const atual = ajusteDaPeca('cena');
      // Os dois espaços livres: entre o cabeçalho do app e a testa, e entre o queixo e a legenda.
      const cima = { de: GRADE_TOPO, ate: rosto.y - FOLGA_DO_ROSTO };
      const baixo = { de: rosto.y + rosto.h + FOLGA_DO_ROSTO, ate: Math.min(H - 300, grade.legenda.y - 12) };
      // Cabe inteiro embaixo (o preferido: o olhar desce do rosto para o cartão), senão em cima;
      // senão diminui o cartão (até 70%) para caber no maior dos dois. A escala é em volta do centro.
      const lugar = [baixo, cima].find((v) => v.ate - v.de >= caixa.h) ?? [baixo, cima].sort((a, b) => b.ate - b.de - (a.ate - a.de))[0]!;
      const fator = Math.min(1, (lugar.ate - lugar.de) / caixa.h);
      const cabe = fator >= 0.7;
      const novaAltura = caixa.h * fator;
      const centroAlvo = (lugar === baixo ? lugar.de : lugar.ate - novaAltura) + novaAltura / 2;
      const dy = centroAlvo - (caixa.y + caixa.h / 2);
      const escala = Math.round(atual.escala * fator * 100) / 100;
      mexeuNaCena = true;
      out.push({
        id: `animacao|rosto|${camadaId}`,
        categoria: 'animacao',
        tipo: 'rosto',
        gravidade: cabe ? 'corrigir' : 'conferir',
        inicioMs,
        fimMs,
        alvo: camadaId,
        mensagem: !cabe
          ? `"${titulo}" ${quando} cobre o rosto de quem fala, e não há espaço livre acima nem abaixo dele para o cartão (rosto em y ${Math.round(rosto.y)}-${Math.round(rosto.y + rosto.h)}, cartão com ${Math.round(caixa.h)} px de altura).`
          : `"${titulo}" ${quando} cobria o rosto de quem fala: o cartão foi para ${lugar === baixo ? 'baixo do queixo' : 'cima da cabeça'}${fator < 1 ? `, ${Math.round((1 - fator) * 100)}% menor para caber` : ''}.`,
        ...(cabe ? { correcao: { tipo: 'ajuste' as const, camadaId, chave: 'cena', dy: Math.round(dy), fator: escala / atual.escala } } : {}),
      });
    }
  }

  // 5. Espaço vazio: a informação ocupa pouco da área que a animação tem. Um editor
  // aumentaria a cena inteira (mantendo o desenho) até a informação tomar o espaço.
  const grade = gradeDaComposicao(c);
  const folhasVisiveis = pecas.filter((p) => p.chave !== 'cena' && !pecas.some((q) => q.pai === p.chave));
  const conteudo = juntar(folhasVisiveis.map((p) => (p.letra !== null ? (p.rt ?? p.r) : p.r)));
  const util = grade.util;
  if (!mexeuNaCena && cena && conteudo && c.layout !== 'pip' && textos.length) {
    const ocupa = Math.max(conteudo.w / util.w, conteudo.h / util.h);
    if (ocupa < OCUPACAO_MINIMA) {
      const atual = ajusteDaPeca('cena');
      const fator = Math.min(AUMENTO_DA_CENA_MAXIMO, OCUPACAO_ALVO / Math.max(0.05, ocupa));
      // A cena escala em volta do centro dela; depois o conteúdo vai para o centro da área útil.
      const gx = cena.r.x + cena.r.w / 2;
      const gy = cena.r.y + cena.r.h / 2;
      const cx = gx + (conteudo.x + conteudo.w / 2 - gx) * fator;
      const cy = gy + (conteudo.y + conteudo.h / 2 - gy) * fator;
      const dx = util.x + util.w / 2 - cx;
      const dy = util.y + util.h / 2 - cy;
      if (fator >= 1.12) {
        mexeuNaCena = true;
        out.push({
          id: `animacao|vazia|${camadaId}`,
          categoria: 'animacao',
          tipo: 'vazia',
          gravidade: 'corrigir',
          inicioMs,
          fimMs,
          alvo: camadaId,
          mensagem: `"${titulo}" ${quando} usava só ${Math.round(ocupa * 100)}% do espaço que tem: a informação ficou ${Math.round((fator - 1) * 100)}% maior e centralizada.`,
          correcao: { tipo: 'ajuste', camadaId, chave: 'cena', dx: Math.round(dx), dy: Math.round(dy), fator: Math.round(Math.min(4, atual.escala * fator) * 100) / 100 / atual.escala },
        });
      }
    }
  }

  // 6. Dentro do conjunto (o cartão, a caixa): o texto principal pequeno num conjunto largo
  // deixa um vazio no meio do cartão. Ele cresce para o espaço livre, sem passar dos vizinhos.
  for (const g of pecas) {
    if (g.chave === 'cena') continue;
    const filhos = pecas.filter((p) => p.pai === g.chave);
    if (filhos.length < 2) continue;
    const textosDoConjunto = filhos.filter((p) => p.letra !== null && p.texto.trim() && !pecas.some((q) => q.pai === p.chave));
    const principal = [...textosDoConjunto].sort((a, b) => b.letra! - a.letra!)[0];
    if (!principal) continue;
    const rp = principal.rt ?? principal.r;
    const larguraUtil = g.r.w * 0.9;
    if (rp.w / larguraUtil >= OCUPACAO_DO_CONJUNTO) continue;
    // O espaço livre em cima e embaixo do principal, até o vizinho mais próximo (ou a borda do conjunto).
    const outros = filhos.filter((p) => p !== principal).map((p) => (p.letra !== null ? (p.rt ?? p.r) : p.r));
    const sobreposHorizontal = (r: Retangulo) => r.x < rp.x + rp.w && r.x + r.w > rp.x;
    const acima = Math.max(g.r.y + g.r.h * 0.04, ...outros.filter((r) => sobreposHorizontal(r) && r.y + r.h <= rp.y + 2).map((r) => r.y + r.h + 10));
    const abaixo = Math.min(g.r.y + g.r.h * 0.96, ...outros.filter((r) => sobreposHorizontal(r) && r.y >= rp.y + rp.h - 2).map((r) => r.y - 10));
    const fatorVertical = (abaixo - acima) / rp.h;
    const fator = Math.min(AUMENTO_DO_TEXTO_NO_CONJUNTO, (larguraUtil * 0.92) / rp.w, fatorVertical);
    if (fator < 1.12) continue;
    // Cresce em volta do centro: corrige para não passar das bordas do conjunto nem dos vizinhos.
    const nw = rp.w * fator;
    const nh = rp.h * fator;
    const ncx = rp.x + rp.w / 2;
    const ncy = rp.y + rp.h / 2;
    const esq = g.r.x + g.r.w * 0.05;
    const dir = g.r.x + g.r.w * 0.95;
    const dx = ncx - nw / 2 < esq ? esq - (ncx - nw / 2) : ncx + nw / 2 > dir ? dir - (ncx + nw / 2) : 0;
    const dy = ncy - nh / 2 < acima ? acima - (ncy - nh / 2) : ncy + nh / 2 > abaixo ? abaixo - (ncy + nh / 2) : 0;
    out.push({
      id: `animacao|conjunto|${camadaId}|${principal.chave}`,
      categoria: 'animacao',
      tipo: 'conjunto',
      gravidade: 'corrigir',
      inicioMs,
      fimMs,
      alvo: camadaId,
      mensagem: `Em "${titulo}" ${quando}, "${curto(principal.texto)}" ocupava ${Math.round((rp.w / larguraUtil) * 100)}% da largura do conjunto: ficou ${Math.round((fator - 1) * 100)}% maior, no espaço que sobrava.`,
      correcao: { tipo: 'ajuste', camadaId, chave: principal.chave, dx: Math.round(dx), dy: Math.round(dy), fator: Math.round(fator * 100) / 100 },
    });
  }

  // 3. Fora do quadro: texto cortado na borda.
  for (const p of textos) {
    const r = p.rt ?? p.r;
    const fora = r.x < -4 || r.y < -4 || r.x + r.w > W + 4 || r.y + r.h > H + 4;
    if (!fora) continue;
    out.push({
      id: `animacao|fora|${camadaId}|${p.chave}`,
      categoria: 'animacao',
      tipo: 'fora',
      gravidade: 'conferir',
      inicioMs,
      fimMs,
      alvo: camadaId,
      mensagem: `Em "${titulo}" ${quando}, o texto "${curto(p.texto)}" sai do quadro (x ${Math.round(r.x)}-${Math.round(r.x + r.w)}, y ${Math.round(r.y)}-${Math.round(r.y + r.h)}): fica cortado.`,
    });
  }

  // 4. Texto sobre texto (sem ser um dentro do outro).
  for (let i = 0; i < folhas.length; i += 1) {
    for (let j = i + 1; j < folhas.length; j += 1) {
      const a = folhas[i]!;
      const b = folhas[j]!;
      // A caixa do texto (a do elemento inclui fundo e padding; num selo girado, bem mais).
      const ra = a.rt ?? a.r;
      const rb = b.rt ?? b.r;
      if (intersecao(ra, rb) <= 0.25 * Math.min(area(ra), area(rb))) continue;
      // Afasta a secundária (a de letra menor) para cima ou para baixo, pelo lado em que já está.
      const [movel, fixa, rm, rf] = (a.letra ?? 0) <= (b.letra ?? 0) ? [a, b, ra, rb] : [b, a, rb, ra];
      const desce = rm.y + rm.h / 2 >= rf.y + rf.h / 2;
      const dy = desce ? rf.y + rf.h + 14 - rm.y : rf.y - 14 - (rm.y + rm.h);
      out.push({
        id: `animacao|sobreposta|${camadaId}|${a.chave}|${b.chave}`,
        categoria: 'animacao',
        tipo: 'sobreposta',
        gravidade: 'corrigir',
        correcao: { tipo: 'ajuste', camadaId, chave: movel.chave, dy: Math.round(dy) },
        inicioMs,
        fimMs,
        alvo: camadaId,
        mensagem: `Em "${titulo}" ${quando}, o texto "${curto(movel.texto)}" ficava em cima de "${curto(fixa.texto)}": foi para ${desce ? 'baixo' : 'cima'} dele.`,
      });
    }
  }
  return out;
}

/**
 * Os defeitos medidos de uma animação (sobreposição, texto fora do quadro, rosto
 * coberto, texto ilegível) e quanto a informação ocupa da área, para comparar antes
 * e depois de uma correção: o serviço mede de novo e desfaz o que piorou.
 */
export function defeitosDaAnimacao(c: ComposicaoHtml, m: MedidasDaRevisao, pessoa: PessoaNoQuadro | null): { graves: number; pequenas: number; ocupacao: number } {
  const achados = revisarPecas('x', 0, 0, c, m, pessoa);
  const pecas = m.pecas.filter((p) => area(p.r) > 40);
  const folhas = pecas.filter((p) => p.chave !== 'cena' && !pecas.some((q) => q.pai === p.chave));
  const conteudo = juntar(folhas.map((p) => (p.letra !== null ? (p.rt ?? p.r) : p.r)));
  const util = gradeDaComposicao(c).util;
  return {
    graves: achados.filter((a) => a.tipo === 'sobreposta' || a.tipo === 'fora' || a.tipo === 'rosto').length,
    pequenas: achados.filter((a) => a.tipo === 'pequena').length,
    ocupacao: conteudo ? Math.max(conteudo.w / util.w, conteudo.h / util.h) : 0,
  };
}

// ============================================================
// A composição: a nota de uma animação medida e as versões candidatas
// ============================================================
//
// Corrigir peça por peça (aumentar um texto, afastar outro) pode piorar o
// conjunto: o texto aumentado passa por cima do ícone ou vaza do cartão. Um
// editor tenta, olha e fica com o que ficou melhor. Aqui é igual: a revisão
// gera algumas versões candidatas da animação (as correções pontuais; a cena
// inteira maior; o bloco mais estreito, para o texto quebrar em mais linhas,
// e maior), o serviço mede cada uma no Chrome e fica a de maior nota -- só se
// for melhor que a original.

/**
 * Uma peça é enfeite (não é a informação): figura que não é grande (ícone, brilho, seta --
 * um gráfico ou uma imagem passa de 15% da área) ou um glifo gigante de fundo ("?" de 400 px).
 * Medido como fração da área útil, que não muda quando a cena cresce.
 */
const ehEnfeite = (p: PecaMedida, util: Retangulo) => (p.letra === null ? area(p.r) < 0.15 * area(util) : p.letra > 300);

/** A nota de uma animação medida: quanto a informação ocupa, menos os defeitos. */
export interface NotaDaComposicao {
  nota: number;
  /** Os defeitos que vetam uma versão: sobreposição, fora do quadro, vazando do conjunto, rosto coberto. */
  graves: number;
  ocupacao: number;
  defeitos: string[];
}

const GRAVE = /^(sobreposição|fora do quadro|vaza do conjunto|rosto coberto)/;

export function notaDaComposicao(c: ComposicaoHtml, m: MedidasDaRevisao, pessoa: PessoaNoQuadro | null): NotaDaComposicao {
  const util = gradeDaComposicao(c).util;
  const pecas = m.pecas.filter((p) => area(p.r) > 40);
  const folhas = pecas.filter((p) => p.chave !== 'cena' && !pecas.some((q) => q.pai === p.chave));
  const caixaDe = (p: PecaMedida) => (p.letra !== null ? (p.rt ?? p.r) : p.r);
  const informacao = folhas.filter((p) => !ehEnfeite(p, util));
  const conteudo = juntar(informacao.map(caixaDe));
  const defeitos: string[] = [];
  // Texto sobre texto, texto sobre figura (o ícone do cartão).
  const textos = folhas.filter((p) => p.letra !== null && p.texto.trim());
  for (let i = 0; i < folhas.length; i += 1) {
    for (let j = i + 1; j < folhas.length; j += 1) {
      const a = folhas[i]!;
      const b = folhas[j]!;
      if (a.letra === null && b.letra === null) continue;
      if (ehEnfeite(a, util) || ehEnfeite(b, util)) continue;
      const ra = caixaDe(a);
      const rb = caixaDe(b);
      if (intersecao(ra, rb) > 0.2 * Math.min(area(ra), area(rb))) defeitos.push(`sobreposição: ${a.chave} e ${b.chave}`);
    }
  }
  // Texto fora do quadro, e texto que vaza do conjunto que o contém (passa da borda do cartão).
  for (const p of textos) {
    // O glifo gigante de fundo pode sangrar pela borda: é desenho, não informação cortada.
    if (ehEnfeite(p, util)) continue;
    const r = caixaDe(p);
    if (r.x < -4 || r.y < -4 || r.x + r.w > W + 4 || r.y + r.h > H + 4) defeitos.push(`fora do quadro: ${p.chave}`);
    const pai = p.pai && p.pai !== 'cena' ? pecas.find((q) => q.chave === p.pai) : null;
    if (pai && (r.x < pai.r.x - 6 || r.x + r.w > pai.r.x + pai.r.w + 6 || r.y < pai.r.y - 6 || r.y + r.h > pai.r.y + pai.r.h + 6)) defeitos.push(`vaza do conjunto: ${p.chave}`);
    if (p.letra! < LETRA_MINIMA) defeitos.push(`ilegível: ${p.chave}`);
  }
  // Os conjuntos (cartão, caixa) também não podem sair do quadro: o texto deles vai junto.
  // O enfeite pode sangrar pela borda, mas não sumir (mais de 40% fora).
  const quadro = { x: 0, y: 0, w: W, h: H };
  for (const p of pecas) {
    if (p.chave === 'cena' || folhas.includes(p)) continue;
    // A borda do conjunto (o fundo e o contorno do cartão), não a do texto dentro dele.
    const r = p.r;
    if (ehEnfeite(p, util)) continue;
    // Cortado na borda do celular é grave; fora das laterais da área útil (encostado na borda) é feio.
    if (r.x < -4 || r.y < -6 || r.x + r.w > W + 4 || r.y + r.h > H + 6) defeitos.push(`fora do quadro: ${p.chave}`);
    else if (r.x < util.x - 12 || r.x + r.w > util.x + util.w + 12) defeitos.push(`fora da margem: ${p.chave}`);
  }
  for (const p of folhas) {
    if (!ehEnfeite(p, util)) continue;
    if (area(p.r) > 0 && intersecao(p.r, quadro) < 0.6 * area(p.r)) defeitos.push(`enfeite cortado: ${p.chave}`);
  }
  // Rosto coberto (cartão sobre o vídeo).
  if (pessoa && c.layout === 'cartao' && conteudo) {
    const rosto = retanguloDaCabeca(pessoa);
    if (intersecao(conteudo, rosto) > ROSTO_COBERTO_MAXIMO * area(rosto)) defeitos.push('rosto coberto');
  }
  // A informação fora da área útil (sob a legenda, o cabeçalho do app).
  if (conteudo && area(conteudo) - intersecao(conteudo, util) > 0.06 * area(conteudo)) defeitos.push('fora da área útil');
  const ocupacao = conteudo ? Math.min(1, area(conteudo) / area(util)) : 0;
  // Ocupar até ~70% da área conta inteiro; mais que isso não soma (respiro também é design).
  const nota = Math.min(ocupacao, 0.7) * 3 - defeitos.reduce((s, d) => s + (d.startsWith('ilegível') ? 0.35 : d.startsWith('enfeite') ? 0.6 : d.startsWith('fora da margem') ? 0.5 : 1), 0);
  return { nota: Math.round(nota * 1000) / 1000, graves: defeitos.filter((d) => GRAVE.test(d)).length, ocupacao: Math.round(ocupacao * 1000) / 1000, defeitos };
}

/**
 * A versão nova é melhor que a de referência? Nunca com mais defeitos graves (texto
 * cortado na borda ou sobre outro não se troca por espaço ocupado); com menos, é; com
 * os mesmos, só se a nota sobe de verdade.
 */
export function versaoMelhor(nova: NotaDaComposicao, referencia: NotaDaComposicao): boolean {
  if (nova.graves !== referencia.graves) return nova.graves < referencia.graves;
  return nova.nota > referencia.nota + 0.15;
}

/**
 * Leva a informação medida para o centro da área útil (só a cena se move). As
 * candidatas que aumentam a cena estimam o centro; depois de medidas, isto acerta.
 * `null` quando já está a menos de 10 px.
 */
export function centralizarNaArea(camadaId: string, c: ComposicaoHtml, m: MedidasDaRevisao, modo: 'centro' | 'esquerda' = 'centro'): Extract<CorrecaoDaRevisao, { tipo: 'ajuste' }> | null {
  const util = gradeDaComposicao(c).util;
  const pecas = m.pecas.filter((p) => area(p.r) > 40);
  const folhas = pecas.filter((p) => p.chave !== 'cena' && !pecas.some((q) => q.pai === p.chave) && !ehEnfeite(p, util));
  const conteudo = juntar(folhas.map((p) => (p.letra !== null ? (p.rt ?? p.r) : p.r)));
  if (!conteudo) return null;
  const dx = Math.round(modo === 'esquerda' ? util.x + util.w * 0.02 - conteudo.x : util.x + util.w / 2 - (conteudo.x + conteudo.w / 2));
  const dy = Math.round(util.y + util.h / 2 - (conteudo.y + conteudo.h / 2));
  return Math.abs(dx) < 10 && Math.abs(dy) < 10 ? null : { tipo: 'ajuste', camadaId, chave: 'cena', dx, dy };
}

export interface CandidataDaComposicao {
  nome: string;
  /** Aumenta a cena: depois de medida, a informação vai para o centro da área útil (ou, num desenho alinhado à esquerda, fica na esquerda e só centraliza na altura). */
  centralizar?: 'centro' | 'esquerda';
  /** O que a versão faz, para a pessoa. */
  mensagem: string;
  correcoes: Array<Extract<CorrecaoDaRevisao, { tipo: 'ajuste' }>>;
}

/**
 * As versões que valem testar numa animação, a partir das correções pontuais
 * que a revisão achou (`pontuais`) e das medidas. Até ~7 versões.
 */
export function candidatasDaComposicao(camadaId: string, c: ComposicaoHtml, m: MedidasDaRevisao, pontuais: readonly AchadoDaRevisao[], pessoa: PessoaNoQuadro | null): CandidataDaComposicao[] {
  const util = gradeDaComposicao(c).util;
  const pecas = m.pecas.filter((p) => area(p.r) > 40);
  const cena = pecas.find((p) => p.chave === 'cena');
  const folhas = pecas.filter((p) => p.chave !== 'cena' && !pecas.some((q) => q.pai === p.chave));
  const caixaDe = (p: PecaMedida) => (p.letra !== null ? (p.rt ?? p.r) : p.r);
  const conteudo = juntar(folhas.filter((p) => !ehEnfeite(p, util)).map(caixaDe));
  const out: CandidataDaComposicao[] = [];
  const ajustes = pontuais.flatMap((a) => (a.correcao?.tipo === 'ajuste' ? [a.correcao] : []));
  if (ajustes.length) out.push({ nome: 'pontuais', mensagem: pontuais.map((a) => a.mensagem).join(' '), correcoes: ajustes });
  // Sem as que mexem na cena (o rosto, o vazio): as pontuais nas peças sozinhas.
  const soPecas = ajustes.filter((a) => a.chave !== 'cena');
  if (soPecas.length && soPecas.length < ajustes.length) out.push({ nome: 'pontuais nas peças', mensagem: pontuais.filter((a) => a.correcao?.tipo === 'ajuste' && a.correcao.chave !== 'cena').map((a) => a.mensagem).join(' '), correcoes: soPecas });
  if (!cena || !conteudo || c.layout === 'pip') return out;
  const titulo = curto(c.titulo ?? 'animação');
  const cobreRosto = !!pessoa && c.layout === 'cartao' && intersecao(conteudo, retanguloDaCabeca(pessoa)) > ROSTO_COBERTO_MAXIMO * area(retanguloDaCabeca(pessoa));
  if (cobreRosto) return out;

  // A cena maior, com a informação no centro da área útil. `estreitar` diminui a largura do
  // bloco principal antes (o texto quebra em mais linhas e o conjunto fica mais alto).
  const maior = (fator: number, extras: Array<Extract<CorrecaoDaRevisao, { tipo: 'ajuste' }>> = [], largura = conteudo.w, altura = conteudo.h): Array<Extract<CorrecaoDaRevisao, { tipo: 'ajuste' }>> => {
    const gx = cena.r.x + cena.r.w / 2;
    const gy = cena.r.y + cena.r.h / 2;
    // O centro do conteúdo depois de escalar em volta do centro da cena (o estreitar mantém a esquerda).
    const cx = gx + (conteudo.x + largura / 2 - gx) * fator;
    const cy = gy + (conteudo.y + altura / 2 - gy) * fator;
    return [...extras, { tipo: 'ajuste', camadaId, chave: 'cena', dx: Math.round(util.x + util.w / 2 - cx), dy: Math.round(util.y + util.h / 2 - cy), fator }];
  };
  const cabeLargura = (util.w * 0.94) / conteudo.w;
  const cabeAltura = (util.h * 0.94) / conteudo.h;
  const uniforme = Math.min(AUMENTO_DA_CENA_MAXIMO, cabeLargura, cabeAltura);
  if (uniforme >= 1.1) {
    out.push({ nome: 'cena maior', centralizar: 'centro', mensagem: `"${titulo}" ficou ${Math.round((uniforme - 1) * 100)}% maior, ocupando o espaço que sobrava.`, correcoes: maior(uniforme) });
    if (uniforme >= 1.3) out.push({ nome: 'cena um pouco maior', centralizar: 'centro', mensagem: `"${titulo}" ficou ${Math.round((uniforme * 0.85 - 1) * 100)}% maior, ocupando melhor o espaço.`, correcoes: maior(uniforme * 0.85) });
  }
  // Desenho alinhado à esquerda (o texto encostado na margem, um enfeite à direita): a versão
  // maior fica à esquerda também -- centralizar empurraria o enfeite para fora.
  const alinhadoAEsquerda = conteudo.x - util.x < util.w * 0.1 && conteudo.x + conteudo.w < util.x + util.w * 0.7;
  if (alinhadoAEsquerda) {
    const larguraLivre = (util.w * 0.7) / conteudo.w;
    const fator = Math.min(AUMENTO_DA_CENA_MAXIMO, larguraLivre, cabeAltura);
    if (fator >= 1.1)
      out.push({ nome: 'maior à esquerda', centralizar: 'esquerda', mensagem: `"${titulo}" ficou ${Math.round((fator - 1) * 100)}% maior, no lado em que já estava.`, correcoes: maior(fator) });
  }

  // Só os textos maiores (os enfeites ficam onde estão): cada bloco de texto da cena cresce
  // mantendo o alinhamento (esquerda, ou o centro), e cada um desce o que os de cima cresceram.
  const blocos = pecas
    .filter((p) => p.pai === 'cena' && p.letra !== null && p.letra <= 300 && p.texto.trim())
    .sort((a, b) => caixaDe(a).y - caixaDe(b).y);
  if (blocos.length && blocos.length <= 4) {
    const altura = blocos.reduce((s, p) => s + caixaDe(p).h, 0);
    const largura = Math.max(...blocos.map((p) => caixaDe(p).w));
    const folga = Math.min(AUMENTO_DA_CENA_MAXIMO, (util.w * (alinhadoAEsquerda ? 0.7 : 0.92)) / largura, 1 + (util.y + util.h * 0.96 - (conteudo.y + conteudo.h)) / Math.max(1, altura));
    for (const f of [folga, 1 + (folga - 1) * 0.6]) {
      if (f < 1.15) continue;
      let desce = 0;
      const correcoes: Array<Extract<CorrecaoDaRevisao, { tipo: 'ajuste' }>> = [];
      for (const p of blocos) {
        const r = caixaDe(p);
        // Cresce em volta do centro: na esquerda, volta o que avançou para a esquerda; desce o que os de cima cresceram e o que ele mesmo subiu.
        const dx = alinhadoAEsquerda ? Math.round((r.w * (f - 1)) / 2) : 0;
        const dy = Math.round(desce + (r.h * (f - 1)) / 2);
        desce += r.h * (f - 1);
        correcoes.push({ tipo: 'ajuste', camadaId, chave: p.chave, dx, dy, fator: Math.round(f * 100) / 100 });
      }
      out.push({ nome: `textos ${Math.round((f - 1) * 100)}% maiores`, mensagem: `Em "${titulo}", os textos ficaram ${Math.round((f - 1) * 100)}% maiores, ocupando o espaço vazio.`, correcoes });
    }
  }

  // O bloco largo e baixo: estreitar e aumentar (só quando a altura tem folga e a largura não).
  if (cabeAltura > cabeLargura * 1.35) {
    const bloco = [...pecas]
      .filter((p) => p.pai === 'cena' && (p.lw ?? 0) > 0 && !ehEnfeite(p, util))
      .sort((a, b) => b.r.w * b.r.h - a.r.w * a.r.h)[0];
    if (bloco && bloco.r.w > 0.55 * conteudo.w) {
      for (const f of [0.75, 0.6]) {
        const estreito = { tipo: 'ajuste' as const, camadaId, chave: bloco.chave, w: Math.round((bloco.lw ?? bloco.r.w) * f) };
        // Depois de estreitar, a largura cai e a altura sobe (estimativa: o mesmo texto em menos largura).
        const largura = conteudo.w - bloco.r.w * (1 - f);
        const altura = conteudo.h * (1 / f) * 0.92;
        const fator = Math.min(AUMENTO_DA_CENA_MAXIMO * 1.15, (util.w * 0.94) / largura, (util.h * 0.92) / altura);
        if (fator < 1.1) continue;
        out.push({
          nome: `bloco a ${Math.round(f * 100)}% e maior`,
          centralizar: 'centro',
          mensagem: `"${titulo}": o texto foi rearranjado em mais linhas e ficou ${Math.round((fator - 1) * 100)}% maior, ocupando o espaço que sobrava.`,
          correcoes: maior(fator, [estreito], largura, altura),
        });
      }
    }
  }
  return out;
}

/** A animação com um conjunto de ajustes de peça aplicados (o que `aplicarCorrecoes` faz numa camada). */
export function composicaoComAjustes(c: ComposicaoHtml, correcoes: ReadonlyArray<Extract<CorrecaoDaRevisao, { tipo: 'ajuste' }>>): ComposicaoHtml {
  let atual: AjusteDaCena = ajusteDaComposicao(c) ?? { x: 0, y: 0, escala: 1 };
  for (const k of correcoes) {
    const antes: AjusteDaPeca = k.chave === 'cena' ? { x: atual.x, y: atual.y, escala: atual.escala } : (atual.elementos?.[k.chave] ?? { x: 0, y: 0, escala: 1 });
    const peca: AjusteDaPeca = {
      ...antes,
      x: Math.round(antes.x + (k.dx ?? 0)),
      y: Math.round(antes.y + (k.dy ?? 0)),
      escala: Math.round(Math.max(0.3, Math.min(4, antes.escala * (k.fator ?? 1))) * 100) / 100,
      ...(k.w ? { w: k.w } : {}),
    };
    atual = k.chave === 'cena' ? { ...atual, x: peca.x, y: peca.y, escala: peca.escala } : { ...atual, elementos: { ...(atual.elementos ?? {}), [k.chave]: peca } };
  }
  return comAjuste(c, lerAjuste(atual));
}

function juntar(rs: readonly Retangulo[]): Retangulo | null {
  if (!rs.length) return null;
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
}

// ============================================================
// As correções sem IA
// ============================================================

/**
 * O plano com os consertos dos achados que têm um. Devolve também quais
 * foram aplicados (um conserto que não acha mais o alvo é pulado).
 */
export function aplicarCorrecoes(plano: EditPlanV1, achados: readonly AchadoDaRevisao[]): { plano: EditPlanV1; feitos: AchadoDaRevisao[] } {
  let p: EditPlanV1 = plano;
  const feitos: AchadoDaRevisao[] = [];
  for (const a of achados) {
    const c = a.correcao;
    if (!c) continue;
    const antes = p;
    switch (c.tipo) {
      case 'musica':
        if (p.music) p = { ...p, music: { ...p.music, gainDb: c.gainDb, duckUnderVoice: c.duckUnderVoice } };
        break;
      case 'som':
        if (p.soundEffects?.some((s) => s.id === c.soundEffectId)) p = { ...p, soundEffects: p.soundEffects.map((s) => (s.id === c.soundEffectId ? { ...s, gainDb: Math.min(s.gainDb, c.gainDb) } : s)) };
        break;
      case 'legenda':
        p = { ...p, captions: { ...p.captions, wordsPerBlock: c.wordsPerBlock } };
        break;
      case 'ganho-do-trecho':
        if (p.clips.some((x) => x.id === c.clipId))
          p = {
            ...p,
            clips: p.clips.map((x) => {
              if (x.id !== c.clipId) return x;
              const { gainDb: _antes, ...resto } = x.audio ?? {};
              const audio = c.gainDb === null ? resto : { ...resto, gainDb: c.gainDb };
              return Object.keys(audio).length ? { ...x, audio } : (({ audio: _a, ...sem }) => sem)(x);
            }),
          };
        break;
      case 'tirar-efeito':
        if (p.screenEffects?.some((e) => e.id === c.efeitoId)) p = { ...p, screenEffects: p.screenEffects.filter((e) => e.id !== c.efeitoId) };
        break;
      case 'duracao':
        if (p.overlays.some((o) => o.id === c.overlayId)) p = { ...p, overlays: p.overlays.map((o) => (o.id === c.overlayId ? { ...o, durationMs: Math.max(o.durationMs, c.durationMs) } : o)) };
        break;
      case 'ajuste': {
        const camada = (p.mediaLayers ?? []).find((m) => m.id === c.camadaId && m.composicao);
        if (!camada) break;
        const composicao = composicaoComAjustes(camada.composicao!, [c]);
        p = { ...p, mediaLayers: (p.mediaLayers ?? []).map((m) => (m.id === c.camadaId ? { ...m, composicao } : m)) };
        break;
      }
    }
    if (p !== antes) feitos.push(a);
  }
  return { plano: p, feitos };
}

/** O resumo da revisão para a pessoa (a tela do editor) e para o log. */
export function resumoDaRevisao(feitos: readonly AchadoDaRevisao[], pendentes: readonly AchadoDaRevisao[]): string {
  const linhas: string[] = [];
  if (feitos.length) linhas.push(`Revisei o vídeo e corrigi ${feitos.length} ${feitos.length === 1 ? 'detalhe' : 'detalhes'}:`, ...feitos.slice(0, 12).map((a) => `• ${a.mensagem}`));
  if (pendentes.length) linhas.push(feitos.length ? '' : 'Revisei o vídeo.', `Vale você conferir ${pendentes.length === 1 ? 'um ponto' : `${pendentes.length} pontos`}:`, ...pendentes.slice(0, 8).map((a) => `• ${a.mensagem}`));
  if (!linhas.length) linhas.push('Revisei o vídeo: nada para corrigir.');
  return linhas.join('\n').trim();
}
