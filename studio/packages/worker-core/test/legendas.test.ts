// ============================================================
// As legendas queimadas.
//
// O que pode dar errado aqui não falha: produz legenda
// dessincronizada, que é PIOR que legenda nenhuma — ela contradiz o
// que se ouve. Os testes conferem a aritmética de tempo, não a
// aparência do texto.
//
// O caso mais perigoso é o clip desligado: `timelineStartMs` deixa de
// descrever o resultado, e usá-lo adiantaria a legenda pelo tamanho
// exato do que o usuário desligou.
// ============================================================

import { gerarAss, montarBlocos } from '../src/legendas';
import { escaparCaminhoDeFiltro, montarArgumentos } from '../src/render';
import type { PalavraDaTranscricao } from '../src/legendas';
import type { CaptionStyleInput, EditPlanV1 } from '@makucho/studio-contracts';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// Dois clips, cada um de 4s, tirados de pontos distantes do original.
// A distância é o que torna visível um erro de conversão de tempo.
const plano: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 120_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 12_000,
  framework: 'authority_education',
  clips: [
    {
      id: 'c1',
      sourceStartMs: 10_000,
      sourceEndMs: 14_000,
      timelineStartMs: 0,
      role: 'hook',
      transcriptSegmentIds: ['s1'],
      semanticRisk: 'low',
      reason: 'Abre.',
    },
    {
      id: 'c2',
      sourceStartMs: 60_000,
      sourceEndMs: 64_000,
      timelineStartMs: 4_000,
      role: 'insight',
      transcriptSegmentIds: ['s2'],
      semanticRisk: 'low',
      reason: 'Desenvolve.',
    },
    {
      id: 'c3',
      sourceStartMs: 90_000,
      sourceEndMs: 94_000,
      timelineStartMs: 8_000,
      role: 'cta',
      transcriptSegmentIds: ['s3'],
      semanticRisk: 'low',
      reason: 'Fecha.',
    },
  ],
  captions: {
    enabled: true,
    styleId: 'padrao',
    wordsPerBlock: 3,
    position: 'bottom',
    highlightActiveWord: true,
  },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: {
    fps: 30,
    videoCodec: 'h264',
    audioCodec: 'aac',
    crf: 23,
    audioBitrateKbps: 128,
    loudnessTargetLufs: -14,
  },
};

const estilo: CaptionStyleInput = {
  name: 'Padrao',
  fontFamily: 'Inter',
  fontSizePx: 64,
  color: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidthPx: 3,
  highlightColor: '#2F66FF',
  wordsPerBlock: 3,
  position: 'bottom',
};

/** Palavras de 500ms cada, a partir de um ponto do original. */
const fala = (inicioMs: number, textos: string[]): PalavraDaTranscricao[] =>
  textos.map((word, i) => ({
    startMs: inicioMs + i * 500,
    endMs: inicioMs + i * 500 + 500,
    word,
  }));

const palavras: PalavraDaTranscricao[] = [
  // Dentro do c1 (10s-14s)
  ...fala(10_000, ['Voce', 'esta', 'perdendo', 'cliente', 'todo', 'dia']),
  // Fora de qualquer clip -- não pode aparecer na legenda
  ...fala(30_000, ['isso', 'foi', 'cortado']),
  // Dentro do c2 (60s-64s)
  ...fala(60_000, ['A', 'resposta', 'demora', 'horas', 'e', 'ninguem']),
  // Dentro do c3 (90s-94s)
  ...fala(90_000, ['Comenta', 'AGENDA', 'agora']),
];

// ============================================================
// Conversão de tempo: do original para a timeline
// ============================================================

