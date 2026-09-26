// ============================================================
// MAKUCHO STUDIO - "Configurar com IA" no Kit de marca (chamada #8).
//
// A pessoa envia as logos e clica um botão: sai o kit inteiro -- cores,
// fontes, estilo de legenda, estilo dos textos, pacote e transição.
//
// QUEM FAZ O QUÊ
//
// - As CORES saem dos pixels das logos, medidas no navegador (contagem
//   de cor, sem modelo): é exato e não custa nada. O modelo de texto não
//   enxerga imagem, e pedir a ele "a cor da logo" seria pedir um chute.
// - A IA recebe essa paleta medida (hex, quanto da logo ocupa, se é
//   escura ou clara, se a logo é transparente, o formato) e o nome e o
//   segmento da marca, e DECIDE: que cor é a primária, que fontes, que
//   estilos combinam com essa identidade. É julgamento, que é o que um
//   modelo de texto faz bem, num pedido de ~1 mil tokens.
// - Sem IA (sem chave, sem crédito, resposta ruim), `sugestaoPorRegra`
//   monta um kit coerente só com a paleta: o botão nunca falha.
// ============================================================

import { z } from 'zod';
import type { BrandColors } from './brand';
import { FAMILIAS_DE_FONTE, PRESETS_DE_LEGENDA } from './estilos-de-legenda';
import { PRESETS_DE_TEXTO } from './textos-de-tela';
import { PACOTES_DE_ESTILO } from './pacotes';
import { TIPOS_DE_TRANSICAO } from './edit-plan';
import { kitPorRegra, lerKitCriativo, type KitCriativo } from './kit-criativo';

/**
 * O kit da IA, com o que faltar vindo do kit por regra: uma vinheta sem
 * prompt de vídeo (a IA ainda no formato antigo, ou cortada) não some do
 * kit -- entra a versão da regra, com as cores da marca.
 */
