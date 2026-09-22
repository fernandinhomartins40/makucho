// ============================================================
// MAKUCHO STUDIO - Legendas queimadas (resto da Fase 6).
//
// A REGRA QUE DEFINE ESTE ARQUIVO: a legenda nao e escrita, e
// DERIVADA. Cada palavra exibida vem de uma `TranscriptWord` com
// timestamp proprio, produzida pelo whisper a partir do audio.
// Nenhuma funcao aqui aceita texto de fora, e isso e deliberado:
// legenda que nao foi dita e a mesma violacao que a IA inventar fala
// (contexto mestre, secao 5), com o agravante de ficar QUEIMADA no
// arquivo -- sem como corrigir depois de publicado.
//
// POR QUE .ass E NAO `drawtext`
//
// O `drawtext` precisaria de um filtro por bloco de palavras, cada um
// com `enable='between(t,...)'`. Um video de 60s com 3 palavras por
// bloco da perto de 60 filtros, e o filter_complex -- que ja carrega
// um trim e um atrim por clip -- viraria uma linha de milhares de
// caracteres. Pior: `drawtext` nao tem como destacar a palavra ativa
// dentro de um bloco, que e justamente o estilo que prende atencao.
//
// O .ass resolve os tres: karaoke nativo (`\k`), contorno e posicao
// no proprio estilo, e o texto vive num ARQUIVO -- nada dele entra na
// linha de comando, o que fecha a porta para injecao de argumento.
// ============================================================

import type { CaptionStyleInput, EditPlanV1 } from '@makucho/studio-contracts';

/** Uma palavra da transcricao, com o tempo que o whisper mediu. */
export interface PalavraDaTranscricao {
  /**
   * Id da `TranscriptWord`. E a ancora das correcoes manuais.
   *
   * Opcional porque o gerador funciona sem ele -- uma legenda sem
   * correcao nenhuma nao precisa de id. Mas sem id a palavra nao PODE
   * ser corrigida, e e por isso que o worker sempre o envia.
   */
  id?: string;
  /** Tempo no arquivo ORIGINAL, nao na timeline do resultado. */
  startMs: number;
  endMs: number;
  word: string;
}

export interface OpcoesDasLegendas {
  plano: EditPlanV1;
  estilo: CaptionStyleInput;
  /** Palavras do original, de onde cada legenda e derivada. */
  palavras: readonly PalavraDaTranscricao[];
  clipsDesligados?: readonly string[];
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
  palavras: Array<{ texto: string; duracaoMs: number }>;
}

/**
 * Maximo de caracteres por bloco.
 *
 * `wordsPerBlock` conta palavras, e palavra nao tem largura fixa:
 * tres palavras curtas cabem, tres longas estouram a tela num canvas
 * de 1080 de largura. O teto por caractere e o que impede a legenda
 * de sair pela borda -- e sair pela borda em video vertical significa
 * texto cortado, nao texto pequeno.
 */
const MAX_CARACTERES_POR_BLOCO = 42;

/**
 * Folga minima para um bloco ser exibido.
 *
 * Bloco de menos de 300ms pisca: aparece e sai antes de ser lido. Ele
 * e absorvido pelo bloco anterior em vez de descartado, porque
 * descartar apagaria fala que foi dita.
 */
const DURACAO_MINIMA_MS = 300;

/**
 * Agrupa as palavras em blocos, no tempo da timeline.
 *
 * Exportada separada da geracao do .ass para ser testavel sem
 * inspecionar texto formatado: o que pode dar errado aqui e a
 * matematica de tempo, e conferir numeros e mais confiavel do que
 * procurar por substring num arquivo.
 */
