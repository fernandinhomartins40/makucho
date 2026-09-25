// ============================================================
// MAKUCHO STUDIO - O arquivo .ass do video: legendas e textos.
//
// Vive no pacote de CONTRATOS, e nao no worker, por um motivo so: a
// previa do editor desenha este mesmo arquivo no navegador (libass
// em WebAssembly), e o render o queima no MP4 (libass do FFmpeg). Um
// gerador, dois consumidores, o mesmo renderizador -- o que a pessoa
// ve no editor e o que sai no arquivo. Por isso aqui nao ha Node,
// disco nem banco: e TypeScript puro.
//
// A REGRA DAS LEGENDAS: a legenda nao e escrita, e DERIVADA. Cada
// palavra exibida vem de uma `TranscriptWord` com timestamp proprio.
// Legenda que nao foi dita e a mesma violacao que a IA inventar fala
// (contexto mestre, secao 5), agravada por ficar queimada no arquivo.
// A unica troca de texto possivel e a correcao manual, ancorada na
// palavra e auditavel (`captions.corrections`).
//
// Os TEXTOS de tela (titulo de abertura, chamada final, rodape,
// cartao) sao outra coisa: elementos graficos, rotulados como tal no
// plano (`overlays`), que a pessoa ve e edita. Eles entram no mesmo
// arquivo para que tudo seja desenhado numa passagem so.
//
// POR QUE .ass E NAO `drawtext`: o .ass tem karaoke, transformacao
// animada (\t), movimento (\move), caixa por trecho de texto e
// desenho vetorial (\p), tudo num ARQUIVO -- nada entra na linha de
// comando, o que fecha a porta para injecao de argumento.
// ============================================================

import { efeitoUsaPessoa } from './efeitos-de-tela';
import type { CaptionStyleInput } from './brand';
import type { EditPlanV1 } from './edit-plan';
import { eventosDoTextoDeTela } from './textos-de-tela';
import {
  CORES_PADRAO_DA_MARCA,
  FONTES_DE_VIDEO,
  fonteDaFamilia,
  resolverEstiloPersonalizado,
  type EstiloResolvido,
  type FonteDeVideo,
  type MarcaDoVideo,
} from './estilos-de-legenda';

/** Uma palavra da transcricao, com o tempo que o whisper mediu. */
export interface PalavraDaTranscricao {
  /**
   * Id da `TranscriptWord`: a ancora das correcoes manuais. Sem id a
   * palavra nao PODE ser corrigida -- e por isso o worker sempre envia.
   */
  id?: string;
  /** Tempo no arquivo ORIGINAL, nao na timeline do resultado. */
  startMs: number;
  endMs: number;
  word: string;
}

export interface OpcoesDoAss {
  plano: EditPlanV1;
  /**
   * O estilo da legenda. Aceita o formato antigo (`CaptionStyleInput`,
   * estilo personalizado do banco) para nao quebrar quem ja o usa.
   */
  estilo: EstiloResolvido | CaptionStyleInput;
  /** Palavras do original, de onde cada legenda e derivada. */
  palavras: readonly PalavraDaTranscricao[];
  clipsDesligados?: readonly string[];
  /** Cores e fontes da marca, para os textos de tela. */
  marca?: MarcaDoVideo;
  /**
   * Que parte desenhar:
   *   tudo    -- legendas e todos os textos (sem máscara da pessoa);
   *   frente  -- tudo MENOS os textos marcados "atrás da pessoa";
   *   atras   -- SÓ os textos atrás da pessoa (sem legenda).
   * O render e a prévia desenham "atras", recortam a pessoa por cima e
   * depois desenham "frente".
   */
  camada?: 'tudo' | 'frente' | 'atras';
}

/** O texto vai atrás da pessoa? */
export function ehTextoAtras(o: EditPlanV1['overlays'][number]): boolean {
  return Boolean(o.style?.atras) && (OVERLAYS_DE_TEXTO as readonly string[]).includes(o.component);
}

/**
 * Os intervalos (timeline) em que há texto atrás da pessoa, unidos e
 * dentro do vídeo: é onde a máscara da pessoa precisa existir.
 */
export function janelasAtras(plano: EditPlanV1, duracaoMs: number): Array<{ inicioMs: number; fimMs: number }> {
  return unirJanelas(
    plano.overlays.filter(ehTextoAtras).map((o) => ({ inicioMs: o.timelineStartMs, fimMs: o.timelineStartMs + o.durationMs })),
    duracaoMs,
  );
}

/**
 * Onde a máscara da pessoa precisa existir: textos atrás dela e efeitos
 * que mudam só o fundo (efeitos-de-tela.ts), unidos.
 */
export function janelasDaPessoa(plano: EditPlanV1, duracaoMs: number): Array<{ inicioMs: number; fimMs: number }> {
  return unirJanelas(
    [
      ...plano.overlays.filter(ehTextoAtras).map((o) => ({ inicioMs: o.timelineStartMs, fimMs: o.timelineStartMs + o.durationMs })),
      ...(plano.screenEffects ?? []).filter((e) => efeitoUsaPessoa(e.type)).map((e) => ({ inicioMs: e.timelineStartMs, fimMs: e.timelineStartMs + e.durationMs })),
    ],
    duracaoMs,
  );
}