function completarKit(daIa: KitCriativo | null, regra: KitCriativo): KitCriativo {
  if (!daIa) return regra;
  return { ...daIa, abertura: daIa.abertura ?? regra.abertura, encerramento: daIa.encerramento ?? regra.encerramento };
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** O que o navegador mede nas logos e manda ao servidor. */
export const entradaDaMarcaSchema = z
  .object({
    nome: z.string().trim().max(60).optional(),
    /** O que a marca faz ("clínica odontológica", "loja de roupas"). */
    segmento: z.string().trim().max(120).optional(),
    /** Livre: público, personalidade, o que não pode faltar ("sério, para médicos"). */
    sobre: z.string().trim().max(800).optional(),
    paleta: z
      .array(z.object({ hex, peso: z.number().min(0).max(1) }).strict())
      .min(1)
      .max(12),
    logos: z
      .array(
        z
          .object({
            variante: z.enum(['LOGO', 'LOGO_NEGATIVE', 'LOGO_COMPACT', 'WATERMARK']),
            transparente: z.boolean(),
            /** Largura / altura. */
            proporcao: z.number().min(0.05).max(20),
            /** Claridade média dos pixels visíveis, 0 (preto) a 1 (branco). */
            claridade: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(4),
  })
  .strict();

export type EntradaDaMarca = z.infer<typeof entradaDaMarcaSchema>;

export interface SugestaoDeMarca {
  cores: BrandColors;
  fonteTitulo: string;
  fonteCorpo: string;
  captionPreset: string;
  textoPreset: string;
  pacote: string | null;
  transicaoPadrao: string;
  /** A personalidade em poucas palavras ("sério e confiável"). */
  tom: string;
  /** Por que essas escolhas, em português simples. */
  justificativa: string;
  /** O acabamento dos vídeos novos, com a cara da marca. */
  preferencias: PreferenciasSugeridas;
  /** Prompts prontos para trilhas, sons, vinhetas, imagens e vídeos. */
  kit: KitCriativo;
  origem: 'ia' | 'regra';
}

export interface PreferenciasSugeridas {
  autoZoom: boolean;
  efeitosSonoros: boolean;
  barraDeProgresso: boolean;
  voiceEnhance: boolean;
  logoPosicao: 'sd' | 'se' | 'id' | 'ie';
  /** Volume da trilha, -32 a -8 dB. */
  volumeTrilhaDb: number;
}

const PREFERENCIAS_POR_REGRA: PreferenciasSugeridas = {
  autoZoom: true,
  efeitosSonoros: true,
  barraDeProgresso: false,
  voiceEnhance: true,
  logoPosicao: 'sd',
  volumeTrilhaDb: -20,
};

function lerPreferencias(v: unknown, reserva: PreferenciasSugeridas): PreferenciasSugeridas {
  if (!v || typeof v !== 'object') return reserva;
  const o = v as Record<string, unknown>;
  const bool = (x: unknown, r: boolean) => (typeof x === 'boolean' ? x : r);
  const vol = Number(o.volumeTrilhaDb);
  return {
    autoZoom: bool(o.autoZoom, reserva.autoZoom),
    efeitosSonoros: bool(o.efeitosSonoros, reserva.efeitosSonoros),
    barraDeProgresso: bool(o.barraDeProgresso, reserva.barraDeProgresso),
    voiceEnhance: bool(o.voiceEnhance, reserva.voiceEnhance),
    logoPosicao: ['sd', 'se', 'id', 'ie'].includes(String(o.logoPosicao)) ? (o.logoPosicao as PreferenciasSugeridas['logoPosicao']) : reserva.logoPosicao,
    volumeTrilhaDb: Number.isFinite(vol) ? Math.min(-8, Math.max(-32, Math.round(vol / 2) * 2)) : reserva.volumeTrilhaDb,
  };
}

// ---------- Cor ----------

function rgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function paraHex([r, g, b]: readonly number[]): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v!))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Luminância relativa (WCAG), 0 a 1. */
export function luminancia(h: string): number {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

/** Saturação (HSL), 0 a 1: o quanto a cor é "cor" e não cinza. */
function saturacao(h: string): number {
  const [r, g, b] = rgb(h).map((v) => v / 255);
  const max = Math.max(r!, g!, b!);
  const min = Math.min(r!, g!, b!);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/** Mistura duas cores (t = quanto de `b`). */
function misturar(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return paraHex(x.map((v, i) => v + (y[i]! - v) * t));
}

function distancia(a: string, b: string): number {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/**
 * As cores da marca a partir da paleta medida, por regra.
 *
 * Primária: a cor mais "cor" (saturada) entre as que pesam na logo.
 * Secundária: a próxima bem diferente dela. Fundo (textDark): a mais
 * escura, ou a primária escurecida. Superfície (accent): entre o fundo e
 * a primária. Texto claro: branco levemente puxado para a primária.
 */
export function coresPorRegra(paleta: EntradaDaMarca['paleta']): BrandColors {
  const cores = [...paleta].sort((a, b) => b.peso - a.peso);
  const vivas = cores.filter((c) => saturacao(c.hex) > 0.25 && luminancia(c.hex) > 0.03 && luminancia(c.hex) < 0.85);
  const pontuar = (c: { hex: string; peso: number }) => saturacao(c.hex) * 0.6 + Math.min(1, c.peso * 3) * 0.4;
  const primaria = [...vivas].sort((a, b) => pontuar(b) - pontuar(a))[0]?.hex ?? cores[0]!.hex;
  const secundaria =
    vivas.map((c) => c.hex).find((h) => distancia(h, primaria) > 90) ?? misturar(primaria, '#FFFFFF', 0.35);
  const escura = cores.map((c) => c.hex).find((h) => luminancia(h) < 0.03);
  const fundo = escura ?? misturar(primaria, '#000000', 0.82);
  return {
    primary: primaria,
    secondary: secundaria,
    accent: misturar(fundo, primaria, 0.22),
    textLight: misturar('#FFFFFF', primaria, 0.03),
    textDark: fundo,
  };
}

/** Um kit coerente sem IA: só a paleta decide. */
export function sugestaoPorRegra(entrada: EntradaDaMarca): SugestaoDeMarca {
  const cores = coresPorRegra(entrada.paleta);
  const viva = saturacao(cores.primary) > 0.6;
  const tom = viva ? 'vibrante e direto' : 'sóbrio e confiável';
  const fonteTitulo = viva ? 'Montserrat' : 'Poppins';
  return {
    cores,
    preferencias: PREFERENCIAS_POR_REGRA,
    kit: kitPorRegra({ nome: entrada.nome, segmento: entrada.segmento, tom: viva ? 'energetic' : 'calm and trustworthy', cores, fonteTitulo }),
    fonteTitulo,
    fonteCorpo: 'Inter',
    captionPreset: viva ? 'destaque' : 'padrao',
    textoPreset: viva ? 'classico' : 'minimal',
    pacote: null,
    transicaoPadrao: 'cut',
    tom,
    justificativa: 'Cores medidas nas suas logos; fontes e estilos escolhidos pela intensidade das cores da marca. Sem a IA, os prompts do kit criativo são modelos com as suas cores.',
    origem: 'regra',
  };
}

// ---------- IA ----------

/** O que a IA pode escolher: gerado do código, igual em toda chamada. */
export function catalogoDaMarcaParaIa(): string {
  return [
    `## Fontes (fonteTitulo, fonteCorpo)\n${FAMILIAS_DE_FONTE.join(', ')}`,
    `## Estilos de legenda (captionPreset: descrição)\n${PRESETS_DE_LEGENDA.map((p) => `${p.id}: ${p.descricao}`).join('\n')}`,
    `## Estilos de texto na tela (textoPreset: descrição)\n${PRESETS_DE_TEXTO.map((p) => `${p.id}: ${p.descricao}`).join('\n')}`,
    `## Pacotes de estilo (pacote: descrição, ou null)\n${PACOTES_DE_ESTILO.map((p) => `${p.id}: ${p.descricao}`).join('\n')}`,
    `## Transição padrão entre cortes (transicaoPadrao)\ncut (corte seco, o padrão em vídeo falado), fade, smooth, slide, zoom, fadeblack`,
    `## Posição do logo (preferencias.logoPosicao)\nsd (superior direito), se (superior esquerdo), id (inferior direito), ie (inferior esquerdo)`,
    `## Logos que a vinheta pode usar (kit.abertura.logo / kit.encerramento.logo)\nLOGO (principal), LOGO_NEGATIVE (versão clara, para fundo escuro), LOGO_COMPACT (só o símbolo)`,
  ].join('\n\n');
}

/** A marca medida, em poucas linhas, para o pedido. */
export function descricaoDaMarcaParaIa(entrada: EntradaDaMarca): string {
  const tom = (h: string) => {
    const l = luminancia(h);
    const s = saturacao(h);
    return `${l < 0.05 ? 'muito escura' : l < 0.2 ? 'escura' : l > 0.7 ? 'clara' : 'média'}${s < 0.15 ? ', neutra' : s > 0.6 ? ', viva' : ''}`;
  };
  const NOME: Record<string, string> = { LOGO: 'principal', LOGO_NEGATIVE: 'para fundo escuro', LOGO_COMPACT: 'ícone', WATERMARK: "marca d'água" };
  return [
    `Marca: ${entrada.nome || '(sem nome)'}${entrada.segmento ? ` | segmento: ${entrada.segmento}` : ''}`,
    ...(entrada.sobre ? [`Sobre a marca (nas palavras da pessoa): ${entrada.sobre}`] : []),
    `Logos: ${entrada.logos.map((l) => `${NOME[l.variante]} (${l.transparente ? 'fundo transparente' : 'fundo opaco'}, ${l.proporcao > 1.6 ? 'horizontal' : l.proporcao < 0.7 ? 'vertical' : 'quadrada'}, ${l.claridade < 0.35 ? 'escura' : l.claridade > 0.7 ? 'clara' : 'média'})`).join('; ') || 'nenhuma'}`,
    'Paleta medida nas logos (hex | quanto da logo ocupa | tom):',
    ...entrada.paleta.map((c) => `${c.hex.toUpperCase()} | ${Math.round(c.peso * 100)}% | ${tom(c.hex)}`),
  ].join('\n');
}

export const respostaDaMarcaSchema = z
  .object({
    cores: z.object({ primary: hex, secondary: hex, accent: hex, textLight: hex, textDark: hex }).strict(),
    fonteTitulo: z.string().max(40),
    fonteCorpo: z.string().max(40),
    captionPreset: z.string().max(40),
    textoPreset: z.string().max(40),
    pacote: z.string().max(40).nullable(),
    transicaoPadrao: z.string().max(40),
    tom: z.string().max(80),
    justificativa: z.string().max(400),
  })
  .passthrough();

/**
 * Lê a resposta e conserta o que dá: um id fora do catálogo vira o da
 * regra, e as cores de texto que não contrastam com o fundo são
 * trocadas. Resposta ilegível devolve `null` (quem chama usa a regra).
 */
export function lerSugestaoDaMarca(bruto: string, entrada: EntradaDaMarca): SugestaoDeMarca | null {
  let json: unknown;
  try {
    json = JSON.parse(bruto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    return null;
  }
  const lido = respostaDaMarcaSchema.safeParse(json);
  if (!lido.success) return null;
  const r = lido.data;
  const regra = sugestaoPorRegra(entrada);
  const familia = (f: string, reserva: string) => FAMILIAS_DE_FONTE.find((x) => x.toLowerCase() === f.trim().toLowerCase()) ?? reserva;
  const noCatalogo = (id: string, ids: readonly string[], reserva: string) => (ids.includes(id) ? id : reserva);

  const cores = { ...r.cores };
  const resto = json as Record<string, unknown>;
  // Texto claro tem de ser legível sobre o fundo escuro da marca.
  if (contraste(cores.textLight, cores.textDark) < 4.5) {
    cores.textLight = '#FFFFFF';
    if (contraste(cores.textLight, cores.textDark) < 4.5) cores.textDark = regra.cores.textDark;
  }

  return {
    cores,
    fonteTitulo: familia(r.fonteTitulo, regra.fonteTitulo),
    fonteCorpo: familia(r.fonteCorpo, regra.fonteCorpo),
    captionPreset: noCatalogo(r.captionPreset, PRESETS_DE_LEGENDA.map((p) => p.id), regra.captionPreset),
    textoPreset: noCatalogo(r.textoPreset, PRESETS_DE_TEXTO.map((p) => p.id), regra.textoPreset),
    pacote: r.pacote && PACOTES_DE_ESTILO.some((p) => p.id === r.pacote) ? r.pacote : null,
    transicaoPadrao: noCatalogo(r.transicaoPadrao, TIPOS_DE_TRANSICAO, 'cut'),
    tom: r.tom.trim().slice(0, 80),
    justificativa: r.justificativa.trim().slice(0, 400),
    preferencias: lerPreferencias(resto.preferencias, regra.preferencias),
    // Kit que não veio (ou veio vazio): o da regra, com as cores da IA.
    kit: completarKit(
      lerKitCriativo(resto.kit),
      kitPorRegra({ nome: entrada.nome, segmento: entrada.segmento, tom: r.tom, cores, fonteTitulo: familia(r.fonteTitulo, regra.fonteTitulo) }),
    ),
    origem: 'ia',
  };
}
