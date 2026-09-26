// ============================================================
// Fontes de mídia de licença livre: formato único, licenças aceitas,
// ícones 3D locais, links seguros -- e, no contrato, a ordem dos
// resultados, os momentos da IA e as operações de cada composição.
// ============================================================

import {
  aplicarOperacoes,
  lerMomentosVisuais,
  operacoesDaComposicao,
  ranquearResultados,
  editPlanV1Schema,
  type EditPlanV1,
  type ResultadoDaBusca,
} from '@makucho/studio-contracts';
import {
  arquivoDoIcone3d,
  arquivoDoVideoPixabay,
  buscarIcones3d,
  iconifyResultados,
  licencaDoAsset,
  licencaDoOpenverse,
  linkSeguro,
  openverseImagem,
  pixabayImagem,
} from '../src/modules/banco-de-midia/fontes';
import { afinidade, cosseno, mediaDosTextos, pixelsParaTensor } from '../src/modules/banco-de-midia/visao/clip';

let ok = 0,
  fail = 0;
const t = (nome: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}`);
};

// ---------- Licenças ----------
t('Openverse: CC0, domínio público e CC-BY entram; SA e NC não', !!licencaDoOpenverse('cc0') && !!licencaDoOpenverse('pdm') && licencaDoOpenverse('by', '4.0')!.exigeCredito && !licencaDoOpenverse('by-sa') && !licencaDoOpenverse('by-nc'));
t('Openverse com licença proibida some da busca', openverseImagem({ id: 'x', url: 'https://a.b/c.jpg', license: 'by-nc' }, 'foto') === null);
t('licença CC-BY vira creative_commons com crédito na nota', (() => {
  const l = licencaDoAsset(licencaDoOpenverse('by', '2.0')!, 'Sean', 'https://flickr.com/x', 'Openverse');
  return l.type === 'creative_commons' && l.holder === 'Sean' && l.notes.includes('crédito');
})());

// ---------- Iconify ----------
const colecoes = {
  logos: { name: 'SVG Logos', license: { title: 'CC0', spdx: 'CC0-1.0' }, palette: true },
  mdi: { name: 'Material Design Icons', license: { title: 'Apache 2.0', spdx: 'Apache-2.0' }, palette: false },
  proibida: { name: 'X', license: { title: 'GPL', spdx: 'GPL-3.0' }, palette: true },
};
const icones = iconifyResultados(['mdi:bitcoin', 'proibida:bitcoin', 'logos:bitcoin'], colecoes, 'logo');
t('Iconify: coleção sem licença livre fica de fora', icones.length === 2 && !icones.some((i) => i.id.startsWith('proibida')));
t('Iconify: logo busca primeiro as coleções de marca', icones[0]!.id === 'logos:bitcoin');
t('Iconify: monocromático sai em branco; colorido, com as cores', icones[1]!.miniatura.includes('color=%23ffffff') && !icones[0]!.miniatura.includes('color='));

// ---------- Pixabay ----------
const ilustracao = pixabayImagem({ id: 1, pageURL: 'https://pixabay.com/x', tags: 'bitcoin, coin, crypto', previewURL: 'p', webformatURL: 'w', largeImageURL: 'https://pixabay.com/get/a.png', imageWidth: 1280, imageHeight: 1280, user: 'ana' }, 'ilustracao');
t('Pixabay: tags viram lista, PNG é transparente', ilustracao.tags.join(',') === 'bitcoin,coin,crypto' && ilustracao.transparente && !ilustracao.licenca.exigeCredito);
t('Pixabay vídeo: o MP4 de até ~1200 px de lado', arquivoDoVideoPixabay({ videos: { large: { url: 'l', width: 3840, height: 2160 }, medium: { url: 'm', width: 1920, height: 1080 }, small: { url: 's', width: 1280, height: 720 } } })?.url === 'm');

// ---------- Ícones 3D locais ----------
const moeda = buscarIcones3d('money bag');
t('ícones 3D: "money bag" acha o saco de dinheiro', moeda.some((r) => /money bag/i.test(r.titulo)));
t('ícones 3D: 3dicons (400 px) vem antes no empate', buscarIcones3d('rocket')[0]?.fonte === '3dicons');
t('ícones 3D: o id volta a ser o arquivo certo', (() => {
  const r = moeda[0]!;
  return arquivoDoIcone3d(r.fonte as '3dicons' | 'fluent', r.id)?.url === r.miniatura;
})());
t('ícones 3D: consulta vazia não traz nada', buscarIcones3d('  ').length === 0);

// ---------- Links ----------
t('link seguro: https de site aceito', linkSeguro('https://live.staticflickr.com/a.jpg'));
t('link seguro: rede local, IP e localhost recusados', !linkSeguro('http://localhost/a') && !linkSeguro('http://10.0.0.5/a') && !linkSeguro('http://[::1]/a') && !linkSeguro('file:///etc/passwd') && !linkSeguro('http://api/x'));

// ---------- Contrato: momentos, ordem e composições ----------
const lido = lerMomentosVisuais(
  JSON.stringify({
    momentos: [
      { inicioMs: 3000, fimMs: 30000, conceito: 'bitcoin', termos: ['bitcoin'], tipo: 'logo', composicao: 'errada' },
      { inicioMs: 4000, fimMs: 6000, conceito: 'sobreposto', termos: ['x'], tipo: 'foto', composicao: 'moldura' },
      { inicioMs: 12000, fimMs: 14000, conceito: 'número', termos: ['growth chart'], tipo: 'foto', composicao: 'tela_cheia_com_titulo' },
      { inicioMs: 90000, fimMs: 92000, conceito: 'depois do fim', termos: ['y'], tipo: 'foto', composicao: 'moldura' },
    ],
  }),
  60_000,
);
t('momentos: composição errada vira a do tipo, duração presa em 6 s', lido.ok && lido.momentos[0]!.composicao === 'cartao' && lido.momentos[0]!.fimMs - lido.momentos[0]!.inicioMs === 6000);
t('momentos: sobreposto e depois do fim ficam de fora', lido.ok && lido.momentos.length === 2 && !lido.momentos.some((m) => m.conceito === 'sobreposto'));
t('momentos: "com título" sem texto vira tela cheia', lido.ok && lido.momentos[1]!.composicao === 'tela_cheia');

const r = (id: string, titulo: string, transparente = false, largura = 500, altura = 500): ResultadoDaBusca => ({
  fonte: 'pixabay',
  id,
  tipo: 'foto',
  titulo,
  tags: titulo.split(' '),
  largura,
  altura,
  duracaoMs: null,
  miniatura: '',
  transparente,
  autor: '',
  pagina: '',
  licenca: { tipo: 'pixabay', nome: '', exigeCredito: false },
});
const ordem = ranquearResultados([r('a', 'dog park'), r('b', 'bitcoin gold coin', false, 1080, 1920), r('c', 'coin')], ['bitcoin', 'coin'], 'foto');
t('ordem: o que casa o 1º termo e é vertical vem primeiro', ordem[0]!.id === 'b' && ordem[2]!.id === 'a');

const plano: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'p1',
  sourceMediaId: 'm1',
  sourceDurationMs: 60_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 10_000,
  framework: 'authority_education',
  clips: [{ id: 'c1', sourceStartMs: 0, sourceEndMs: 10_000, timelineStartMs: 0, role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low', reason: 'a' }],
  captions: { enabled: true, styleId: 'st1', wordsPerBlock: 3, position: 'bottom', highlightActiveWord: true, corrections: [] },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: { fps: 30, videoCodec: 'h264', audioCodec: 'aac', crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14 },
};
const midia = { assetId: 'img1', kind: 'image' as const, largura: 1024, altura: 1024, transparente: true };
let passou = true;
for (const composicao of ['icone_ao_lado', 'tela_cheia', 'tela_cheia_com_titulo', 'moldura', 'cartao', 'janela'] as const) {
  const ops = operacoesDaComposicao({ inicioMs: 2000, fimMs: 5000, conceito: 'x', termos: ['x'], tipo: 'foto', composicao, texto: 'Título' }, midia, { corDaMarca: '#2F66FF' });
  const res = aplicarOperacoes(plano, ops);
  if (res.ok && !editPlanV1Schema.safeParse(res.plan).success) passou = false;
  if (!res.ok) {
    passou = false;
    console.log('   ', composicao, res.erro);
  }
}
t('toda composição vira operações que o plano aceita', passou);
const comTitulo = operacoesDaComposicao({ inicioMs: 2000, fimMs: 5000, conceito: 'x', termos: ['x'], tipo: 'foto', composicao: 'tela_cheia_com_titulo', texto: '20% ao mês' }, { ...midia, transparente: false });
t('tela cheia com título: mídia + texto por cima', comTitulo.length === 2 && comTitulo[1]!.op === 'adicionar_overlay');

// ---------- A IA que enxerga (CLIP): cena lida e notas ----------
const comCena = lerMomentosVisuais(
  JSON.stringify({ momentos: [{ inicioMs: 3000, fimMs: 5000, conceito: 'bitcoin', termos: ['bitcoin'], tipo: 'logo', composicao: 'cartao', cena: 'a gold bitcoin coin 3d icon', porque: 'mostra o bitcoin' }] }),
  30000,
);
t('momentos: a cena ideal e o porquê chegam ao servidor', comCena.ok && comCena.momentos[0]!.cena === 'a gold bitcoin coin 3d icon' && comCena.momentos[0]!.porque === 'mostra o bitcoin');
t('afinidade: cosseno do CLIP vira 0-100 com teto e piso', afinidade(0.1) === 0 && afinidade(0.4) === 100 && afinidade(0.25) === 50);
const media = mediaDosTextos([Float32Array.from([1, 0]), Float32Array.from([0, 3])]);
t('textos: a média normalizada fica entre os dois', Math.abs(cosseno(media, media) - 1) < 1e-6 && Math.abs(media[0]! - media[1]!) < 1e-6);
const branco = pixelsParaTensor(new Uint8Array(224 * 224 * 3).fill(255));
t('imagem: branco normalizado como o CLIP (canal R ~1,93)', branco.length === 3 * 224 * 224 && Math.abs(branco[0]! - 1.9303) < 1e-3);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail > 0) process.exit(1);