function unirJanelas(janelas: Array<{ inicioMs: number; fimMs: number }>, duracaoMs: number): Array<{ inicioMs: number; fimMs: number }> {
  const lista = janelas
    .map((j) => ({ inicioMs: Math.max(0, j.inicioMs), fimMs: Math.min(duracaoMs, j.fimMs) }))
    .filter((j) => j.fimMs > j.inicioMs)
    .sort((a, b) => a.inicioMs - b.inicioMs);
  const unidas: Array<{ inicioMs: number; fimMs: number }> = [];
  for (const j of lista) {
    const ultima = unidas.at(-1);
    if (ultima && j.inicioMs <= ultima.fimMs) ultima.fimMs = Math.max(ultima.fimMs, j.fimMs);
    else unidas.push({ ...j });
  }
  return unidas;
}

/** Uma palavra dentro de um bloco, ja no tempo da timeline. */
export interface PalavraNoBloco {
  texto: string;
  inicioMs: number;
  fimMs: number;
  /** Mantido por compatibilidade: `fimMs - inicioMs` do karaoke. */
  duracaoMs: number;
}

/**
 * Um bloco de legenda, ja no tempo da TIMELINE.
 *
 * A conversao de tempo e o ponto mais delicado do arquivo: a palavra
 * sabe onde estava no original, e a legenda precisa aparecer onde o
 * clip caiu no resultado. Errar isso produz legenda dessincronizada,
 * que e pior que legenda nenhuma -- ela contradiz o que se ouve.
 */
export interface BlocoDeLegenda {
  inicioMs: number;
  fimMs: number;
  palavras: PalavraNoBloco[];
  /** As palavras da transcrição que o bloco mostra (para editar/excluir). */
  wordIds?: string[];
  /** Legenda escrita à mão: o id dela no plano. */
  manualId?: string;
}

/**
 * Quanto de uma palavra precisa cair dentro do trecho para ela ser
 * legendada. Antes era a palavra INTEIRA: um corte que pegava um
 * pedaço dela -- comum ao aparar ou dividir -- apagava a legenda, e
 * uma sequência dessas deixava trechos inteiros sem legenda.
 */
const FRACAO_MINIMA_DA_PALAVRA = 0.5;

/**
 * Bloco de menos de 300ms pisca: aparece e sai antes de ser lido. Ele
 * e absorvido pelo anterior em vez de descartado -- descartar apagaria
 * fala que foi dita.
 */
const DURACAO_MINIMA_MS = 300;

/**
 * Pausa que encerra um bloco.
 *
 * Sem isso, um bloco que ainda "cabe" atravessaria um silencio de dois
 * segundos com a primeira palavra parada na tela, mostrando fala que
 * ja passou.
 */
const PAUSA_QUE_QUEBRA_MS = 700;

/** Quanto o bloco pode ficar na tela depois da ultima palavra. */
const FOLGA_DE_LEITURA_MS = 350;

function ehEstiloResolvido(e: EstiloResolvido | CaptionStyleInput): e is EstiloResolvido {
  return 'animacao' in e;
}

/**
 * O estilo, com a POSICAO do plano.
 *
 * O plano manda na posicao, como manda no agrupamento: e o que a
 * pessoa escolheu no editor. Antes o render lia a do estilo e o
 * controle da tela nao chegava ao arquivo.
 */
function paraResolvido(e: EstiloResolvido | CaptionStyleInput, plano?: EditPlanV1): EstiloResolvido {
  const resolvido = ehEstiloResolvido(e) ? e : resolverEstiloPersonalizado(e);
  if (!plano) return resolvido;
  // Fonte e cores escolhidas no editor valem por cima do estilo -- nos
  // dois lados (prévia e render), porque os dois passam por aqui.
  const c = plano.captions;
  const fonte = c.fontId ? (FONTES_DE_VIDEO as Record<string, FonteDeVideo>)[c.fontId] : undefined;
  return {
    ...resolvido,
    // Arrastada na prévia: a base do bloco fica onde a pessoa soltou.
    ...(c.y !== undefined ? { posicao: 'bottom' as const, baseY: c.y } : { posicao: c.position }),
    ...(fonte ? { fonte } : {}),
    ...(c.color ? { cor: c.color } : {}),
    ...(c.highlightColor ? { corDestaque: c.highlightColor } : {}),
  };
}

/**
 * Agrupa as palavras em blocos, no tempo da timeline.
 *
 * Exportada separada da geracao do .ass para ser testavel sem
 * inspecionar texto formatado: o que pode dar errado aqui e a
 * matematica de tempo.
 *
 * Palavras por bloco vem do PLANO (o que a pessoa escolheu no editor)
 * e nao do estilo: antes o render lia o do estilo e ignorava o
 * controle da tela, e a previa agrupava diferente do arquivo.
 */
