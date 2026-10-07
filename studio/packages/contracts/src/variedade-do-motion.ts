// ============================================================
// MAKUCHO STUDIO - Variedade nas cenas de motion, sem IA.
//
// Um modelo barato, diante de 38 visuais e 38 cenas, escolhe sempre o
// que parece mais seguro: o mesmo visual para o mesmo tipo de vídeo e as
// cenas clássicas (contador, selo, alerta) -- as em volta da pessoa
// quase nunca saíam. Aqui o servidor decide o que a IA não decide bem:
//
//   1. o VISUAL, por rodízio entre os que combinam com o vídeo, sem
//      repetir os últimos usados no espaço de trabalho;
//   2. a MISTURA das cenas: com rosto em quadro, uma parte das cenas
//      clássicas vira a versão em volta da pessoa (o contador vira o
//      número gigante atrás dela, a palavra de impacto vira o título
//      gigante, a lista curta vira os cards em volta...), com os MESMOS
//      textos ditos -- nada é inventado.
//
// Determinístico: o mesmo projeto e o mesmo histórico dão o mesmo vídeo.
// ============================================================

import { presetDeMotion, type CenaDeMotion, type TextosDaCena } from './motion-presets';

/** Um número estável de um texto (FNV-1a). */
export function sementeDoTexto(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * O visual do vídeo: um dos que combinam (na ordem de preferência), por
 * rodízio pela semente do projeto, fora os usados por último no espaço de
 * trabalho (se todos foram usados, o menos recente).
 */
export function visualPorRodizio(combinam: readonly string[], recentes: readonly string[], semente: string): string {
  if (!combinam.length) throw new Error('nenhum visual para escolher');
  const livres = combinam.filter((v) => !recentes.includes(v));
  if (livres.length) return livres[sementeDoTexto(semente) % livres.length]!;
  // Todos usados: o que foi usado há mais tempo.
  return [...combinam].sort((a, b) => recentes.indexOf(b) - recentes.indexOf(a))[0]!;
}

const palavras = (s: string | undefined) => (s ?? '').split(/\s+/).filter(Boolean).length;

/** A versão em volta da pessoa de uma cena clássica, com os mesmos textos; `null` quando não cabe. */
export function cenaEmVolta(cena: CenaDeMotion): CenaDeMotion | null {
  const x = cena.textos;
  const em = (preset: string, textos: TextosDaCena): CenaDeMotion => ({ preset, textos, layout: 'cartao' });
  const curto = (s: string | undefined, max: number) => (s && s.length <= max ? s : undefined);
  switch (cena.preset) {
    case 'contador':
    case 'anel':
      if (!x.numero || [...x.numero].length > 7) return null;
      return em('numero_gigante', {
        numero: x.numero,
        ...(x.prefixo ? { prefixo: x.prefixo } : {}),
        ...(x.unidade || cena.preset === 'anel' ? { unidade: x.unidade ?? '%' } : {}),
        ...(curto(x.titulo, 28) ? { kicker: x.titulo } : x.kicker ? { kicker: x.kicker } : {}),
      });
    case 'impacto':
    case 'selo':
      if (!x.titulo || palavras(x.titulo) > 3) return null;
      return em('cartaz', { titulo: x.titulo, ...(curto(x.kicker, 24) ? { kicker: x.kicker } : {}), ...(curto(x.detalhe, 24) ? { detalhe: x.detalhe } : {}) });
    case 'frase':
      if (!x.titulo || palavras(x.titulo) > 2) return null;
      return em('profundidade', { titulo: x.titulo, ...(curto(x.kicker, 24) ? { kicker: x.kicker } : {}) });
    case 'barras':
      if ((x.valores ?? []).length !== 2 || (x.itens ?? []).length < 2) return null;
      return em('placar', {
        a: x.itens![0]!,
        b: x.itens![1]!,
        valores: x.valores!.slice(0, 2),
        ...(x.unidade ? { unidade: x.unidade } : {}),
        ...(x.titulo ? { titulo: x.titulo } : {}),
      });
    case 'lista':
    case 'ranking': {
      const itens = x.itens ?? [];
      if (itens.length < 2 || itens.length > 4 || itens.some((i) => palavras(i) > 2)) return null;
      return em('mosaico', { itens, ...(x.icones?.length ? { icones: x.icones } : {}), ...(x.titulo ? { titulo: x.titulo } : {}) });
    }
    case 'passos': {
      const itens = x.itens ?? [];
      if (!x.titulo || itens.length < 2 || itens.length > 3 || itens.some((i) => palavras(i) > 3)) return null;
      return em('janela', { titulo: x.titulo, itens, ...(x.kicker ? { kicker: x.kicker } : {}) });
    }
    case 'notificacao':
      if (!x.titulo || !x.detalhe) return null;
      return em('mensagem', { titulo: x.kicker ?? x.titulo, detalhe: x.kicker ? `${x.titulo}. ${x.detalhe}`.slice(0, 140) : x.detalhe });
    default:
      return null;
  }
}

/** Presets que já são "em volta da pessoa" (não contam como clássicos). */
export const PRESETS_EM_VOLTA = new Set(['cartaz', 'numero_gigante', 'placar', 'mosaico', 'ladeando', 'selecao', 'hud', 'profundidade', 'janela', 'linha_do_tempo', 'comentario', 'mensagem']);

/**
 * A mistura das cenas do vídeo: com rosto, ao menos `fracao` delas em volta
 * da pessoa. Troca as clássicas que têm versão em volta, escolhidas por
 * rodízio (a semente) e sem deixar duas cenas iguais seguidas. Devolve as
 * cenas na mesma ordem e quantas trocou.
 */
export function variarCenas<T extends { cena: CenaDeMotion }>(cenas: readonly T[], o: { comRosto: boolean; semente: string; fracao?: number }): { cenas: T[]; trocadas: number } {
  const saida = cenas.map((c) => ({ ...c }));
  if (!o.comRosto || !saida.length) return { cenas: saida, trocadas: 0 };
  const alvo = Math.ceil(saida.length * (o.fracao ?? 0.4));
  let jaTem = saida.filter((c) => PRESETS_EM_VOLTA.has(c.cena.preset)).length;
  const candidatos = saida
    .map((c, i) => ({ i, nova: cenaEmVolta(c.cena) }))
    .filter((c): c is { i: number; nova: CenaDeMotion } => !!c.nova)
    .sort((a, b) => sementeDoTexto(`${o.semente}#${a.i}`) - sementeDoTexto(`${o.semente}#${b.i}`));
  let trocadas = 0;
  for (const { i, nova } of candidatos) {
    if (jaTem >= alvo) break;
    const vizinhoIgual = saida[i - 1]?.cena.preset === nova.preset || saida[i + 1]?.cena.preset === nova.preset;
    if (vizinhoIgual || !presetDeMotion(nova.preset)) continue;
    saida[i] = { ...saida[i]!, cena: nova };
    jaTem += 1;
    trocadas += 1;
  }
  return { cenas: saida, trocadas };
}