{
  const blocos = montarBlocos({ plano, estilo, palavras });

  t('há blocos', blocos.length > 0);

  // A primeira palavra do c1 está em 10.000ms no original, e o c1 é o
  // primeiro clip da timeline: a legenda começa em 0, não em 10.000.
  t('o primeiro bloco começa em 0, não no tempo do original', blocos[0]!.inicioMs === 0);

  // O c2 começa em 60.000 no original e cai em 4.000 na timeline (o
  // c1 dura 4s). A palavra "A" está em 60.000, então a legenda entra
  // em 4.000 — não em 60.000, e não em 0.
  const doC2 = blocos.find((b) => b.palavras.some((p) => p.texto === 'resposta'));
  t('o bloco do segundo clip começa em 4000ms', doC2?.inicioMs === 4_000);

  const doC3 = blocos.find((b) => b.palavras.some((p) => p.texto === 'AGENDA'));
  t('o bloco do terceiro clip começa em 8000ms', doC3?.inicioMs === 8_000);

  // Nenhuma legenda pode passar da duração do resultado: 3 clips de
  // 4s dão 12s. Uma legenda em 60s apareceria depois do vídeo acabar.
  t('nenhum bloco passa dos 12s do resultado', blocos.every((b) => b.fimMs <= 12_000));

  // A palavra de 30s não está em clip nenhum.
  const todoOTexto = blocos.flatMap((b) => b.palavras.map((p) => p.texto)).join(' ');
  t('palavra fora dos trechos NÃO aparece na legenda', !todoOTexto.includes('cortado'));
  t('e as palavras dos trechos aparecem', todoOTexto.includes('perdendo'));
}

// ============================================================
// O caso perigoso: clip desligado
// ============================================================

{
  // Desligar o c1 tira 4s do início. O c2 passa a ser o primeiro e
  // deve começar em 0 — se o código usasse `timelineStartMs`, ele
  // começaria em 4.000 e TODA a legenda ficaria 4s adiantada.
  const blocos = montarBlocos({ plano, estilo, palavras, clipsDesligados: ['c1'] });

  const doC2 = blocos.find((b) => b.palavras.some((p) => p.texto === 'resposta'));
  t(
    'com o primeiro clip desligado, o segundo começa em 0',
    doC2?.inicioMs === 0,
  );

  const doC3 = blocos.find((b) => b.palavras.some((p) => p.texto === 'AGENDA'));
  t('e o terceiro começa em 4000, não em 8000', doC3?.inicioMs === 4_000);

  const texto = blocos.flatMap((b) => b.palavras.map((p) => p.texto)).join(' ');
  t('a fala do clip desligado não é legendada', !texto.includes('perdendo'));
}

{
  // Desligar o do MEIO: o c3 sobe para onde o c2 estava.
  const blocos = montarBlocos({ plano, estilo, palavras, clipsDesligados: ['c2'] });
  const doC3 = blocos.find((b) => b.palavras.some((p) => p.texto === 'AGENDA'));
  t('desligando o clip do meio, o último sobe para 4000', doC3?.inicioMs === 4_000);
}

// ============================================================
// Agrupamento
// ============================================================

{
  const blocos = montarBlocos({ plano, estilo, palavras });
  t(
    'nenhum bloco passa de wordsPerBlock',
    blocos.every((b) => b.palavras.length <= estilo.wordsPerBlock),
  );
}

{
  // Palavras longas: 3 delas passariam de 42 caracteres, e em 1080 de
  // largura a legenda sairia pela borda -- texto cortado, não pequeno.
  const longas = fala(10_000, [
    'responsabilidade',
    'inconstitucionalidade',
    'desproporcionalmente',
  ]);
  const blocos = montarBlocos({ plano, estilo, palavras: longas });

  t(
    'palavras longas são quebradas antes de estourar a largura',
    blocos.length > 1,
  );
  t(
    'e cada bloco cabe em 42 caracteres',
    blocos.every((b) => b.palavras.map((p) => p.texto).join(' ').length <= 42),
  );
}

{
  // Uma palavra de 100ms sozinha piscaria. Ela é absorvida, nunca
  // descartada: foi dita, e omiti-la faria a legenda mentir.
  const curta: PalavraDaTranscricao[] = [
    { startMs: 10_000, endMs: 10_600, word: 'primeira' },
    { startMs: 11_000, endMs: 11_100, word: 'ja' },
  ];
  const blocos = montarBlocos({
    plano: { ...plano, captions: { ...plano.captions, wordsPerBlock: 1 } },
    estilo: { ...estilo, wordsPerBlock: 1 },
    palavras: curta,
  });

  const texto = blocos.flatMap((b) => b.palavras.map((p) => p.texto)).join(' ');
  t('palavra curta NÃO é descartada -- ela foi dita', texto.includes('ja'));
  t(
    'e nenhum bloco fica abaixo de 300ms',
    blocos.every((b) => b.fimMs - b.inicioMs >= 300),
  );
}