export function montarBlocos(opcoes: OpcoesDoAss): BlocoDeLegenda[] {
  const { plano, palavras } = opcoes;
  const estilo = paraResolvido(opcoes.estilo, plano);
  const desligados = new Set(opcoes.clipsDesligados ?? []);

  const porBloco = estilo.animacao === 'uma_palavra' ? 1 : Math.max(1, plano.captions.wordsPerBlock);
  const maxCaracteres = estilo.maxCaracteres;

  const clips = plano.clips
    .filter((c) => !desligados.has(c.id))
    .sort((a, b) => a.timelineStartMs - b.timelineStartMs);

  // As correcoes manuais trocam o TEXTO e nada mais: o tempo continua
  // o da palavra falada. E o que faz a correcao ficar no frame certo
  // sem ninguem digitar tempo nenhum.
  const correcoes = new Map(plano.captions.corrections.map((c) => [c.wordId, c.text]));
  const ocultas = new Set(plano.captions.hiddenWordIds ?? []);

  const blocos: BlocoDeLegenda[] = [];

  // O tempo de timeline e recalculado clip a clip, acumulando as
  // duracoes, em vez de lido de `timelineStartMs`: com clips
  // desligados, o campo descreve onde o clip estaria se nada tivesse
  // sido desligado, e o render concatena so o que sobrou.
  let inicioNaTimeline = 0;

  for (const clip of clips) {
    const duracaoDoClip = clip.sourceEndMs - clip.sourceStartMs;
    const fimDoClip = inicioNaTimeline + duracaoDoClip;

    // As palavras cuja MAIOR PARTE cai dentro do trecho. Inteira era
    // rígido demais: um corte que pegava um pedaço da palavra (aparar,
    // dividir) apagava a legenda dela. Menos da metade continua de
    // fora -- aí o som quase não está no resultado.
    const doClip = palavras
      .filter((p) => {
        if (p.id && ocultas.has(p.id)) return false;
        const dentro = Math.min(p.endMs, clip.sourceEndMs) - Math.max(p.startMs, clip.sourceStartMs);
        return dentro > 0 && dentro >= (p.endMs - p.startMs) * FRACAO_MINIMA_DA_PALAVRA;
      })
      .sort((a, b) => a.startMs - b.startMs);

    const doTrecho: BlocoDeLegenda[] = [];
    let atual: BlocoDeLegenda | null = null;
    let caracteres = 0;

    for (const palavra of doClip) {
      const corrigido = palavra.id ? correcoes.get(palavra.id) : undefined;
      const bruto = (corrigido ?? palavra.word).trim();
      if (!bruto) continue;
      const texto = estilo.caixaAlta ? bruto.toLocaleUpperCase('pt-BR') : bruto;

      // A mesma conta que o `setpts=PTS-STARTPTS` faz no video, presa
      // às bordas do trecho (a palavra pode começar um pouco antes).
      const inicio = inicioNaTimeline + Math.max(0, palavra.startMs - clip.sourceStartMs);
      const fim = Math.min(fimDoClip, inicioNaTimeline + (palavra.endMs - clip.sourceStartMs));
      if (fim <= inicio) continue;

      const cabe =
        atual !== null &&
        atual.palavras.length < porBloco &&
        caracteres + texto.length + 1 <= maxCaracteres &&
        inicio - atual.fimMs <= PAUSA_QUE_QUEBRA_MS;

      if (atual && cabe) {
        atual.palavras.push({ texto, inicioMs: inicio, fimMs: fim, duracaoMs: Math.max(1, fim - atual.fimMs) });
        atual.fimMs = fim;
        if (palavra.id) atual.wordIds!.push(palavra.id);
        caracteres += texto.length + 1;
        continue;
      }

      atual = {
        inicioMs: inicio,
        fimMs: fim,
        palavras: [{ texto, inicioMs: inicio, fimMs: fim, duracaoMs: Math.max(1, fim - inicio) }],
        wordIds: palavra.id ? [palavra.id] : [],
      };
      caracteres = texto.length;
      doTrecho.push(atual);
    }

    // Folga de leitura: o bloco fica um pouco depois da ultima
    // palavra, sem invadir o proximo nem passar do fim do trecho.
    doTrecho.forEach((bloco, i) => {
      const proximo = doTrecho[i + 1];
      const limite = Math.min(proximo ? proximo.inicioMs : fimDoClip, fimDoClip);
      bloco.fimMs = Math.max(bloco.fimMs, Math.min(bloco.fimMs + FOLGA_DE_LEITURA_MS, limite));
    });

    blocos.push(...doTrecho);
    inicioNaTimeline = fimDoClip;
  }

  // Legendas escritas à mão: já estão no tempo da timeline. As
  // palavras são espalhadas pela duração, para o destaque da palavra
  // falada andar mesmo sem tempo por palavra.
  const duracaoTotal = inicioNaTimeline;
  for (const m of plano.captions.manual ?? []) {
    const inicio = m.timelineStartMs;
    const fim = Math.min(m.timelineStartMs + m.durationMs, duracaoTotal);
    if (fim <= inicio) continue;
    const textos = m.text
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => (estilo.caixaAlta ? t.toLocaleUpperCase('pt-BR') : t));
    const passo = (fim - inicio) / textos.length;
    blocos.push({
      inicioMs: inicio,
      fimMs: fim,
      manualId: m.id,
      wordIds: [],
      palavras: textos.map((texto, i) => ({
        texto,
        inicioMs: Math.round(inicio + i * passo),
        fimMs: Math.round(inicio + (i + 1) * passo),
        duracaoMs: Math.max(1, Math.round(passo)),
      })),
    });
  }
  blocos.sort((a, b) => a.inicioMs - b.inicioMs);

  return juntarCurtos(blocos);
}

