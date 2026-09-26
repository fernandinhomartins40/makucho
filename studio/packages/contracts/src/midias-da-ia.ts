// ============================================================
// MAKUCHO STUDIO - Mídias da IA: imagens, ícones e vídeos que ilustram
// a fala, buscados em bancos de licença livre.
//
// Fluxo:
//   1. a IA lê a fala no tempo do vídeo (`falaParaMidias`) e devolve os
//      MOMENTOS VISUAIS: quando, o conceito, termos de busca em inglês,
//      o tipo de mídia e a composição (`lerMomentosVisuais`);
//   2. o servidor busca cada momento nas fontes do tipo (`FONTES_DO_TIPO`)
//      e ordena os resultados (`ranquearResultados`) -- a IA não vê as
//      imagens, então a ordem vem de tags, título, formato e transparência;
//   3. a pessoa escolhe no painel (ou "aceita todas") e cada escolha vira
//      operações da timeline (`operacoesDaComposicao`): a camada de mídia
//      com posição, animação e moldura, e o título quando a composição tem.
//
// Fontes (todas de licença livre -- o Google Imagens não tem API aberta
// e as imagens de lá não têm licença): Pexels e Pixabay (fotos, vídeos,
// ilustrações), Openverse (Creative Commons, CC0/CC-BY), Iconify (ícones
// e logos de coleções MIT/Apache/CC0), 3dicons (3D, CC0) e Microsoft
// Fluent Emoji 3D (MIT).
// ============================================================

import { z } from 'zod';
import { agendaDoPlano } from './agenda';
import type { EditPlanV1 } from './edit-plan';
import { PRESETS_DE_TEXTO } from './textos-de-tela';
import type { TimelineOperation } from './timeline';

// ---------- Tipos, fontes e licenças ----------

export const TIPOS_DA_BUSCA = ['video', 'foto', 'ilustracao', 'icone3d', 'icone', 'logo'] as const;
export type TipoDaBusca = (typeof TIPOS_DA_BUSCA)[number];

export const NOME_DO_TIPO_DA_BUSCA: Record<TipoDaBusca, string> = {
  video: 'Vídeos',
  foto: 'Fotos',
  ilustracao: 'Ilustrações',
  icone3d: 'Ícones 3D',
  icone: 'Ícones',
  logo: 'Logos',
};

export const FONTES_DE_MIDIA = ['pexels', 'pixabay', 'openverse', 'iconify', '3dicons', 'fluent'] as const;
export type FonteDeMidia = (typeof FONTES_DE_MIDIA)[number];

export const NOME_DA_FONTE: Record<FonteDeMidia, string> = {
  pexels: 'Pexels',
  pixabay: 'Pixabay',
  openverse: 'Openverse',
  iconify: 'Iconify',
  '3dicons': '3dicons',
  fluent: 'Fluent Emoji 3D',
};

/** Onde buscar cada tipo, na ordem de preferência. */
export const FONTES_DO_TIPO: Record<TipoDaBusca, readonly FonteDeMidia[]> = {
  video: ['pexels', 'pixabay'],
  foto: ['pexels', 'pixabay', 'openverse'],
  ilustracao: ['pixabay', 'openverse'],
  icone3d: ['3dicons', 'fluent'],
  icone: ['iconify'],
  logo: ['iconify'],
};

/** As fontes que precisam de chave (cadastrada em Configurações). */
export const FONTES_COM_CHAVE: readonly FonteDeMidia[] = ['pexels', 'pixabay'];

export interface LicencaDaMidia {
  /** cc0, pdm, cc-by, mit, apache-2.0, pexels, pixabay... */
  tipo: string;
  nome: string;
  url?: string;
  /** CC-BY e parecidas: o crédito ao autor vai junto do arquivo. */
  exigeCredito: boolean;
}

export interface ResultadoDaBusca {
  fonte: FonteDeMidia;
  /** Id na fonte (o servidor busca o arquivo de novo por ele ao importar). */
  id: string;
  tipo: TipoDaBusca;
  titulo: string;
  tags: string[];
  largura: number;
  altura: number;
  duracaoMs: number | null;
  miniatura: string;
  /** PNG/SVG com fundo transparente (ícones, recortes). */
  transparente: boolean;
  autor: string;
  /** A página do item na fonte (crédito). */
  pagina: string;
  licenca: LicencaDaMidia;
  /**
   * O quanto a imagem COMBINA com a cena (0-100), medido pela IA que
   * olha a miniatura (CLIP). Ausente quando a visão não rodou.
   */
  afinidade?: number;
}