// ============================================================
// O arquivo .ass
// ============================================================

{
  const ass = gerarAss({ plano, estilo, palavras });

  t('tem cabeçalho de script', ass.includes('[Script Info]'));
  t('tem seção de estilos', ass.includes('[V4+ Styles]'));
  t('tem seção de eventos', ass.includes('[Events]'));

  // Sem PlayRes, o libass escala a fonte por conta própria e o
  // fontSizePx da marca deixa de valer.
  t('declara PlayResX do canvas', ass.includes('PlayResX: 1080'));
  t('declara PlayResY do canvas', ass.includes('PlayResY: 1920'));

  t('usa a fonte da marca', ass.includes('Inter'));
  t('usa o tamanho da marca', ass.includes('64'));

  // BGR e não RGB: trocar a ordem faz a cor da marca sair como outra,
  // sem erro nenhum. #2F66FF (azul) tem de virar &H00FF662F.
  t('a cor de destaque vai em BGR, não RGB', ass.includes('&H00FF662F'));
  t('o branco é indiferente à ordem', ass.includes('&H00FFFFFF'));

  // Alinhamento 2 = inferior centralizado.
  t('a posição "bottom" vira alinhamento 2', /,2,\d+,\d+,\d+,1$/m.test(ass));

  // Karaokê: `\kf` com a duração de cada palavra.
  t('com highlightActiveWord, usa karaokê por palavra', ass.includes('{\\kf'));

  // Os tempos são H:MM:SS.cc
  t('os tempos estão no formato do .ass', /Dialogue: 0,0:00:00\.00,/.test(ass));

  // EXATAMENTE nove campos. Uma vírgula a mais não é erro de sintaxe:
  // o libass trata o excedente como início do texto, e ela aparece
  // QUEIMADA antes da primeira palavra. Foi o que aconteceu — o
  // quadro extraído do mp4 mostrava ",Atenção não perca".
  const dialogos = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  t('há diálogos para conferir', dialogos.length > 0);
  t(
    'cada Dialogue tem exatamente 9 campos',
    // O texto pode conter vírgula, então o split é limitado aos 8
    // primeiros separadores: o nono campo é todo o resto.
    dialogos.every((l) => {
      const antesDoTexto = l.split(',').slice(0, 8);
      return antesDoTexto.length === 8 && antesDoTexto[7] === '';
    }),
  );
  t(
    'o texto do Dialogue começa na palavra, não numa vírgula',
    dialogos.every((l) => {
      const texto = l.split(',').slice(8).join(',');
      return texto.length > 0 && !texto.startsWith(',');
    }),
  );
  t(
    'o número de campos do Dialogue bate com o do Format',
    (() => {
      const formato = ass
        .split('\n')
        .find((l) => l.startsWith('Format: Layer'))!
        .replace('Format: ', '')
        .split(',').length;
      return formato === 9;
    })(),
  );

  // Nenhum evento pode ter o tempo do ORIGINAL: 60s seria 0:01:00.
  t(
    'nenhum evento tem tempo do original (0:01:00)',
    !ass.includes('0:01:00'),
  );
}

{
  // Sem destaque, o bloco aparece inteiro de uma vez.
  const ass = gerarAss({
    plano: { ...plano, captions: { ...plano.captions, highlightActiveWord: false } },
    estilo,
    palavras,
  });
  t('sem highlightActiveWord, não usa karaokê', !ass.includes('{\\kf'));
  t('mas ainda tem os diálogos', ass.includes('Dialogue: 0,'));
}

{
  // `top` e `center` mudam o alinhamento: 8 e 5.
  const topo = gerarAss({ plano, estilo: { ...estilo, position: 'top' }, palavras });
  t('a posição "top" vira alinhamento 8', /,8,\d+,\d+,\d+,1$/m.test(topo));

  const meio = gerarAss({ plano, estilo: { ...estilo, position: 'center' }, palavras });
  t('a posição "center" vira alinhamento 5', /,5,\d+,\d+,\d+,1$/m.test(meio));
}