/**
 * Absorve blocos curtos demais no anterior. Nunca descarta: a palavra
 * foi dita. Sem anterior, o bloco e esticado -- esticar o tempo de
 * leitura nao altera o que foi dito.
 */
function juntarCurtos(blocos: BlocoDeLegenda[]): BlocoDeLegenda[] {
  const saida: BlocoDeLegenda[] = [];

  for (const bloco of blocos) {
    const curto = bloco.fimMs - bloco.inicioMs < DURACAO_MINIMA_MS;
    const anterior = saida[saida.length - 1];

    // Uma legenda manual nunca é absorvida (nem absorve): ela tem id
    // próprio, e a timeline precisa achá-la para editar.
    if (curto && anterior && !anterior.manualId && !bloco.manualId) {
      anterior.palavras.push(...bloco.palavras);
      anterior.fimMs = Math.max(anterior.fimMs, bloco.fimMs);
      anterior.wordIds = [...(anterior.wordIds ?? []), ...(bloco.wordIds ?? [])];
      continue;
    }

    if (curto) {
      saida.push({ ...bloco, fimMs: bloco.inicioMs + DURACAO_MINIMA_MS });
      continue;
    }

    saida.push(bloco);
  }

  return saida;
}

// ---------- Formato .ass ----------

/** `H:MM:SS.cc` -- o formato que o .ass exige, em centesimos. */
export function tempoAss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 10));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6_000) % 60;
  const h = Math.floor(total / 360_000);
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${h}:${dois(m)}:${dois(s)}.${dois(cs)}`;
}

/**
 * `#RRGGBB` para `&HAABBGGRR` -- o .ass usa BGR, ao contrario, e alfa
 * invertido (00 opaco, FF transparente).
 *
 * Trocar a ordem nao da erro: faz o azul da marca sair vermelho.
 */
export function corAss(hex: string, opacidade = 1): string {
  const limpo = hex.replace('#', '');
  const r = limpo.slice(0, 2);
  const g = limpo.slice(2, 4);
  const b = limpo.slice(4, 6);
  const alfa = Math.round((1 - Math.min(1, Math.max(0, opacidade))) * 255)
    .toString(16)
    .padStart(2, '0');
  return `&H${alfa}${b}${g}${r}`.toUpperCase();
}

/** A cor para uma tag de override (`\c`), sem o canal alfa. */
function corTag(hex: string): string {
  const limpo = hex.replace('#', '');
  return `&H${limpo.slice(4, 6)}${limpo.slice(2, 4)}${limpo.slice(0, 2)}&`.toUpperCase();
}

/** Alinhamento numerado do .ass: 2 baixo, 5 meio, 8 topo (centralizados). */
function alinhamento(posicao: EstiloResolvido['posicao']): number {
  if (posicao === 'top') return 8;
  if (posicao === 'center') return 5;
  return 2;
}

/**
 * Escapa o que o .ass interpreta como comando.
 *
 * `{` e `}` delimitam tags de estilo; uma quebra de linha corromperia
 * o evento, que e uma linha so. Emoji sai: o libass nao desenha emoji
 * colorido, e o que apareceria no video seria um quadrado vazio.
 */
