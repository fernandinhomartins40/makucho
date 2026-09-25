// ============================================================
// Banco de mídia (Pexels): resultado enxuto, arquivo a baixar e o
// filtro de link.
// ============================================================

import { arquivoDaFoto, arquivoDoVideo, linkDoPexels, resultadoDaFoto, resultadoDoVideo } from '../src/modules/banco-de-midia/pexels';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

const video = {
  id: 7,
  width: 2160,
  height: 3840,
  duration: 12,
  url: 'https://www.pexels.com/video/7/',
  image: 'https://images.pexels.com/videos/7/foto.jpeg',
  user: { name: 'Ana' },
  video_files: [
    { link: 'https://videos.pexels.com/4k.mp4', width: 2160, height: 3840, file_type: 'video/mp4' },
    { link: 'https://videos.pexels.com/hd.mp4', width: 1080, height: 1920, file_type: 'video/mp4' },
    { link: 'https://videos.pexels.com/sd.mp4', width: 540, height: 960, file_type: 'video/mp4' },
    { link: 'https://videos.pexels.com/x.webm', width: 1080, height: 1920, file_type: 'video/webm' },
  ],
};

const r = resultadoDoVideo(video);
t('vídeo: duração em ms, miniatura e crédito', r.duracaoMs === 12_000 && r.autor === 'Ana' && r.tipo === 'video' && r.pagina.includes('pexels.com'));
t('baixa o MP4 de 1080, não o 4K', arquivoDoVideo(video)?.link === 'https://videos.pexels.com/hd.mp4');
t('só 4K disponível: o menor que houver', arquivoDoVideo({ video_files: [video.video_files[0]!] })?.link === 'https://videos.pexels.com/4k.mp4');
t('sem MP4: nenhum', arquivoDoVideo({ video_files: [video.video_files[3]!] }) === null);

const foto = {
  id: 9,
  width: 3000,
  height: 4000,
  url: 'https://www.pexels.com/photo/9/',
  photographer: 'Bia',
  src: { original: 'https://images.pexels.com/o.jpg', large2x: 'https://images.pexels.com/l2.jpg', large: 'https://images.pexels.com/l.jpg', medium: 'https://images.pexels.com/m.jpg', portrait: 'https://images.pexels.com/p.jpg' },
};
t('foto: miniatura média e crédito', resultadoDaFoto(foto).miniatura.endsWith('m.jpg') && resultadoDaFoto(foto).autor === 'Bia');
t('foto: baixa a large2x', arquivoDaFoto(foto).endsWith('l2.jpg'));

t('link do CDN do Pexels passa', linkDoPexels('https://videos.pexels.com/a.mp4') && linkDoPexels('https://images.pexels.com/a.jpg'));
t('link de fora não passa', !linkDoPexels('https://exemplo.com/a.mp4') && !linkDoPexels('http://videos.pexels.com/a.mp4') && !linkDoPexels('https://pexels.com.exemplo.com/a.mp4') && !linkDoPexels('lixo'));

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