export const buscaDeMidiaSchema = z.object({
  q: z.string().trim().min(1).max(100),
  tipo: z.enum(TIPOS_DA_BUSCA).default('video'),
  fonte: z.enum(FONTES_DE_MIDIA).optional(),
  pagina: z.coerce.number().int().min(1).max(50).default(1),
});

export const importacaoDeMidiaSchema = z.object({
  fonte: z.enum(FONTES_DE_MIDIA),
  tipo: z.enum(TIPOS_DA_BUSCA),
  id: z.string().trim().min(1).max(200),
});

export type ImportacaoDeMidia = z.infer<typeof importacaoDeMidiaSchema>;

// ---------- Momentos visuais (o que a IA devolve) ----------

export const COMPOSICOES = ['icone_ao_lado', 'tela_cheia', 'tela_cheia_com_titulo', 'moldura', 'cartao', 'janela'] as const;
export type Composicao = (typeof COMPOSICOES)[number];

export const NOME_DA_COMPOSICAO: Record<Composicao, string> = {
  icone_ao_lado: 'Ao lado da cabeça, flutuando',
  tela_cheia: 'Tela cheia',
  tela_cheia_com_titulo: 'Tela cheia com título',
  moldura: 'Em moldura',
  cartao: 'Em cartão',
  janela: 'Janela no canto',
};

/** A composição que cada tipo pede quando a IA não diz (ou diz errado). */
const COMPOSICAO_DO_TIPO: Record<TipoDaBusca, Composicao> = {
  icone3d: 'icone_ao_lado',
  icone: 'icone_ao_lado',
  logo: 'cartao',
  foto: 'moldura',
  ilustracao: 'cartao',
  video: 'tela_cheia',
};

export interface MomentoVisual {
  inicioMs: number;
  fimMs: number;
  /** O que a pessoa está falando, em português ("o bitcoin"). */
  conceito: string;
  /** Termos de busca em inglês, do mais específico ao mais amplo. */
  termos: string[];
  tipo: TipoDaBusca;
  composicao: Composicao;
  /** Título curto sobre a imagem (só em `tela_cheia_com_titulo`). */
  texto?: string;
  /** O trecho da fala, para a pessoa reconhecer o momento no painel. */
  fala?: string;
  /**
   * A imagem ideal descrita em inglês, como uma legenda de foto ("a gold
   * bitcoin coin on a dark background"): é com ela que a IA que olha as
   * miniaturas mede qual combina mais.
   */
  cena?: string;
  /** Por que a imagem ajuda ali, em português, para a pessoa entender. */
  porque?: string;
}

const cortar = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const DURACAO_MINIMA = 1200;
const DURACAO_MAXIMA = 6000;

/**
 * Lê a resposta da IA, consertando o que dá: tipo e composição fora do
 * vocabulário viram o padrão, tempos são presos ao vídeo e à duração útil
 * (1,2 a 6 s), e momentos que se sobrepõem ficam só o primeiro.
 */
