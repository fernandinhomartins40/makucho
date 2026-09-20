import sharp from 'sharp';
import { createHash } from 'node:crypto';

/**
 * Imagens de demonstracao geradas localmente (secao 42).
 *
 * O layout aprovado usa capas com chamada tipografica embutida na arte
 * ("COMO INVESTIR EM 2026?"), nao fotos limpas. Reproduzimos esse estilo
 * aqui: fundo em degrade da marca, malha de linhas ao fundo, a chamada
 * em caixa alta com a palavra de destaque em amarelo, e a assinatura do
 * MAKUCHO no rodape.
 *
 * Gerar em vez de baixar mantem a instalacao independente de rede e sem
 * conteudo de terceiros no repositorio. A redacao troca pelas fotos
 * reais pelo CMS.
 */

/** Degrades da paleta MAKUCHO: azul da marca sobre naval. */
const PALETA: Array<[string, string]> = [
  ['#1a5fd4', '#0a1f44'],
  ['#2563eb', '#0d2851'],
  ['#0d47b8', '#071a3a'],
  ['#3b82f6', '#123163'],
  ['#1e40af', '#0a1f44'],
];

/** Amarelo de destaque, como nas artes do layout. */
const DESTAQUE = '#ffc93c';

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Quebra a chamada em linhas curtas, como num letreiro. */
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
  /** Sem a chamada embutida: usado em avatar e capa de editoria. */
  semTexto?: boolean;
}

/**
 * Gera um JPEG na paleta da marca. A cor sai do hash do titulo, entao a
 * mesma pauta gera sempre a mesma imagem — util para reexecutar o seed
 * sem encher o volume de arquivos diferentes.
 */
export async function gerarImagemPlaceholder(opcoes: OpcoesPlaceholder): Promise<Buffer> {
  const { largura, altura, titulo, etiqueta, semTexto = false } = opcoes;

  const digest = createHash('md5').update(titulo).digest();
  const [claro, escuro] = PALETA[digest[0]! % PALETA.length]!;

  // Malha de linhas diagonais ao fundo, que da textura de "dado
  // financeiro" sem depender de imagem externa.
  const linhasFundo = Array.from({ length: 9 }, (_, i) => {
    const y = (altura / 9) * i;
    return `<line x1="0" y1="${y}" x2="${largura}" y2="${y - altura * 0.22}"
              stroke="#ffffff" stroke-width="1" opacity="0.05"/>`;
  }).join('');

  let blocoTexto = '';

  if (!semTexto) {
    const tamanhoFonte = Math.round(largura / 11);
    const linhas = quebrarLinhas(
      titulo.toUpperCase(),
      Math.max(10, Math.floor(largura / (tamanhoFonte * 0.56))),
      3,
    );
    const alturaLinha = Math.round(tamanhoFonte * 1.08);
    const baseY = altura * 0.52 - ((linhas.length - 1) * alturaLinha) / 2;

    blocoTexto = linhas
      .map((linha, i) => {
        // A ultima linha sai em amarelo, como a palavra de destaque das
        // artes do layout.
        const cor = i === linhas.length - 1 && linhas.length > 1 ? DESTAQUE : '#ffffff';
        return `<text x="${largura * 0.07}" y="${baseY + i * alturaLinha}"
                  font-family="Arial Black, Arial, Helvetica, sans-serif"
                  font-size="${tamanhoFonte}" font-weight="900" fill="${cor}"
                  letter-spacing="-1">${escaparXml(linha)}</text>`;
      })
      .join('');
  }

  const fonteEtiqueta = Math.max(10, Math.round(largura / 38));

  const svg = `
    <svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${claro}"/>
          <stop offset="100%" stop-color="${escuro}"/>
        </linearGradient>
      </defs>
      <rect width="${largura}" height="${altura}" fill="url(#g)"/>
      ${linhasFundo}
      <polygon points="${largura * 0.68},${altura} ${largura},${altura * 0.3} ${largura},${altura}"
               fill="#ffffff" opacity="0.06"/>
      ${
        etiqueta
          ? `<rect x="${largura * 0.07}" y="${altura * 0.1}"
                   width="${etiqueta.length * fonteEtiqueta * 0.72 + fonteEtiqueta}"
                   height="${fonteEtiqueta * 1.9}" rx="3" fill="#ffffff" opacity="0.16"/>
             <text x="${largura * 0.07 + fonteEtiqueta * 0.5}"
                   y="${altura * 0.1 + fonteEtiqueta * 1.35}"
                   font-family="Arial, Helvetica, sans-serif" font-size="${fonteEtiqueta}"
                   font-weight="700" fill="#ffffff" letter-spacing="2">${escaparXml(
                     etiqueta.toUpperCase(),
                   )}</text>`
          : ''
      }
      ${blocoTexto}
      <text x="${largura * 0.07}" y="${altura * 0.92}"
            font-family="Arial, Helvetica, sans-serif"
            font-size="${Math.max(9, Math.round(largura / 42))}"
            font-weight="800" fill="#ffffff" opacity="0.82"
            letter-spacing="3">MAKUCHO</text>
    </svg>
  `;

  // JPEG porque e o que uma redacao envia de verdade; o pipeline gera
  // WebP e AVIF a partir daqui.
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}
