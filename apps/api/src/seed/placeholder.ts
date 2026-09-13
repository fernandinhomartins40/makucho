import sharp from 'sharp';
import { createHash } from 'node:crypto';

/**
 * Imagens de demonstracao geradas localmente (secao 42).
 *
 * O seed precisa de imagens para que a home tenha a aparencia real, mas
 * baixar de servico externo tornaria a instalacao dependente de rede e
 * traria conteudo de terceiros para o repositorio. Geramos aqui um
 * gradiente na paleta da marca com o titulo escrito por cima — e depois
 * enviamos pelo pipeline Sharp de verdade, o mesmo do upload do CMS.
 */

/** Paleta MAKUCHO: azul elétrico, cobalto e naval. */
const PALETA = [
  ['#0B5FFF', '#0A2A6B'],
  ['#1A73FF', '#06215C'],
  ['#0047D6', '#001B4D'],
  ['#2B82FF', '#0B3A8F'],
  ['#0037A8', '#00143C'],
];

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Quebra o título em linhas que cabem na largura da imagem. */
function quebrarLinhas(texto: string, maxCaracteres: number, maxLinhas: number): string[] {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = '';

  for (const palavra of palavras) {
    const candidata = atual ? `${atual} ${palavra}` : palavra;
    if (candidata.length > maxCaracteres && atual) {
      linhas.push(atual);
      atual = palavra;
      if (linhas.length === maxLinhas - 1) break;
    } else {
      atual = candidata;
    }
  }
  if (atual && linhas.length < maxLinhas) linhas.push(atual);

  return linhas;
}

export interface OpcoesPlaceholder {
  largura: number;
  altura: number;
  titulo: string;
  etiqueta?: string;
}

/**
 * Gera um JPEG na paleta da marca. A cor sai do hash do titulo, entao a
 * mesma pauta gera sempre a mesma imagem — util para reexecutar o seed
 * sem encher o bucket de arquivos diferentes.
 */
export async function gerarImagemPlaceholder(opcoes: OpcoesPlaceholder): Promise<Buffer> {
  const { largura, altura, titulo, etiqueta } = opcoes;

  const indice = createHash('md5').update(titulo).digest()[0]! % PALETA.length;
  const [claro, escuro] = PALETA[indice]!;

  const tamanhoFonte = Math.round(largura / 18);
  const linhas = quebrarLinhas(titulo, Math.floor(largura / (tamanhoFonte * 0.5)), 3);
  const alturaLinha = Math.round(tamanhoFonte * 1.25);
  const baseY = altura / 2 + alturaLinha / 2 - ((linhas.length - 1) * alturaLinha) / 2;

  const svg = `
    <svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${claro}"/>
          <stop offset="100%" stop-color="${escuro}"/>
        </linearGradient>
      </defs>
      <rect width="${largura}" height="${altura}" fill="url(#g)"/>
      <polygon points="${largura * 0.72},${altura} ${largura},${altura * 0.35} ${largura},${altura}"
               fill="#ffffff" opacity="0.07"/>
      ${
        etiqueta
          ? `<text x="${largura * 0.06}" y="${altura * 0.14}" font-family="Arial, Helvetica, sans-serif"
                   font-size="${Math.round(tamanhoFonte * 0.42)}" font-weight="700"
                   fill="#ffffff" opacity="0.85" letter-spacing="3">${escaparXml(
                     etiqueta.toUpperCase(),
                   )}</text>`
          : ''
      }
      ${linhas
        .map(
          (linha, i) =>
            `<text x="${largura * 0.06}" y="${baseY + i * alturaLinha}"
                   font-family="Arial, Helvetica, sans-serif" font-size="${tamanhoFonte}"
                   font-weight="700" fill="#ffffff">${escaparXml(linha)}</text>`,
        )
        .join('')}
      <text x="${largura * 0.06}" y="${altura * 0.93}" font-family="Arial, Helvetica, sans-serif"
            font-size="${Math.round(tamanhoFonte * 0.46)}" font-weight="700"
            fill="#ffffff" opacity="0.9" letter-spacing="2">MAKUCHO</text>
    </svg>
  `;

  // JPEG porque e o que uma redacao envia de verdade; o pipeline se
  // encarrega de gerar WebP e AVIF a partir daqui.
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}