export function lerMomentosVisuais(bruto: string, duracaoDoVideoMs: number): { ok: true; momentos: MomentoVisual[] } | { ok: false; erro: string } {
  let json: unknown;
  try {
    const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const ini = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    json = JSON.parse(ini >= 0 && fim > ini ? limpo.slice(ini, fim + 1) : limpo);
  } catch (e) {
    return { ok: false, erro: `JSON inválido: ${e instanceof Error ? e.message : ''}` };
  }
  const o = (json ?? {}) as Record<string, unknown>;
  const lista = ([o.momentos, o.moments, o.itens].find(Array.isArray) ?? []) as unknown[];
  const momentos: MomentoVisual[] = [];
  for (const item of lista) {
    const x = (item ?? {}) as Record<string, unknown>;
    const tipo = (TIPOS_DA_BUSCA as readonly string[]).includes(String(x.tipo)) ? (x.tipo as TipoDaBusca) : 'foto';
    const composicao = (COMPOSICOES as readonly string[]).includes(String(x.composicao)) ? (x.composicao as Composicao) : COMPOSICAO_DO_TIPO[tipo];
    const termos = (Array.isArray(x.termos) ? x.termos : Array.isArray(x.terms) ? x.terms : [x.termo ?? x.term])
      .map((t) => cortar(t, 40))
      .filter(Boolean)
      .slice(0, 4);
    if (!termos.length) continue;
    const inicio = Math.max(0, Math.round(Number(x.inicioMs ?? (Number(x.inicioS) * 1000))));
    if (!Number.isFinite(inicio) || inicio >= duracaoDoVideoMs - 500) continue;
    const pedidoFim = Math.round(Number(x.fimMs ?? (Number(x.fimS) * 1000)));
    const fim = Math.min(duracaoDoVideoMs, inicio + Math.min(DURACAO_MAXIMA, Math.max(DURACAO_MINIMA, Number.isFinite(pedidoFim) ? pedidoFim - inicio : 2500)));
    const texto = cortar(x.texto, 60);
    const fala = cortar(x.fala, 200);
    const cena = cortar(x.cena ?? x.scene, 160);
    const porque = cortar(x.porque ?? x.motivo, 140);
    momentos.push({
      inicioMs: inicio,
      fimMs: fim,
      conceito: cortar(x.conceito, 60) || termos[0]!,
      termos,
      tipo,
      composicao: composicao === 'tela_cheia_com_titulo' && !texto ? 'tela_cheia' : composicao,
      ...(texto && composicao === 'tela_cheia_com_titulo' ? { texto } : {}),
      ...(fala ? { fala } : {}),
      ...(cena ? { cena } : {}),
      ...(porque ? { porque } : {}),
    });
  }
  momentos.sort((a, b) => a.inicioMs - b.inicioMs);
  const semSobrepor: MomentoVisual[] = [];
  for (const m of momentos) {
    const anterior = semSobrepor[semSobrepor.length - 1];
    if (anterior && m.inicioMs < anterior.fimMs + 400) continue;
    semSobrepor.push(m);
  }
  if (!semSobrepor.length) return { ok: false, erro: 'nenhum momento visual válido' };
  return { ok: true, momentos: semSobrepor.slice(0, 14) };
}

/**
 * A fala no tempo do VÍDEO MONTADO, em frases curtas com o tempo de cada
 * uma: "[12,3–15,8] o bitcoin subiu 20% no mês". É o que a IA lê para
 * decidir onde entra cada imagem.
 */
export function falaParaMidias(
  plano: EditPlanV1,
  palavras: ReadonlyArray<{ startMs: number; endMs: number; texto: string }>,
  desligados: readonly string[] = [],
): string {
  const agenda = agendaDoPlano(plano, [...desligados]);
  const noVideo: Array<{ inicio: number; fim: number; texto: string }> = [];
  for (const t of agenda.trechos) {
    for (const p of palavras) {
      if (p.startMs >= t.clip.sourceStartMs && p.startMs < t.clip.sourceEndMs) {
        noVideo.push({
          inicio: t.inicioMs + (p.startMs - t.clip.sourceStartMs),
          fim: t.inicioMs + (Math.min(p.endMs, t.clip.sourceEndMs) - t.clip.sourceStartMs),
          texto: p.texto,
        });
      }
    }
  }
  noVideo.sort((a, b) => a.inicio - b.inicio);
  const s = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',');
  const frases: string[] = [];
  let atual: typeof noVideo = [];
  const fechar = () => {
    if (atual.length) frases.push(`[${s(atual[0]!.inicio)}–${s(atual[atual.length - 1]!.fim)}] ${atual.map((p) => p.texto).join(' ')}`);
    atual = [];
  };
  for (const p of noVideo) {
    const anterior = atual[atual.length - 1];
    if (anterior && (p.inicio - anterior.fim > 600 || atual.length >= 14)) fechar();
    atual.push(p);
    if (/[.!?]$/.test(p.texto)) fechar();
  }
  fechar();
  return frases.join('\n').slice(0, 12_000);
}

// ---------- Ordem dos resultados ----------

const palavrasDe = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 1);

/**
 * Ordena os resultados de um momento: quanto dos termos aparece no título
 * e nas tags (o primeiro termo pesa mais), transparência nos ícones,
 * formato vertical e resolução nas fotos e vídeos, licença sem exigência
 * de crédito. Estável: empate mantém a ordem da fonte.
 */
