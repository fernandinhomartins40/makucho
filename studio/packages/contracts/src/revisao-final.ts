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
}

// ---------- O que sai ----------

export type CategoriaDaRevisao = 'animacao' | 'legenda' | 'audio' | 'texto';

/** O conserto sem IA de um achado. Dados, não função: vai para o log e para a IA. */
export type CorrecaoDaRevisao =
  | { tipo: 'musica'; gainDb: number; duckUnderVoice: boolean }
  | { tipo: 'som'; soundEffectId: string; gainDb: number }
  | { tipo: 'ajuste'; camadaId: string; chave: string; peca: AjusteDaPeca }
  | { tipo: 'legenda'; wordsPerBlock: number }
  | { tipo: 'duracao'; overlayId: string; durationMs: number };

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
  if (m && temFala) {
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
      correcao: { tipo: 'ajuste', camadaId, chave: p.chave, peca: { ...atual, escala } },
    });
  }

  // 2. Sobre o rosto: só onde o vídeo aparece por trás (cartão em cima do vídeo).
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
        ...(cabe ? { correcao: { tipo: 'ajuste' as const, camadaId, chave: 'cena', peca: { ...atual, y: Math.round(atual.y + dy), escala } } } : {}),
      });
    }
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
      out.push({
        id: `animacao|sobreposta|${camadaId}|${a.chave}|${b.chave}`,
        categoria: 'animacao',
        tipo: 'sobreposta',
        gravidade: 'conferir',
        inicioMs,
        fimMs,
        alvo: camadaId,
        mensagem: `Em "${titulo}" ${quando}, o texto "${curto(a.texto)}" fica em cima de "${curto(b.texto)}" (peças ${a.chave} em y ${Math.round(ra.y)}-${Math.round(ra.y + ra.h)} e ${b.chave} em y ${Math.round(rb.y)}-${Math.round(rb.y + rb.h)}).`,
      });
    }
  }
  return out;
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
      case 'duracao':
        if (p.overlays.some((o) => o.id === c.overlayId)) p = { ...p, overlays: p.overlays.map((o) => (o.id === c.overlayId ? { ...o, durationMs: Math.max(o.durationMs, c.durationMs) } : o)) };
        break;
      case 'ajuste': {
        const camada = (p.mediaLayers ?? []).find((m) => m.id === c.camadaId && m.composicao);
        if (!camada) break;
        const atual: AjusteDaCena = ajusteDaComposicao(camada.composicao!) ?? { x: 0, y: 0, escala: 1 };
        const novo: AjusteDaCena =
          c.chave === 'cena' ? { ...atual, x: c.peca.x, y: c.peca.y, escala: c.peca.escala } : { ...atual, elementos: { ...(atual.elementos ?? {}), [c.chave]: c.peca } };
        const composicao = comAjuste(camada.composicao!, lerAjuste(novo));
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