export function escaparAss(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Margens da legenda no quadro, por posicao. */
function margens(plano: EditPlanV1, posicao: EstiloResolvido['posicao'], baseY?: number) {
  const { width, height } = plano.canvas;
  if (baseY !== undefined) return { h: Math.round(width * 0.06), v: Math.round(height * (1 - baseY)) };
  return {
    h: Math.round(width * 0.06),
    // Embaixo, 24% da altura: acima da faixa onde Reels, TikTok e
    // Shorts poem legenda do post, nome do perfil e botoes. Em cima,
    // 14%: abaixo do cabecalho das redes.
    v: posicao === 'bottom' ? Math.round(height * 0.24) : posicao === 'top' ? Math.round(height * 0.14) : 0,
  };
}

interface LinhaDeEstilo {
  nome: string;
  fonte: string;
  tamanho: number;
  primaria: string;
  secundaria: string;
  contorno: string;
  fundo: string;
  negrito: boolean;
  borda: 1 | 3;
  larguraDoContorno: number;
  sombra: number;
  alinhamento: number;
  margemH: number;
  margemV: number;
}

function linhaDeEstilo(e: LinhaDeEstilo): string {
  return [
    `Style: ${e.nome}`,
    e.fonte,
    String(e.tamanho),
    e.primaria,
    e.secundaria,
    e.contorno,
    e.fundo,
    e.negrito ? '-1' : '0',
    '0',
    '0',
    '0',
    '100',
    '100',
    '0',
    '0',
    String(e.borda),
    String(e.larguraDoContorno),
    String(e.sombra),
    String(e.alinhamento),
    String(e.margemH),
    String(e.margemH),
    String(e.margemV),
    '1',
  ].join(',');
}

/**
 * Um evento. Exatamente nove campos, na ordem do `Format:`.
 *
 * Uma virgula a mais NAO e erro de sintaxe: o libass trata o excedente
 * como inicio do texto, e a virgula aparece QUEIMADA antes da primeira
 * palavra -- medido num quadro extraido do mp4.
 */
function dialogo(camada: number, inicioMs: number, fimMs: number, estilo: string, texto: string): string {
  return [
    `Dialogue: ${camada}`,
    tempoAss(inicioMs),
    tempoAss(fimMs),
    estilo,
    '',
    '0',
    '0',
    '',
    texto,
  ].join(',');
}

// ---------- Legendas ----------

function estilosDaLegenda(plano: EditPlanV1, e: EstiloResolvido): string[] {
  const m = margens(plano, e.posicao, e.baseY);
  const karaoke = e.animacao === 'karaoke';
  const sombraOpaca = e.sombra ? corAss(e.sombra.cor, e.sombra.opacidade) : '&H64000000';

  const principal: LinhaDeEstilo = {
    nome: 'Makucho',
    fonte: e.fonte.nomeAss,
    tamanho: e.tamanhoPx,
    // No karaoke, a PRIMARIA e a cor depois que a fala passa e a
    // SECUNDARIA a de antes: e a cor da marca que "preenche" a
    // palavra. Invertido, as palavras ainda nao ditas ficariam
    // destacadas -- o defeito que a versao anterior tinha.
    primaria: corAss(karaoke ? e.corDestaque : e.cor),
    secundaria: corAss(e.cor),
    contorno: e.fundo ? corAss(e.fundo.cor, e.fundo.opacidade) : corAss(e.contorno.cor),
    fundo: sombraOpaca,
    negrito: e.fonte.negrito,
    // BorderStyle 3 desenha uma caixa no lugar do contorno: e a faixa
    // do estilo podcast. O resto usa contorno de verdade.
    borda: e.fundo ? 3 : 1,
    larguraDoContorno: e.fundo ? e.fundo.margem : e.contorno.largura,
    sombra: e.sombra ? e.sombra.distancia : 0,
    alinhamento: alinhamento(e.posicao),
    margemH: m.h,
    margemV: m.v,
  };

  const linhas = [linhaDeEstilo(principal)];

  if (e.caixaAtiva) {
    // A caixa da palavra ativa e uma segunda camada, com caixa
    // (BorderStyle 3) transparente em todas as palavras menos na
    // falada. A primeira camada continua desenhando o contorno de
    // todas -- sem ela, o texto fora da caixa ficaria sem contorno e
    // sumiria sobre fundo claro.
    linhas.push(
      linhaDeEstilo({
        ...principal,
        nome: 'MakuchoCaixa',
        contorno: corAss(e.caixaAtiva.cor),
        fundo: '&HFF000000',
        borda: 3,
        larguraDoContorno: e.caixaAtiva.margem,
        sombra: 0,
      }),
    );
  }

  return linhas;
}

/** Posicao absoluta do bloco, para animacoes com \move. */
function ancora(plano: EditPlanV1, e: EstiloResolvido) {
  const { width, height } = plano.canvas;
  const m = margens(plano, e.posicao, e.baseY);
  const x = Math.round(width / 2);
  const y = e.posicao === 'bottom' ? height - m.v : e.posicao === 'top' ? m.v : Math.round(height / 2);
  return { x, y };
}

function eventosDaLegenda(plano: EditPlanV1, e: EstiloResolvido, blocos: BlocoDeLegenda[]): string[] {
  const destacar = plano.captions.highlightActiveWord;
  const animacao =
    !destacar && ['palavra_ativa', 'pop', 'caixa_ativa', 'karaoke'].includes(e.animacao) ? 'nenhuma' : e.animacao;
  const brilho = e.brilho > 0 ? `{\\blur${e.brilho}}` : '';
  const eventos: string[] = [];

  for (const bloco of blocos) {
    const palavras = bloco.palavras.map((p) => ({ ...p, texto: escaparAss(p.texto) }));

    if (animacao === 'nenhuma') {
      eventos.push(dialogo(0, bloco.inicioMs, bloco.fimMs, 'Makucho', brilho + palavras.map((p) => p.texto).join(' ')));
      continue;
    }

    if (animacao === 'karaoke') {
      // Centesimos, com minimo de 1: `\kf0` nao acende nunca.
      const texto = palavras
        .map((p) => `{\\kf${Math.max(1, Math.round(p.duracaoMs / 10))}}${p.texto}`)
        .join(' ');
      eventos.push(dialogo(0, bloco.inicioMs, bloco.fimMs, 'Makucho', brilho + texto));
      continue;
    }

    if (animacao === 'subir') {
      const { x, y } = ancora(plano, e);
      const entrada = `{\\fad(160,120)\\move(${x},${y + 42},${x},${y},0,200)}`;
      eventos.push(dialogo(0, bloco.inicioMs, bloco.fimMs, 'Makucho', entrada + brilho + palavras.map((p) => p.texto).join(' ')));
      continue;
    }

    if (animacao === 'uma_palavra') {
      // Um evento por palavra, cada uma entrando com pop. O bloco ja
      // tem uma palavra so; o laco cobre o caso de um bloco curto que
      // absorveu o seguinte.
      palavras.forEach((p, i) => {
        const inicio = i === 0 ? bloco.inicioMs : p.inicioMs;
        const fim = i === palavras.length - 1 ? bloco.fimMs : palavras[i + 1]!.inicioMs;
        if (fim <= inicio) return;
        eventos.push(
          dialogo(0, inicio, fim, 'Makucho', `{\\fscx72\\fscy72\\t(0,110,\\fscx106\\fscy106)\\t(110,190,\\fscx100\\fscy100)}${brilho}${p.texto}`),
        );
      });
      continue;
    }

    // palavra_ativa, pop e caixa_ativa: o bloco inteiro fica na tela, e
    // cada palavra vira um evento proprio enquanto e falada. Mais
    // previsivel que o karaoke para destacar UMA palavra: o \k so sabe
    // preencher, nao sabe apagar a anterior.
    palavras.forEach((ativa, i) => {
      const inicio = i === 0 ? bloco.inicioMs : ativa.inicioMs;
      const fim = i === palavras.length - 1 ? bloco.fimMs : palavras[i + 1]!.inicioMs;
      if (fim <= inicio) return;

      if (animacao === 'caixa_ativa') {
        const contorno = palavras.map((p) => p.texto).join(' ');
        const caixa = palavras
          .map((p, j) => (j === i ? `{\\3a&H00&}${p.texto}{\\3a&HFF&}` : p.texto))
          .join(' ');
        eventos.push(dialogo(0, inicio, fim, 'Makucho', brilho + contorno));
        eventos.push(dialogo(1, inicio, fim, 'MakuchoCaixa', `{\\3a&HFF&\\bord${e.caixaAtiva?.margem ?? 14}\\shad0}` + caixa));
        return;
      }

      const escala = Math.round(e.escalaAtiva * 100);
      const destaque =
        animacao === 'pop'
          ? `{\\c${corTag(e.corDestaque)}\\fscx72\\fscy72\\t(0,90,\\fscx${escala + 12}\\fscy${escala + 12})\\t(90,170,\\fscx${escala}\\fscy${escala})}`
          : `{\\c${corTag(e.corDestaque)}${escala !== 100 ? `\\fscx${escala}\\fscy${escala}` : ''}}`;

      const texto = palavras
        .map((p, j) => (j === i ? `${destaque}${p.texto}{\\r}${brilho}` : p.texto))
        .join(' ');
      eventos.push(dialogo(0, inicio, fim, 'Makucho', brilho + texto));
    });
  }

  return eventos;
}

// ---------- Textos de tela (overlays) ----------

/** Componentes que o .ass desenha. Logo e imagem sao do render. */
export const OVERLAYS_DE_TEXTO = ['HookTitle', 'CTA', 'LowerThird', 'QuoteCard', 'StatCard', 'ProgressBar', 'Destaque'] as const;

/** Tamanho base do texto de destaque, antes do `sizeScale`. */
export const TAMANHO_DO_DESTAQUE = 92;

/** Posição padrão de um destaque novo: terço de cima, longe da legenda. */
export const POSICAO_PADRAO_DO_DESTAQUE = { x: 0.5, y: 0.3 } as const;

/** Textos que passam ao desenho novo quando ganham um estilo. */
const TEXTOS_COM_ESTILO = new Set(['HookTitle', 'CTA', 'LowerThird', 'QuoteCard', 'StatCard']);

function estilosDosTextos(plano: EditPlanV1, marca: MarcaDoVideo): string[] {
  const { width, height } = plano.canvas;
  const titulo = fonteDaFamilia(marca.fonteTitulo, 'montserrat');
  const corpo = fonteDaFamilia(marca.fonteCorpo, 'inter');
  const cores = marca.cores ?? CORES_PADRAO_DA_MARCA;
  const margemH = Math.round(width * 0.08);

  const base = {
    secundaria: corAss('#FFFFFF'),
    fundo: '&H80000000',
    borda: 3 as const,
    sombra: 0,
    margemH,
  };

  return [
    linhaDeEstilo({
      ...base,
      nome: 'Titulo',
      fonte: titulo.nomeAss,
      negrito: titulo.negrito,
      tamanho: 86,
      primaria: corAss('#FFFFFF'),
      contorno: corAss(cores.primary),
      larguraDoContorno: 22,
      alinhamento: 8,
      margemV: Math.round(height * 0.15),
    }),
    linhaDeEstilo({
      ...base,
      nome: 'Chamada',
      fonte: titulo.nomeAss,
      negrito: titulo.negrito,
      tamanho: 74,
      primaria: corAss('#FFFFFF'),
      contorno: corAss(cores.primary),
      larguraDoContorno: 20,
      alinhamento: 2,
      // Acima da legenda (que fica em 24%), para as duas nao se
      // cobrirem nos segundos finais.
      margemV: Math.round(height * 0.4),
    }),
    linhaDeEstilo({
      ...base,
      nome: 'Rodape',
      fonte: corpo.nomeAss,
      negrito: corpo.negrito,
      tamanho: 48,
      primaria: corAss('#FFFFFF'),
      contorno: corAss(cores.textDark, 0.88),
      larguraDoContorno: 16,
      alinhamento: 1,
      margemV: Math.round(height * 0.36),
    }),
    linhaDeEstilo({
      ...base,
      nome: 'Cartao',
      fonte: titulo.nomeAss,
      negrito: titulo.negrito,
      tamanho: 68,
      primaria: corAss('#FFFFFF'),
      contorno: corAss(cores.textDark, 0.84),
      larguraDoContorno: 34,
      alinhamento: 5,
      margemV: 0,
    }),
    // Texto de destaque: contorno (padrão) e caixa (BorderStyle 3 só
    // existe por estilo, então a decoração "caixa"/"marca-texto" usa
    // este segundo). Fonte, tamanho, cor e posição vêm por evento.
    linhaDeEstilo({
      ...base,
      nome: 'Destaque',
      fonte: titulo.nomeAss,
      negrito: titulo.negrito,
      tamanho: TAMANHO_DO_DESTAQUE,
      primaria: corAss('#FFFFFF'),
      contorno: corAss('#000000'),
      fundo: '&H00000000',
      borda: 1,
      larguraDoContorno: 7,
      alinhamento: 5,
      margemV: 0,
    } as LinhaDeEstilo),
    linhaDeEstilo({
      ...base,
      nome: 'DestaqueCaixa',
      fonte: titulo.nomeAss,
      negrito: titulo.negrito,
      tamanho: TAMANHO_DO_DESTAQUE,
      primaria: corAss('#FFFFFF'),
      contorno: corAss(cores.primary),
      borda: 3,
      larguraDoContorno: 18,
      alinhamento: 5,
      margemV: 0,
    }),
    // Textos de tela com estilo próprio (textos-de-tela.ts): fonte,
    // cores, contorno e posição vêm por evento; o fundo é uma forma
    // vetorial desenhada num evento à parte.
    linhaDeEstilo({
      ...base,
      nome: 'TextoDeTela',
      fonte: titulo.nomeAss,
      negrito: titulo.negrito,
      tamanho: TAMANHO_DO_DESTAQUE,
      primaria: corAss('#FFFFFF'),
      contorno: corAss('#000000'),
      fundo: '&H00000000',
      borda: 1,
      larguraDoContorno: 0,
      alinhamento: 5,
      margemV: 0,
    } as LinhaDeEstilo),
    linhaDeEstilo({
      ...base,
      nome: 'Barra',
      fonte: titulo.nomeAss,
      negrito: false,
      tamanho: 20,
      primaria: corAss(cores.primary),
      contorno: corAss(cores.primary),
      borda: 1,
      larguraDoContorno: 0,
      alinhamento: 7,
      margemV: 0,
    } as LinhaDeEstilo),
  ];
}

function eventosDosTextos(plano: EditPlanV1, duracaoMs: number, marca: MarcaDoVideo): string[] {
  const { width } = plano.canvas;
  const eventos: string[] = [];

  for (const o of plano.overlays) {
    const inicio = o.timelineStartMs;
    const fim = Math.min(o.timelineStartMs + o.durationMs, duracaoMs);
    if (fim <= inicio) continue;

    // `\q0`: estes textos podem ter duas linhas, e a quebra
    // inteligente evita que saiam pela borda.
    const texto = escaparAss(o.text ?? '');

    // Com estilo próprio (sempre, no destaque), o desenho completo:
    // fundo em forma, entrada, animação durante e saída.
    if (o.component === 'Destaque' || (o.style && TEXTOS_COM_ESTILO.has(o.component))) {
      eventos.push(...eventosDoTextoDeTela(plano, o, inicio, fim, marca));
      continue;
    }

    switch (o.component) {
      case 'HookTitle':
        if (!texto) break;
        eventos.push(
          dialogo(5, inicio, fim, 'Titulo', `{\\q0\\fad(0,220)\\fscx60\\fscy60\\t(0,150,\\fscx106\\fscy106)\\t(150,240,\\fscx100\\fscy100)}${texto}`),
        );
        break;
      case 'CTA': {
        if (!texto) break;
        eventos.push(dialogo(5, inicio, fim, 'Chamada', `{\\q0\\fad(180,0)\\fscx88\\fscy88\\t(0,200,\\fscx100\\fscy100)}${texto}`));
        break;
      }
      case 'LowerThird': {
        if (!texto) break;
        // "Nome | cargo": a segunda parte, menor, na linha de baixo.
        const [nome, cargo] = texto.split('|').map((s) => s.trim());
        const corpo = cargo ? `${nome}\\N{\\fs36}${cargo}` : nome;
        eventos.push(dialogo(5, inicio, fim, 'Rodape', `{\\q0\\fad(200,200)}${corpo}`));
        break;
      }
      case 'QuoteCard':
        if (!texto) break;
        eventos.push(dialogo(5, inicio, fim, 'Cartao', `{\\q0\\fad(220,220)}“${texto}”`));
        break;
      case 'StatCard': {
        if (!texto) break;
        // "87% | dos clientes voltam": o numero grande em cima.
        const [numero, legenda] = texto.split('|').map((s) => s.trim());
        const corpo = legenda ? `{\\fs150}${numero}\\N{\\fs54}${legenda}` : `{\\fs150}${numero}`;
        eventos.push(dialogo(5, inicio, fim, 'Cartao', `{\\q0\\fad(200,200)}${corpo}`));
        break;
      }
      case 'ProgressBar': {
        // Um retangulo vetorial no topo, revelado por um \clip que
        // cresce ao longo do video inteiro: uma linha, sem filtro
        // extra no FFmpeg.
        const d = fim - inicio;
        eventos.push(
          dialogo(
            6,
            inicio,
            fim,
            'Barra',
            `{\\an7\\pos(0,0)\\bord0\\shad0\\clip(0,0,0,12)\\t(0,${d},\\clip(0,0,${width},12))\\p1}m 0 0 l ${width} 0 ${width} 12 0 12{\\p0}`,
          ),
        );
        break;
      }
      default:
        // LogoBug e ImageOverlay sao do FFmpeg; AnimatedCaption e
        // EmojiPop nao sao desenhados (ver edit-plan.ts).
        break;
    }
  }

  return eventos;
}

/** Duracao do resultado, somando os trechos ligados. */
function duracaoDoVideo(plano: EditPlanV1, desligados: readonly string[] = []): number {
  const fora = new Set(desligados);
  return plano.clips.filter((c) => !fora.has(c.id)).reduce((t, c) => t + (c.sourceEndMs - c.sourceStartMs), 0);
}

/** O plano tem algo para o .ass desenhar? */
export function planoPrecisaDeAss(plano: EditPlanV1): boolean {
  return (
    plano.captions.enabled ||
    plano.overlays.some((o) => (OVERLAYS_DE_TEXTO as readonly string[]).includes(o.component))
  );
}

/**
 * O arquivo .ass completo: legendas e textos de tela.
 *
 * `PlayResX`/`PlayResY` batem com o canvas do plano. Sem isso o libass
 * escala a fonte por conta propria e o tamanho do estilo deixa de
 * valer.
 */
export function gerarAss(opcoes: OpcoesDoAss): string {
  const camada = opcoes.camada ?? 'tudo';
  const plano =
    camada === 'tudo'
      ? opcoes.plano
      : {
          ...opcoes.plano,
          captions: camada === 'atras' ? { ...opcoes.plano.captions, enabled: false } : opcoes.plano.captions,
          overlays: opcoes.plano.overlays.filter((o) => (camada === 'atras' ? ehTextoAtras(o) : !ehTextoAtras(o))),
        };
  opcoes = { ...opcoes, plano };
  const estilo = paraResolvido(opcoes.estilo, plano);
  const marca: MarcaDoVideo = opcoes.marca ?? { cores: CORES_PADRAO_DA_MARCA };
  const { width, height } = plano.canvas;

  const cabecalho = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    // Sem isso o contorno nao acompanha a escala, e a legenda muda de
    // espessura entre a previa (tela pequena) e o arquivo.
    'ScaledBorderAndShadow: yes',
    // Quebra inteligente com a linha de baixo mais larga: o bloco
    // passa de uma linha para duas em vez de sair pela borda.
    'WrapStyle: 3',
    'YCbCr Matrix: None',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour,' +
      ' OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut,' +
      ' ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow,' +
      ' Alignment, MarginL, MarginR, MarginV, Encoding',
    ...estilosDaLegenda(plano, estilo),
    ...estilosDosTextos(plano, marca),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text',
  ];

  const legendas = plano.captions.enabled ? eventosDaLegenda(plano, estilo, montarBlocos(opcoes)) : [];
  const textos = eventosDosTextos(plano, duracaoDoVideo(plano, opcoes.clipsDesligados), marca);

  return [...cabecalho, ...legendas, ...textos, ''].join('\n');
}
