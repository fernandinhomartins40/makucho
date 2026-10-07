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

import { iconeExiste, presetDeMotion, type CenaDeMotion, type TextosDaCena } from './motion-presets';
import { iconeDoTexto, objetoDoTexto } from './ilustracao';

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
      if (/perspectiv|vis[aã]o|enxerg|olhar|foco/i.test(x.titulo)) return em('hud', { titulo: x.titulo });
      return em('cartaz', { titulo: x.titulo, ...(curto(x.kicker, 24) ? { kicker: x.kicker } : {}), ...(curto(x.detalhe, 24) ? { detalhe: x.detalhe } : {}) });
    case 'frase':
    case 'citacao': {
      // A palavra de ênfase (ou a frase curta) vira a palavra grande; a de
      // visão e perspectiva, as linhas que desenham o ambiente.
      const palavra = x.titulo && palavras(x.titulo) <= 2 ? x.titulo : x.enfase && palavras(x.enfase) <= 3 ? x.enfase : undefined;
      if (!palavra) return null;
      if (/perspectiv|vis[aã]o|enxerg|olhar|foco|ambiente/i.test(`${x.titulo ?? ''} ${palavra}`)) return em('hud', { titulo: palavra });
      return palavras(palavra) <= 1 || sementeDoTexto(palavra) % 2
        ? em('profundidade', { titulo: palavra, ...(curto(x.kicker, 24) ? { kicker: x.kicker } : {}) })
        : em('cartaz', { titulo: palavra, ...(curto(x.kicker, 24) ? { kicker: x.kicker } : {}) });
    }
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

/** As cenas só de texto (sem gráfico, objeto, ícone ou interface): as que o vídeo de referência quase não tem. */
export const PRESETS_SO_TEXTO = new Set(['impacto', 'frase', 'citacao', 'termo', 'pergunta', 'selo', 'alerta', 'antes_depois', 'versus', 'cartaz', 'profundidade']);

/**
 * As cenas ilustradas: a IA barata quase nunca pede objeto ou ícone, e o
 * vídeo saía só com texto. Pelas palavras ditas em cada cena:
 *   - o versus de dois nomes curtos vira os dois ícones ao lado do rosto
 *     (com rosto em quadro);
 *   - a cena só de texto em que a fala cita algo que um objeto mostra
 *     (dinheiro, gráfico, mapa, vídeo, ideia...) vira a cena do objeto
 *     animado, com o mesmo título;
 * até que ao menos `fracao` das cenas tenha algo além de texto. Cada objeto
 * uma vez por vídeo, sem duas cenas iguais seguidas.
 */
export function ilustrarCenas<T extends { cena: CenaDeMotion }>(cenas: readonly T[], o: { comRosto: boolean; fracao?: number }): { cenas: T[]; ilustradas: number } {
  const saida = cenas.map((c) => ({ ...c }));
  const alvo = Math.ceil(saida.length * (o.fracao ?? 0.65));
  const ilustrada = (c: CenaDeMotion) => !PRESETS_SO_TEXTO.has(c.preset);
  let tem = saida.filter((c) => ilustrada(c.cena)).length;
  const usados = new Set(saida.map((c) => c.cena.textos.objeto).filter((x): x is string => !!x));
  let ilustradas = 0;
  for (let i = 0; i < saida.length && tem < alvo; i += 1) {
    const atual = saida[i]!.cena;
    if (ilustrada(atual)) continue;
    const x = atual.textos;
    const vizinho = (preset: string) => saida[i - 1]?.cena.preset === preset || saida[i + 1]?.cena.preset === preset;
    let nova: CenaDeMotion | null = null;
    if (atual.preset === 'versus' && o.comRosto && x.a && x.b && palavras(x.a) <= 3 && palavras(x.b) <= 3 && !vizinho('ladeando')) {
      const ia = iconeDoTexto(x.a) ?? 'x-circle';
      const ib = iconeDoTexto(x.b) ?? 'check-circle';
      if (iconeExiste(ia) && iconeExiste(ib)) nova = { preset: 'ladeando', textos: { icones: [ia, ib], a: x.a, b: x.b, ...(x.kicker ? { kicker: x.kicker } : {}) }, layout: 'cartao' };
    }
    if (!nova && !vizinho('objeto')) {
      const titulo = x.titulo ?? x.depois ?? x.b;
      const objeto = objetoDoTexto([x.titulo, x.detalhe, x.kicker, x.antes, x.depois, x.a, x.b].filter(Boolean).join(' '), usados);
      if (objeto && titulo && palavras(titulo) <= 8) {
        const layout = (['meio_a_meio', 'cartao', 'pip', 'tela_cheia'] as const).includes(atual.layout as never) ? atual.layout : 'meio_a_meio';
        nova = { preset: 'objeto', textos: { objeto, titulo, ...(x.detalhe && palavras(x.detalhe) <= 10 ? { detalhe: x.detalhe } : {}), ...(x.enfase ? { enfase: x.enfase } : {}) }, layout, ...(atual.lado ? { lado: atual.lado } : {}), ...(atual.canto ? { canto: atual.canto } : {}) };
        usados.add(objeto);
      }
    }
    if (!nova) continue;
    saida[i] = { ...saida[i]!, cena: nova };
    tem += 1;
    ilustradas += 1;
  }
  return { cenas: saida, ilustradas };
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
