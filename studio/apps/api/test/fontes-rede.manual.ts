// Teste MANUAL (rede de verdade, fora da suíte): as fontes abertas
// respondem no formato esperado e os arquivos baixam e convertem.
//   npx tsx test/fontes-rede.manual.ts
import sharp from 'sharp';
import { ranquearResultados } from '@makucho/studio-contracts';
import {
  COLECOES_DE_LOGO,
  LICENCAS_OPENVERSE,
  arquivoDoIcone3d,
  buscarIcones3d,
  iconifyResultados,
  openverseImagem,
  urlDoIconify,
  type ColecaoDoIconify,
  type ImagemDoOpenverse,
} from '../src/modules/banco-de-midia/fontes';

const AGENTE = 'MakuchoStudio/1.0 (+https://makucho.com.br)';

async function main() {
  const ov = (await (
    await fetch(`https://api.openverse.org/v1/images/?${new URLSearchParams({ q: 'bitcoin', license: LICENCAS_OPENVERSE.join(','), page_size: '20', category: 'photograph' })}`, { headers: { 'User-Agent': AGENTE } })
  ).json()) as { results: ImagemDoOpenverse[] };
  const fotos = ov.results.map((i) => openverseImagem(i, 'foto')).filter(Boolean);
  console.log('openverse:', fotos.length, 'fotos;', fotos.slice(0, 2).map((f) => `${f!.titulo} [${f!.licenca.nome}] ${f!.largura}x${f!.altura}`));

  const ic = (await (await fetch(`https://api.iconify.design/search?query=bitcoin&limit=64&prefixes=${COLECOES_DE_LOGO.join(',')}`)).json()) as {
    icons: string[];
    collections: Record<string, ColecaoDoIconify>;
  };
  const logos = ranquearResultados(iconifyResultados(ic.icons, ic.collections, 'logo'), ['bitcoin'], 'logo');
  console.log('iconify logos:', logos.slice(0, 4).map((l) => `${l.id} [${l.licenca.nome}]`));
  const svg = Buffer.from(await (await fetch(urlDoIconify(logos[0]!.id, true, 1024))).arrayBuffer());
  const png = await sharp(svg, { density: 300 }).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const m = await sharp(png).metadata();
  console.log('iconify -> png:', m.width, 'x', m.height, 'alfa:', m.hasAlpha, `${Math.round(png.length / 1024)} KB`);

  for (const q of ['coin', 'rocket', 'chart', 'money bag']) {
    const r = buscarIcones3d(q);
    const a = arquivoDoIcone3d(r[0]!.fonte as '3dicons' | 'fluent', r[0]!.id)!;
    const resp = await fetch(a.url, { headers: { 'User-Agent': AGENTE } });
    const buf = Buffer.from(await resp.arrayBuffer());
    const meta = await sharp(buf).metadata();
    console.log(`3d "${q}":`, r.length, 'opções; 1ª', r[0]!.fonte, r[0]!.titulo, resp.status, `${meta.width}x${meta.height}`, 'alfa:', meta.hasAlpha);
  }
}

void main().catch((e) => {
  console.error('FALHOU', e);
  process.exit(1);
});
