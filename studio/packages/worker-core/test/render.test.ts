// ============================================================
// Os argumentos do render.
//
// Um filtro mal montado não falha: produz vídeo errado em silêncio —
// áudio deslocado do quadro, buraco entre os trechos, rosto
// esticado. Conferir o vetor de argumentos é mais confiável do que
// assistir ao resultado, e não precisa do binário instalado.
// ============================================================

import { montarArgumentos, duracaoDoResultado, filtroDaTransicao } from '../src/render';
import { TRANSICOES_DO_CATALOGO } from '@makucho/studio-contracts';
import type { EditPlanV1 } from '@makucho/studio-contracts';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const plano: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 120_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 15_000,
  framework: 'authority_education',
  clips: [
    {
      id: 'c1',
      sourceStartMs: 10_000,
      sourceEndMs: 18_000,
      timelineStartMs: 0,
      role: 'hook',
      transcriptSegmentIds: ['s1'],
      semanticRisk: 'low',
      reason: 'Abre.',
    },
    {
      id: 'c2',
      sourceStartMs: 40_000,
      sourceEndMs: 47_000,
      timelineStartMs: 8_000,
      role: 'cta',
      transcriptSegmentIds: ['s2'],
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

const args = montarArgumentos({ entrada: '/in.mp4', saida: '/out.mp4', plano });
const filtro = args[args.indexOf('-filter_complex') + 1]!;

// ============================================================
// Corte
// ============================================================

t('a entrada é o original', args.includes('/in.mp4'));
t('a saída está no vetor', args.includes('/out.mp4'));

// Cada trecho é uma ENTRADA própria, já posicionada no original:
// trechos fora de ordem não fazem o FFmpeg segurar quadros de um ramo
// esperando o outro (o render travava com CPU a zero).
/** O `-ss` e o `-t` de cada entrada de trecho, na ordem. */
const entradasDeTrecho = (a: string[]) =>
  a.flatMap((x, i) => (x === '-ss' ? [{ ss: a[i + 1]!, t: a[i + 3]!, arquivo: a[i + 5]! }] : []));
const trechosDoArgs = entradasDeTrecho(args);
t('o primeiro trecho lê o original a partir de 10s', trechosDoArgs[0]?.ss === '10.000' && trechosDoArgs[0]?.arquivo === '/in.mp4');
t('o segundo lê a partir de 40s', trechosDoArgs.some((e) => e.ss === '40.000'));
t('cada entrada lê só o trecho (+0,5 s de folga)', trechosDoArgs.filter((e) => e.ss === '10.000').every((e) => e.t === '8.500' || e.t === '8.530') && trechosDoArgs.filter((e) => e.ss === '40.000').every((e) => e.t === '7.500'));
// O áudio do segundo trecho começa 30 ms antes: é o cruzamento do corte.
t('o áudio do trecho seguinte começa 30 ms antes do corte', trechosDoArgs.some((e) => e.ss === '39.970' && e.t === '7.530'));
t('vídeo e áudio do trecho vêm de entradas separadas (nenhuma entrada alimenta dois ramos)', trechosDoArgs.filter((e) => e.ss === '10.000').length === 2);

// setpts zera o relógio de cada trecho. Sem isso o concat mantém os
// timestamps originais e o resultado fica com buracos do tamanho do
// que foi cortado entre eles.
// O `` importa: `asetpts` também contém `setpts`, e sem a borda
// o contador daria 4 e o teste passaria por engano.
const cadeiasDeVideo = filtro.split(';').filter((p) => /^\[\d+:v\]setpts=/.test(p) && !p.startsWith('[0:v]'));
t('há uma cadeia de vídeo por trecho', cadeiasDeVideo.length === 2);
t('o vídeo tem setpts em cada trecho', cadeiasDeVideo.every((p) => p.includes(',setpts=PTS-STARTPTS')));
// Número exato de quadros por trecho: 8s e 7s a 30 fps.
t('o primeiro trecho tem 240 quadros exatos', cadeiasDeVideo[0]!.includes('trim=end_frame=240'));
t('o segundo trecho tem 210 quadros exatos', cadeiasDeVideo[1]!.includes('trim=end_frame=210'));
// asetpts pelo mesmo motivo: sem ele o áudio entra deslocado do
// quadro, que é o defeito mais visível possível.
t('o áudio tem asetpts em cada peça', (filtro.match(/\[\d+:a\]atrim=0:[^;]*asetpts=PTS-STARTPTS/g) ?? []).length === 2);

t('o áudio é cortado junto do vídeo, da entrada do trecho', (filtro.match(/\[\d+:a\]atrim=0:/g) ?? []).length === 2);
t('nenhum ramo lê o original inteiro (sem espera cruzada)', !filtro.includes('[0:v]trim=') && !filtro.includes('[0:a]atrim='));
// O áudio do trecho tem a mesma duração do vídeo dele (quadros / 30).
t('a peça de áudio cobre o trecho e o cruzamento de 30 ms', filtro.includes('apad=whole_dur=8.030,atrim=0:8.030'));
// Cruzamento no corte seco: a primeira peça sai em 60 ms, a segunda
// entra em 60 ms, começando 30 ms antes do corte.
t('a peça que sai cruza o volume no corte', filtro.includes('afade=t=out:st=7.970:d=0.060'));
t('a peça que entra começa 30 ms antes do corte', filtro.includes('adelay=delays=7970:all=1'));
t('a peça que entra cresce em 60 ms', filtro.includes('afade=t=in:d=0.060'));

// ============================================================
// Formato vertical
// ============================================================

t('escala para 1080x1920', filtro.includes('scale=1080:1920'));
// decrease + pad: a imagem inteira cabe sem distorcer, e o resto é
// preenchido. Esticar o rosto de quem gravou seria pior que a borda.
t('não distorce — usa decrease', filtro.includes('force_original_aspect_ratio=decrease'));
t('preenche o resto com pad', filtro.includes('pad=1080:1920'));
t('corrige o aspecto de pixel', filtro.includes('setsar=1'));

// ============================================================
// Concatenação
// ============================================================

t('concatena o vídeo dos dois trechos', filtro.includes('concat=n=2:v=1:a=0'));
t('soma as peças de áudio (sem normalizar o volume)', filtro.includes('amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,'));
t('o áudio somado tem a duração exata do vídeo', filtro.includes('apad=whole_dur=15.000,atrim=0:15.000,asetpts=PTS-STARTPTS[voz]'));
// Sem transição, nada de xfade: corte seco é concat.
t('sem transição, não há xfade', !filtro.includes('xfade'));
t('o vídeo montado vira [vsaida]', filtro.includes('null[vsaida]'));
t('e o áudio normalizado vira a saída', filtro.includes('[asaida]'));
t('a saída de vídeo é mapeada', args.includes('[vsaida]'));
t('a saída de áudio é mapeada', args.includes('[asaida]'));

// ============================================================
// Codificação
// ============================================================

// -c copy só corta em keyframe, e um corte editorial cai onde a fala
// termina. Copiar produziria clips deslocados em até vários segundos.
t('NÃO copia o stream — reencodifica', !args.includes('-c') || !args.includes('copy'));

t('o CRF vem do plano', args[args.indexOf('-crf') + 1] === '23');
t('o bitrate de áudio vem do plano', args[args.indexOf('-b:a') + 1] === '128k');
// yuv420p é o único formato que toca em todo lugar; sem ele o vídeo
// pode falhar só no celular de quem abre.
t('força yuv420p', args[args.indexOf('-pix_fmt') + 1] === 'yuv420p');
// O loudnorm precisa estar DENTRO do filter_complex: o FFmpeg
// recusa misturar `-af` com saída de filtro complexo, e com ele
// do lado de fora toda exportação falhava.
t('normaliza o loudness no alvo do plano', filtro.includes('loudnorm=I=-14'));
t('o loudnorm NÃO vai num -af', !args.includes('-af'));
// O entregável usa preset medium; ultrafast é do proxy, que é
// descartável.
t('usa preset medium, não ultrafast', args[args.indexOf('-preset') + 1] === 'medium');
t('permite assistir antes de baixar tudo', args.includes('+faststart'));

// ============================================================
// Clips desligados
//
// A seção 13 exige poder restaurar o que foi descartado: desligar
// não apaga, e o render precisa respeitar isso.
// ============================================================

const semC1 = montarArgumentos({
  entrada: '/in.mp4',
  saida: '/out.mp4',
  plano,
  clipsDesligados: ['c1'],
});
const filtroSemC1 = semC1[semC1.indexOf('-filter_complex') + 1]!;

t('o clip desligado não entra', !entradasDeTrecho(semC1).some((e) => e.ss === '10.000'));
t('o que sobrou entra (vídeo e áudio dele)', entradasDeTrecho(semC1).length === 2 && entradasDeTrecho(semC1).every((e) => e.ss === '40.000'));
// Um único trecho ainda passa pelo concat: mudar o caminho para o
// caso de um só produziria dois comportamentos para manter.
t('um trecho só ainda passa pela soma do áudio', filtroSemC1.includes('amix=inputs=1:'));

let recusou = false;
try {
  montarArgumentos({ entrada: '/in.mp4', saida: '/out.mp4', plano, clipsDesligados: ['c1', 'c2'] });
} catch {
  recusou = true;
}
t('desligar tudo é recusado em vez de gerar arquivo vazio', recusou);

// ============================================================
// Duração
// ============================================================

t('a duração é a soma dos trechos', duracaoDoResultado(plano) === 8000 + 7000);
t('desligar um trecho encurta o resultado', duracaoDoResultado(plano, ['c1']) === 7000);

// ============================================================
// Ordem
//
// A ordem da timeline é a ordem do resultado, mesmo que o array
// venha embaralhado.
// ============================================================

const embaralhado: EditPlanV1 = { ...plano, clips: [plano.clips[1]!, plano.clips[0]!] };
const ordenados = entradasDeTrecho(montarArgumentos({ entrada: '/in.mp4', saida: '/out.mp4', plano: embaralhado }));

t('ordena pela timeline, não pela posição no array', ordenados[0]?.ss === '10.000' && ordenados.findIndex((e) => e.ss === '40.000') > ordenados.findIndex((e) => e.ss === '10.000'));

console.log(`\n${ok} ok, ${fail} falha(s)`);
// ============================================================
// Acabamento: enquadramento, efeitos, transições, logo, trilha, sons
// ============================================================

{
  const tres: EditPlanV1 = {
    ...plano,
    clips: [
      { ...plano.clips[0]!, effect: 'zoom_lento' },
      { ...plano.clips[1]!, id: 'c2', timelineStartMs: 8000, effect: 'punch_in' },
      { ...plano.clips[1]!, id: 'c3', sourceStartMs: 60_000, sourceEndMs: 66_000, timelineStartMs: 15_000 },
    ],
    targetDurationMs: 21_000,
    transitions: [{ id: 't1', type: 'fade', beforeClipIndex: 2, durationMs: 400 }],
    overlays: [
      { id: 'lg', component: 'LogoBug', assetId: 'logo1', variant: 'sd', timelineStartMs: 0, durationMs: 21_000 },
      { id: 'tt', component: 'HookTitle', text: 'Título', timelineStartMs: 0, durationMs: 3000 },
    ],
    music: { assetId: 'mus1', gainDb: -20, fadeInMs: 800, fadeOutMs: 1500, duckUnderVoice: true },
    soundEffects: [
      { id: 's1', assetId: 'sfx-whoosh', timelineStartMs: 14_800, gainDb: -12 },
      { id: 's2', assetId: 'sfx-pop', timelineStartMs: 40, gainDb: -10 },
      { id: 's3', assetId: 'asset-sem-arquivo', timelineStartMs: 1000, gainDb: -10 },
    ],
    render: { ...plano.render, fit: 'desfoque', voiceEnhance: true },
  };

  const a = montarArgumentos({
    entrada: '/in.mp4',
    saida: '/out.mp4',
    plano: tres,
    legendas: '/tmp/l.ass',
    pastaDeFontes: '/app/fonts',
    imagens: { logo1: '/storage/logo.png' },
    musica: '/storage/trilha.mp3',
  });
  const f = a[a.indexOf('-filter_complex') + 1]!;

  // Enquadramento com desfoque: o fundo é desfocado em 1/4 do tamanho.
  t('desfoque divide o trecho em frente e fundo', f.includes('split=2[frentec0][fundoc0]'));
  t('o desfoque roda em 270x480, não no quadro cheio', f.includes('scale=270:480') && f.includes('boxblur='));
  t('não há faixas pretas no desfoque', !f.includes('pad=1080:1920'));

  // Efeitos por trecho.
  t('zoom lento cresce a cada quadro (perspective, eval=frame)', f.includes('perspective=') && f.includes('eval=frame'));
  t('zoom lento centrado: os quatro cantos andam juntos para dentro', f.includes("x0='W*(1-1/(1+0.08*max(0,in-1)/240))/2'") && f.includes("x3='W-W*(1-1/(1+0.08*max(0,in-1)/240))/2'"));
  t('punch-in recorta 1/1.12 e volta ao quadro', f.includes('crop=964:1714,scale=1080:1920'));

  // Transição: centrada no corte, SEM congelar. O trecho que sai
  // continua andando 6 quadros depois do fim (sobras do original) e o
  // que entra começa 6 quadros antes do começo. A janela ocupa os 12
  // quadros que tira dos dois lados: a duração total não muda.
  t('o trecho que sai perde 6 quadros no miolo (210 → 204)', /trim=end_frame=204,setpts=PTS-STARTPTS/.test(f));
  t('o fim de A anda além do corte (entrada a partir de 46,8 s)', a.includes('46.800'));
  t('o começo de B vem das sobras antes dele (entrada a partir de 59,8 s)', a.includes('59.800'));
  t('nada congela: sem pedaço de um quadro só', !/trim=end_frame=1,/.test(f));
  t('o xfade é um segmento curto, começando em zero', f.includes('[sa1][en1]xfade=transition=fade:duration=0.4000:offset=0,'));
  t('o segmento da transição tem o número exato de quadros', /xfade=[^;]*trim=end_frame=12,setpts=PTS-STARTPTS\[t1\]/.test(f));
  t('o miolo de B vem depois (180 − 6 = 174 quadros)', /trim=end_frame=174,setpts=PTS-STARTPTS/.test(f));
  t('tudo num concat só, na ordem da timeline', f.includes('[c0][c1][t1][c2]concat=n=4:v=1:a=0[montado]'));
  t('o áudio cruza pela janela inteira da transição (400 ms)', f.includes('afade=t=in:d=0.400') && f.includes('d=0.400,adelay'));
  t('nenhum xfade recebe a saída de outro xfade', !/\[t\d+\]xfade/.test(f) && (f.match(/xfade=/g) ?? []).length === 1);
  t('nenhum trecho é repartido com split (só o desfoque divide o quadro)', !/\[c\d+\]split/.test(f));
  t('o zoom lento não recomeça no meio do trecho (sem deslocamento zero)', !f.includes('in+0)') && f.includes('max(0,in-1)'));

  // Logo.
  t('o logo é uma entrada', a.includes('/storage/logo.png'));
  t('o logo é escalado numa caixa sem distorcer', f.includes('scale=184:154:force_original_aspect_ratio=decrease'));
  t('o logo fica no canto superior direito', f.includes('overlay=x=1080-w-54:y=144'));

  // Voz, trilha com ducking e sons.
  t('a voz é limpa (afftdn)', f.includes('afftdn='));
  t('a trilha entra em loop', a.includes('-stream_loop') && a.includes('/storage/trilha.mp3'));
  t('a trilha abaixa sob a voz', f.includes('sidechaincompress='));
  t('o whoosh é sintetizado, sem arquivo', f.includes('anoisesrc='));
  t('o pop é sintetizado, sem arquivo', f.includes('aevalsrc='));
  t('o som no ponto certo (adelay 14800ms)', f.includes('adelay=delays=14800:all=1'));
  t('som de asset sem arquivo é ignorado, não quebra', !f.includes('asset-sem-arquivo'));
  t('voz + trilha + 2 sons misturados', f.includes('amix=inputs=3'));

  // Legendas por último, com as fontes da imagem.
  t('as legendas usam a pasta de fontes', f.includes('fontsdir=/app/fonts'));
  const ultimaParte = f.split(';').pop()!;
  t('as legendas são a última etapa do vídeo', ultimaParte.startsWith('[vsaida]subtitles='));
  t('a duração com transição não muda (21s)', duracaoDoResultado(tres) === 21_000);
}

{
  // Uma transição num trecho desligado não entra.
  const comTransicao: EditPlanV1 = {
    ...plano,
    transitions: [{ id: 't1', type: 'slide', beforeClipIndex: 1, durationMs: 350 }],
  };
  const a = montarArgumentos({ entrada: '/in.mp4', saida: '/o.mp4', plano: comTransicao, clipsDesligados: ['c2'] });
  const f = a[a.indexOf('-filter_complex') + 1]!;
  t('transição de trecho desligado não entra', !f.includes('xfade'));

  const b = montarArgumentos({ entrada: '/in.mp4', saida: '/o.mp4', plano: comTransicao });
  const g = b[b.indexOf('-filter_complex') + 1]!;
  t('slide vira slideleft no xfade', g.includes('xfade=transition=slideleft'));
  t('preencher não existe sem pedir: o padrão é ajustar com pad', g.includes('pad=1080:1920'));
}

// ============================================================
// Texto atrás da pessoa
// ============================================================
{
  const atras = montarArgumentos({
    entrada: '/in.mp4',
    saida: '/out.mp4',
    plano,
    legendas: '/tmp/frente.ass',
    legendasAtras: '/tmp/atras.ass',
    mascara: { caminho: '/tmp/m.raw', inicioMs: 2000, quadros: 90, lado: 256 },
  });
  const f = atras[atras.indexOf('-filter_complex') + 1]!;
  t('a máscara entra crua (gray 256x256, 30 fps)', atras.join(' ').includes('-f rawvideo -pix_fmt gray -video_size 256x256 -framerate 30 -i /tmp/m.raw'));
  t('a máscara começa no ponto do texto (2 s de preto antes)', f.includes('tpad=start_duration=2.0000'));
  t('a máscara vira a transparência da pessoa', f.includes('[vpessoa][mascara0]alphamerge[pessoa]'));
  t('o texto de trás é desenhado antes da pessoa', f.includes('[vfundo]subtitles=/tmp/atras.ass[vtras]'));
  t('a pessoa vai por cima, só na janela', f.includes("[vtras][pessoa]overlay=0:0:enable='between(t,2.000,5.000)'[vcomposto]"));
  t('legenda e textos da frente por último', f.includes('[vcomposto]subtitles=/tmp/frente.ass[vlegendado]'));

  const quadros = montarArgumentos({ entrada: '/in.mp4', saida: 'pipe:1', plano, quadrosParaMascara: { inicioMs: 1000, fimMs: 4000, lado: 256 } });
  const fq = quadros[quadros.indexOf('-filter_complex') + 1]!;
  t('modo máscara: só os quadros do intervalo, 256x256 RGB no stdout', fq.includes('trim=start=1.0000:end=4.0000') && fq.includes('scale=256:256,format=rgb24[mq]') && quadros.at(-1) === 'pipe:1');
  t('modo máscara: sem som', !fq.includes('amix') && !fq.includes('[0:a]') && !/\[\d+:a\]/.test(fq));
}

// ============================================================
// Catálogo de transições: nativas e receitas
// ============================================================
{
  t('nativa: o xfade pelo nome', filtroDaTransicao('circle', 'a', 'b', '0.4000') === '[a][b]xfade=transition=circleopen:duration=0.4000:offset=0');
  t('flash é o fadewhite nativo', filtroDaTransicao('flash', 'a', 'b', '0.3000').includes('transition=fadewhite'));
  t('id desconhecido cai no fade', filtroDaTransicao('nao_existe', 'a', 'b', '0.3000').includes('transition=fade:'));

  const zoom = filtroDaTransicao('zoom_desfoque', 'a', 'b', '0.4000', 12);
  t('receita: zoom por perspective, com o quadro a partir de zero (in-1)', zoom.includes('perspective=') && zoom.includes('(in-1)/12'));
  t('receita: desfoque com sigmaV > 0 (sigmaV=0 dá preto)', zoom.includes('gblur=sigma=10.000000:sigmaV=0.3'));
  t('receita: termina sem rótulo, em yuv420p', zoom.endsWith('format=yuv420p'));

  const giro = filtroDaTransicao('giro', 'a', 'b', '0.4000', 12);
  t('giro: rotate nos dois lados e troca no meio (6 quadros)', (giro.match(/rotate=/g) ?? []).length === 2 && giro.includes('trim=end_frame=6') && giro.includes('trim=start_frame=6'));

  const glitch = filtroDaTransicao('glitch', 'a', 'b', '0.4000', 12, 1080, 1920);
  t('glitch: mapa de faixas pequeno, ampliado sem interpolar', glitch.includes('s=270x480') && glitch.includes('scale=1080:1920:flags=neighbor') && glitch.includes('displace=edge=smear'));
  t('glitch: separação RGB', glitch.includes('rgbashift=rh=10:bh=-10'));
  t('luz: faixa em modo tela', filtroDaTransicao('luz', 'a', 'b', '0.4000').includes('blend=all_mode=screen'));

  // Todo o catálogo gera filtro, e nenhum usa o xfade custom (lento e instável entre threads).
  const todos = TRANSICOES_DO_CATALOGO.filter((d) => d.id !== 'cut').map((d) => filtroDaTransicao(d.id, 'a', 'b', '0.4000'));
  t('todo o catálogo gera filtro sem xfade custom', todos.every((f) => f.length > 0 && !f.includes('transition=custom')));

  const comReceita: EditPlanV1 = { ...plano, transitions: [{ id: 't1', type: 'glitch', beforeClipIndex: 1, durationMs: 400 }] };
  const a = montarArgumentos({ entrada: '/in.mp4', saida: '/o.mp4', plano: comReceita });
  const f = a[a.indexOf('-filter_complex') + 1]!;
  t('receita encadeada no render, no segmento de 12 quadros', f.includes('rgbashift=') && /format=yuv420p,[^;]*trim=end_frame=12/.test(f));
}

// ============================================================
// Cor do trecho: a tabela entra no fim do trecho, trilinear
// ============================================================
{
  const a = montarArgumentos({ entrada: '/in.mp4', saida: '/o.mp4', plano, luts: { [plano.clips[1]!.id]: '/tmp/cor-1.cube' } });
  const f = a[a.indexOf('-filter_complex') + 1]!;
  t('lut3d trilinear só no trecho com cor', (f.match(/lut3d=/g) ?? []).length === 1 && f.includes('lut3d=file=/tmp/cor-1.cube:interp=trilinear,format=yuv420p'));
  const sem = montarArgumentos({ entrada: '/in.mp4', saida: '/o.mp4', plano });
  t('sem tabela, sem lut3d', !sem[sem.indexOf('-filter_complex') + 1]!.includes('lut3d'));
}

// ============================================================
// Efeitos de tela: sobre o vídeo montado, só nos quadros deles
// ============================================================
{
  const comEfeitos: EditPlanV1 = {
    ...plano,
    screenEffects: [
      { id: 'e1', type: 'vinheta', timelineStartMs: 1000, durationMs: 2000, intensity: 0.5 },
      { id: 'e2', type: 'tremor', timelineStartMs: 3000, durationMs: 500, intensity: 0.6 },
      { id: 'e3', type: 'glitch', timelineStartMs: 0, durationMs: 400, intensity: 0.6 },
    ],
  };
  const a = montarArgumentos({ entrada: '/in.mp4', saida: '/o.mp4', plano: comEfeitos });
  const f = a[a.indexOf('-filter_complex') + 1]!;
  t('efeitos encadeados depois do vídeo montado', f.includes('[montado]') && /\[montado\]\[montado_ef0l\]overlay/.test(f));
  t('vinheta: camada estática (um quadro, repetido) a partir do quadro 30', f.includes('loop=loop=59:size=1') && f.includes('setpts=PTS-STARTPTS+30/(30*TB)'));
  t('tremor: perspective só nos quadros 90 a 104', f.includes("perspective=") && f.includes("enable='between(n,90,104)'"));
  t('glitch no quadro 0: mapa sem trecho neutro antes', f.includes('[ef1_ef2xw]null[ef1_ef2x]') && f.includes('displace=edge=smear'));
  t('logo e textos vêm depois dos efeitos', f.indexOf('[ef2]') > f.indexOf('displace'));
  const fora = montarArgumentos({ entrada: '/in.mp4', saida: '/o.mp4', plano: { ...plano, screenEffects: [{ id: 'x', type: 'flash', timelineStartMs: 999_000, durationMs: 500, intensity: 1 }] } });
  t('efeito depois do fim do vídeo não entra', !fora[fora.indexOf('-filter_complex') + 1]!.includes('alphamerge'));

  // Efeitos de fundo: a pessoa volta por cima com a máscara.
  const comFundo: EditPlanV1 = {
    ...plano,
    overlays: [{ id: 't1', component: 'Destaque', text: 'Atrás', timelineStartMs: 1000, durationMs: 2000, style: { atras: true } }] as EditPlanV1['overlays'],
    screenEffects: [{ id: 'f1', type: 'fundo_pb', timelineStartMs: 2000, durationMs: 1000, intensity: 1 }],
  };
  const mascara = { caminho: '/tmp/m.raw', inicioMs: 1000, quadros: 60, lado: 256 };
  const b = montarArgumentos({ entrada: '/in.mp4', saida: '/o.mp4', plano: comFundo, mascara, legendas: '/tmp/f.ass', legendasAtras: '/tmp/a.ass' });
  const g = b[b.indexOf('-filter_complex') + 1]!;
  t('fundo P&B: máscara dividida entre o efeito e o texto atrás', g.includes('split=2[mascara0][mascara1]') && (b.join(' ').match(/-f rawvideo/g) ?? []).length === 1);
  t('fundo P&B: só o fundo perde a cor, a pessoa volta por cima', g.includes("hue=s=0.000000:enable='between(n,60,89)'") && g.includes('[mascara0]alphamerge') && g.includes('[vpessoa][mascara1]alphamerge'));
  const semMascara = montarArgumentos({ entrada: '/in.mp4', saida: '/o.mp4', plano: comFundo });
  t('sem máscara (modelo ausente), o efeito de fundo não entra', !semMascara[semMascara.indexOf('-filter_complex') + 1]!.includes('hue='));
}

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