export function ranquearResultados(resultados: readonly ResultadoDaBusca[], termos: readonly string[], tipo: TipoDaBusca): ResultadoDaBusca[] {
  const pesoDoTermo = termos.map((t, i) => ({ palavras: palavrasDe(t), peso: i === 0 ? 3 : 1.5 }));
  const nota = (r: ResultadoDaBusca) => {
    const texto = new Set(palavrasDe(`${r.titulo} ${r.tags.join(' ')}`));
    let n = 0;
    for (const { palavras, peso } of pesoDoTermo) {
      if (!palavras.length) continue;
      const achadas = palavras.filter((p) => texto.has(p)).length;
      n += (achadas / palavras.length) * peso;
    }
    const icone = tipo === 'icone3d' || tipo === 'icone' || tipo === 'logo';
    if (icone && r.transparente) n += 1;
    if (!icone) {
      if (r.altura >= r.largura) n += 0.6;
      if (Math.min(r.largura, r.altura) >= 1000) n += 0.4;
    }
    if (r.licenca.exigeCredito) n -= 0.3;
    return n;
  };
  return resultados
    .map((r, i) => ({ r, i, n: nota(r) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.r);
}

// ---------- A escolha vira operações ----------

export interface MidiaEscolhida {
  assetId: string;
  kind: 'image' | 'video';
  largura: number;
  altura: number;
  transparente: boolean;
}

/**
 * As operações de um momento com a mídia escolhida. Cada composição usa o
 * que o Studio já sabe fazer (layout, animação, acompanhar a cabeça,
 * movimento de câmera) mais a moldura; o título é um texto de tela por
 * cima, no mesmo intervalo.
 */
export function operacoesDaComposicao(momento: MomentoVisual, midia: MidiaEscolhida, opcoes: { corDaMarca?: string } = {}): TimelineOperation[] {
  const base = {
    op: 'adicionar_midia' as const,
    assetId: midia.assetId,
    kind: midia.kind,
    timelineStartMs: momento.inicioMs,
    durationMs: Math.max(DURACAO_MINIMA, momento.fimMs - momento.inicioMs),
  };
  const cor = opcoes.corDaMarca && /^#[0-9a-fA-F]{6}$/.test(opcoes.corDaMarca) ? { frameColor: opcoes.corDaMarca } : {};
  const ops: TimelineOperation[] = [];
  switch (momento.composicao) {
    case 'icone_ao_lado':
      ops.push({
        ...base,
        layout: 'livre',
        x: 0.78,
        y: 0.36,
        width: 0.3,
        followPerson: false,
        animIn: 'pop',
        animLoop: 'flutuar',
        animOut: 'encolher',
        ...(midia.transparente ? {} : { frame: 'cartao' as const, radius: 0.18, ...cor }),
      });
      break;
    case 'tela_cheia':
    case 'tela_cheia_com_titulo':
      ops.push({
        ...base,
        layout: 'tela_cheia',
        fadeInMs: 250,
        fadeOutMs: 250,
        ...(midia.kind === 'image' && !midia.transparente ? { kenBurns: 'aproximar' as const } : {}),
        ...(midia.transparente ? { frame: 'cartao' as const, ...cor } : {}),
      });
      if (momento.composicao === 'tela_cheia_com_titulo' && momento.texto) {
        const estilo = PRESETS_DE_TEXTO.find((p) => p.id === 'impacto')?.estilo ?? {};
        ops.push({
          op: 'adicionar_overlay',
          component: 'Destaque',
          text: momento.texto,
          timelineStartMs: base.timelineStartMs + 150,
          durationMs: Math.max(300, base.durationMs - 300),
          style: { ...estilo, x: 0.5, y: 0.72 },
        });
      }
      break;
    case 'moldura':
      // Uma "foto inserida": grande e no meio, por pouco tempo (é o estilo).
      ops.push({ ...base, layout: 'livre', x: 0.5, y: 0.42, width: 0.72, animIn: 'zoom', animOut: 'zoom', frame: 'moldura', radius: 0.04, ...cor });
      break;
    case 'cartao':
      // Ao lado, na altura do peito: não cobre o rosto nem a legenda.
      ops.push({ ...base, layout: 'livre', x: 0.76, y: 0.62, width: 0.38, animIn: 'subir', animOut: 'descer', frame: 'cartao', ...cor });
      break;
    case 'janela':
      ops.push({ ...base, layout: 'pip', radius: 0.08, animIn: 'pop', animOut: 'encolher', fadeInMs: 150, fadeOutMs: 150 });
      break;
  }
  return ops;
}