export function montarBlocos(opcoes: OpcoesDasLegendas): BlocoDeLegenda[] {
  const { plano, estilo, palavras } = opcoes;
  const desligados = new Set(opcoes.clipsDesligados ?? []);

  const clips = plano.clips
    .filter((c) => !desligados.has(c.id))
    .sort((a, b) => a.timelineStartMs - b.timelineStartMs);

  const blocos: BlocoDeLegenda[] = [];

  // As correcoes manuais, indexadas por palavra. O whisper erra nome
  // proprio, jargao e sigla, e sem isso o erro ia QUEIMADO no arquivo
  // sem recurso.
  //
  // Elas trocam o TEXTO e nada mais: o tempo continua o da palavra
  // falada, porque o que se corrige e a grafia, nao o momento. E o
  // que faz a correcao ficar no frame certo sem ninguem digitar
  // tempo nenhum.
  const correcoes = new Map(plano.captions.corrections.map((c) => [c.wordId, c.text]));

  // O tempo de timeline e recalculado clip a clip, acumulando as
  // duracoes, em vez de lido de `timelineStartMs`. Motivo concreto:
  // com clips desligados, o `timelineStartMs` do plano deixa de
  // descrever o resultado -- ele descreve onde o clip estaria se
  // nada tivesse sido desligado, e o render concatena o que sobrou.
  // Usar o campo produziria legenda adiantada pelo tamanho exato do
  // que o usuario desligou.
  let inicioNaTimeline = 0;

  for (const clip of clips) {
    const duracaoDoClip = clip.sourceEndMs - clip.sourceStartMs;

    // Somente as palavras que caem DENTRO do trecho. Uma palavra que
    // comeca antes do corte e termina depois dele foi cortada no
    // meio: exibi-la inteira legendaria som que nao esta no
    // resultado.
    const doClip = palavras
      .filter((p) => p.startMs >= clip.sourceStartMs && p.endMs <= clip.sourceEndMs)
      .sort((a, b) => a.startMs - b.startMs);

    let atual: BlocoDeLegenda | null = null;
    let caracteres = 0;

    for (const palavra of doClip) {
      // A correcao tem precedencia sobre o que o whisper ouviu. Uma
      // palavra sem id nao pode ser corrigida -- e o worker sempre
      // envia o id, justamente para que possa.
      const corrigido = palavra.id ? correcoes.get(palavra.id) : undefined;
      const texto = (corrigido ?? palavra.word).trim();
      if (!texto) continue;

      // Deslocamento dentro do clip, somado a onde o clip comecou na
      // timeline: e a mesma conta que o `setpts=PTS-STARTPTS` faz no
      // video, refeita aqui para a legenda acompanhar.
      const inicio = inicioNaTimeline + (palavra.startMs - clip.sourceStartMs);
      const fim = inicioNaTimeline + (palavra.endMs - clip.sourceStartMs);

      const cabeEmPalavras = atual !== null && atual.palavras.length < estilo.wordsPerBlock;
      const cabeEmCaracteres = caracteres + texto.length + 1 <= MAX_CARACTERES_POR_BLOCO;

      if (atual && cabeEmPalavras && cabeEmCaracteres) {
        atual.palavras.push({ texto, duracaoMs: Math.max(1, fim - atual.fimMs) });
        atual.fimMs = fim;
        caracteres += texto.length + 1;
        continue;
      }

      atual = {
        inicioMs: inicio,
        fimMs: fim,
        palavras: [{ texto, duracaoMs: Math.max(1, fim - inicio) }],
      };
      caracteres = texto.length;
      blocos.push(atual);
    }

    inicioNaTimeline += duracaoDoClip;
  }

  return juntarCurtos(blocos);
}

/**
 * Absorve blocos curtos demais no anterior.
 *
 * Nunca descarta: a palavra foi dita, e nao exibi-la faria a legenda
 * mentir por omissao. Quando nao ha anterior -- o primeiro bloco e
 * curto -- ele e esticado, porque esticar o tempo de leitura nao
 * altera o que foi dito.
 */
function juntarCurtos(blocos: BlocoDeLegenda[]): BlocoDeLegenda[] {
  const saida: BlocoDeLegenda[] = [];

  for (const bloco of blocos) {
    const curto = bloco.fimMs - bloco.inicioMs < DURACAO_MINIMA_MS;
    const anterior = saida[saida.length - 1];

    if (curto && anterior) {
      anterior.palavras.push(...bloco.palavras);
      anterior.fimMs = bloco.fimMs;
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

// ---------- Geracao do .ass ----------

/** `H:MM:SS.cc` -- o formato que o .ass exige, em centesimos. */
function tempoAss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 10)); // centesimos
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6_000) % 60;
  const h = Math.floor(total / 360_000);

  const dois = (n: number) => String(n).padStart(2, '0');
  return `${h}:${dois(m)}:${dois(s)}.${dois(cs)}`;
}

/**
 * `#RRGGBB` para `&HBBGGRR&` -- o .ass usa BGR, na ordem invertida.
 *
 * Nao e detalhe de formatacao: trocar a ordem faz a cor primaria da
 * marca sair como outra cor, sem erro nenhum. Azul vira vermelho, e
 * o video sai com a identidade errada.
 */