{
  // Sem highlightColor, a palavra ativa cai na cor primária em vez de
  // uma cor arbitrária fora da marca.
  const semDestaque = gerarAss({
    plano,
    estilo: { ...estilo, highlightColor: undefined },
    palavras,
  });
  t(
    'sem highlightColor, o destaque usa a cor primária',
    !semDestaque.includes('&H00FF662F'),
  );
}

{
  // Chave no texto transcrito viraria comando de formatação do .ass.
  const comChave: PalavraDaTranscricao[] = [
    { startMs: 10_000, endMs: 11_000, word: '{\\an8}injetado' },
  ];
  const ass = gerarAss({ plano, estilo, palavras: comChave });
  t(
    'chave no texto transcrito é escapada, não interpretada',
    ass.includes('\\{') && !ass.includes('{\\an8}'),
  );
}

// ============================================================
// A ligação com o FFmpeg
// ============================================================

{
  const comLegenda = montarArgumentos({
    entrada: '/in.mp4',
    saida: '/out.mp4',
    plano,
    legendas: '/tmp/legendas.ass',
  });
  const filtro = comLegenda[comLegenda.indexOf('-filter_complex') + 1]!;

  t('o filtro subtitles entra na cadeia', filtro.includes('subtitles='));

  // O `-map` tem de apontar para a ÚLTIMA etapa. Mapear [vsaida] com
  // o subtitles depois dele entregaria o vídeo SEM legenda, em
  // silêncio -- o pior tipo de defeito.
  const mapeamentos = comLegenda.filter((_, i) => comLegenda[i - 1] === '-map');
  t('o -map aponta para a saída legendada', mapeamentos.includes('[vlegendado]'));
  t('e NÃO para a saída sem legenda', !mapeamentos.includes('[vsaida]'));

  // O subtitles vem depois do concat: um só arquivo, com tempos de
  // timeline.
  t(
    'o subtitles vem depois do concat',
    filtro.indexOf('concat=') < filtro.indexOf('subtitles='),
  );
  t('há apenas um filtro subtitles', filtro.split('subtitles=').length - 1 === 1);
}

{
  // Legendas desligadas no plano: o arquivo pode existir e não deve
  // ser usado. A decisão é do plano, não da presença do arquivo.
  const desligadas = montarArgumentos({
    entrada: '/in.mp4',
    saida: '/out.mp4',
    plano: { ...plano, captions: { ...plano.captions, enabled: false } },
    legendas: '/tmp/legendas.ass',
  });
  const filtro = desligadas[desligadas.indexOf('-filter_complex') + 1]!;

  t('com captions.enabled false, não legenda', !filtro.includes('subtitles='));
  const mapeamentos = desligadas.filter((_, i) => desligadas[i - 1] === '-map');
  t('e o -map volta para [vsaida]', mapeamentos.includes('[vsaida]'));
}

{
  // Sem arquivo, não legenda -- mesmo com o plano pedindo.
  const semArquivo = montarArgumentos({ entrada: '/in.mp4', saida: '/out.mp4', plano });
  const filtro = semArquivo[semArquivo.indexOf('-filter_complex') + 1]!;
  t('sem o arquivo .ass, não legenda', !filtro.includes('subtitles='));
}

// ============================================================
// O escape do caminho
// ============================================================

{
  // Um caminho do Windows dispara dois problemas: a barra invertida e
  // o dois-pontos de `C:`. Sem tratar, o FFmpeg lê `C` como nome de
  // filtro e falha com erro que não menciona legenda.
  const windows = escaparCaminhoDeFiltro('C:\\tmp\\legendas.ass');
  t('a barra invertida do Windows vira barra normal', !windows.includes('\\t'));
  t('o dois-pontos é escapado', windows.includes('\\:'));

  const posix = escaparCaminhoDeFiltro('/tmp/render/legendas.ass');
  t('um caminho POSIX simples passa intacto', posix === '/tmp/render/legendas.ass');

  // Vírgula separa filtros numa cadeia: sem escapar, o resto do
  // caminho viraria outro filtro.
  t('a vírgula é escapada', escaparCaminhoDeFiltro('/a,b.ass').includes('\\,'));
  t('o colchete é escapado', escaparCaminhoDeFiltro('/a[1].ass').includes('\\['));
  t('a aspa simples é escapada', escaparCaminhoDeFiltro("/a'b.ass").includes("\\'"));
}

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
