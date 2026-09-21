import { lerProgresso, lerSilencios } from '../src/ffmpeg';

let ok = 0, fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ============================================================
// Progresso
//
// O FFmpeg imprime isto no stderr enquanto trabalha. Sem ler, o
// usuario ve uma barra parada por minutos -- e o plano (secao 14)
// proibe progresso falso.
// ============================================================

// Linha real do FFmpeg.
const linhaReal =
  'frame=  450 fps= 30 q=28.0 size=    1024kB time=00:00:15.00 bitrate= 559.2kbits/s speed=1.02x';

t('le o tempo da linha de progresso', lerProgresso(linhaReal) === 15_000);

t('le hora, minuto e segundo',
  lerProgresso('time=01:23:45.67') === 3600_000 + 23 * 60_000 + 45_000 + 670);

t('le centesimos', lerProgresso('time=00:00:01.50') === 1_500);
t('le o inicio', lerProgresso('time=00:00:00.00') === 0);

// Linhas de configuracao que o FFmpeg imprime antes de comecar.
t('ignora linha sem tempo',
  lerProgresso('  libavcodec     60. 31.102 / 60. 31.102') === null);
t('ignora linha vazia', lerProgresso('') === null);

// ============================================================
// Silêncios
// ============================================================

// Saida real do filtro silencedetect.
const saidaReal = `
[silencedetect @ 0x7f8] silence_start: 0
[silencedetect @ 0x7f8] silence_end: 2.048 | silence_duration: 2.048
[silencedetect @ 0x7f8] silence_start: 5.12
[silencedetect @ 0x7f8] silence_end: 8.704 | silence_duration: 3.584
`;

const silencios = lerSilencios(saidaReal);
t('encontra os dois silencios', silencios.length === 2);
t('converte para milissegundos',
  silencios[0]?.inicioMs === 0 && silencios[0]?.fimMs === 2_048);
t('le o segundo silencio',
  silencios[1]?.inicioMs === 5_120 && silencios[1]?.fimMs === 8_704);

// O FFmpeg as vezes reporta inicio negativo no primeiro quadro.
t('trata inicio negativo',
  lerSilencios('silence_start: -0.001\nsilence_end: 1.0')[0]?.inicioMs === 0);

// Video sem silencio nenhum.
t('saida sem silencio devolve lista vazia',
  lerSilencios('frame=100 fps=30 time=00:00:03.33').length === 0);

// Um silence_start sem o end correspondente: o video termina em
// silencio, e o filtro nao fecha o par.
t('silencio sem fim nao entra na lista',
  lerSilencios('silence_start: 10.0').length === 0);

t('saida vazia nao quebra', lerSilencios('').length === 0);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