function corAss(hex: string): string {
  const limpo = hex.replace('#', '');
  const r = limpo.slice(0, 2);
  const g = limpo.slice(2, 4);
  const b = limpo.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/** Alinhamento numerado do .ass: 2 baixo, 5 meio, 8 topo (centralizados). */
function alinhamento(position: CaptionStyleInput['position']): number {
  if (position === 'top') return 8;
  if (position === 'center') return 5;
  return 2;
}

/**
 * Escapa o que o .ass interpreta como comando.
 *
 * `{` e `}` delimitam tags de estilo: uma palavra transcrita que
 * contenha uma chave -- improvavel em fala, mas possivel -- viraria
 * comando de formatacao. O texto vem da transcricao e nao do usuario,
 * o que reduz o risco, nao o elimina: o whisper transcreve o que
 * ouve, e nada garante que nunca produza uma chave.
 */
function escaparAss(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    // Quebra de linha dentro de um evento .ass corromperia o arquivo:
    // cada Dialogue e uma linha.
    .replace(/[\r\n]+/g, ' ');
}

/**
 * O arquivo .ass completo.
 *
 * `PlayResX`/`PlayResY` batem com o canvas do plano. Sem isso o
 * libass escala a fonte por conta propria e o `fontSizePx` da marca
 * deixa de valer -- a legenda sai de um tamanho que ninguem escolheu.
 */
export function gerarAss(opcoes: OpcoesDasLegendas): string {
  const { plano, estilo } = opcoes;
  const blocos = montarBlocos(opcoes);

  const { width, height } = plano.canvas;

  // Margem vertical proporcional: 8% da altura. Em 1920 da 154px, o
  // suficiente para a legenda nao encostar na borda nem cair sobre a
  // area onde as redes sociais colocam a propria interface.
  const margemV = Math.round(height * 0.08);
  const margemH = Math.round(width * 0.06);

  const corPrimaria = corAss(estilo.color);
  const corBorda = corAss(estilo.strokeColor ?? '#000000');
  // A cor de destaque e a que a palavra ativa assume. Sem ela
  // configurada, cai na primaria -- o karaoke fica sem efeito visual
  // em vez de exibir uma cor arbitraria que nao esta na marca.
  const corDestaque = corAss(estilo.highlightColor ?? estilo.color);

  const cabecalho = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    // Sem isso o libass pode reposicionar o texto conforme a fonte
    // disponivel, e a posicao pedida na marca deixa de ser respeitada.
    'ScaledBorderAndShadow: yes',
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour,' +
      ' OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut,' +
      ' ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow,' +
      ' Alignment, MarginL, MarginR, MarginV, Encoding',
    [
      'Style: Makucho',
      estilo.fontFamily,
      String(estilo.fontSizePx),
      corPrimaria,
      // `SecondaryColour` e a cor de ANTES do karaoke passar; a
      // primaria e a de depois. Invertido, o destaque acenderia na
      // palavra errada.
      corDestaque,
      corBorda,
      '&H64000000', // sombra semitransparente
      '-1', // negrito: legenda de video social sem peso desaparece no fundo claro
      '0',
      '0',
      '0',
      '100',
      '100',
      '0',
      '0',
      '1', // BorderStyle 1: contorno, nao caixa opaca
      String(estilo.strokeWidthPx),
      '1',
      String(alinhamento(estilo.position)),
      String(margemH),
      String(margemH),
      String(margemV),
      '1',
    ].join(','),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text',
  ];

  const eventos = blocos.map((bloco) => {
    const texto = montarTextoDoBloco(bloco, opcoes.plano);
    // Exatamente nove campos, na ordem do `Format:` acima:
    // Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text.
    //
    // Uma virgula a mais NAO e erro de sintaxe: o libass trata o
    // excedente como inicio do texto, e a virgula aparece QUEIMADA
    // antes da primeira palavra. Medido -- o quadro extraido do mp4
    // mostrava ",Atencao nao perca".
    return [
      `Dialogue: 0`,
      tempoAss(bloco.inicioMs),
      tempoAss(bloco.fimMs),
      'Makucho',
      '', // Name
      '0', // MarginL
      '0', // MarginR
      '', // Effect
      texto,
    ].join(',');
  });

  return [...cabecalho, ...eventos, ''].join('\n');
}

/**
 * O texto de um bloco, com ou sem karaoke.
 *
 * Com `highlightActiveWord`, cada palavra recebe `\kf` com a propria
 * duracao em centesimos -- e assim que o .ass acende palavra por
 * palavra dentro de um bloco que fica parado na tela. Sem isso, o
 * bloco inteiro aparece de uma vez.
 */
function montarTextoDoBloco(bloco: BlocoDeLegenda, plano: EditPlanV1): string {
  if (!plano.captions.highlightActiveWord) {
    return bloco.palavras.map((p) => escaparAss(p.texto)).join(' ');
  }

  return bloco.palavras
    .map((p) => {
      // Centesimos, com minimo de 1: `\kf0` nao acende nunca, e uma
      // palavra que nao acende num bloco em karaoke aparece apagada
      // do inicio ao fim.
      const cs = Math.max(1, Math.round(p.duracaoMs / 10));
      return `{\\kf${cs}}${escaparAss(p.texto)}`;
    })
    .join(' ');
}
