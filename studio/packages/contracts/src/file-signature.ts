// ============================================================
// MAKUCHO STUDIO - Deteccao de tipo pelos bytes
//
// Plano, secao 10.2: "validar MIME pelos bytes, nao apenas extensao".
//
// Extensao e Content-Type sao informados por quem envia, e ambos
// mentem com facilidade. Um .png que na verdade e um HTML com script
// vira XSS quando servido; um executavel renomeado para .mp4 entra
// no volume de midia. A assinatura esta dentro do arquivo e nao
// depende de boa-fe.
// ============================================================

interface Assinatura {
  readonly mime: string;
  readonly bytes: readonly number[];
  /** Deslocamento onde a assinatura comeca. */
  readonly offset?: number;
}

// Ordem importa: as mais especificas primeiro, porque WebP e MP4
// compartilham o prefixo com outros formatos de container.
const ASSINATURAS: readonly Assinatura[] = [
  // Imagens
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },

  // Fontes
  { mime: 'font/woff2', bytes: [0x77, 0x4f, 0x46, 0x32] },
  { mime: 'font/woff', bytes: [0x77, 0x4f, 0x46, 0x46] },
  { mime: 'font/ttf', bytes: [0x00, 0x01, 0x00, 0x00, 0x00] },

  // Audio
  { mime: 'audio/mpeg', bytes: [0x49, 0x44, 0x33] }, // ID3
  { mime: 'audio/mpeg', bytes: [0xff, 0xfb] },       // MPEG frame
  { mime: 'audio/wav', bytes: [0x52, 0x49, 0x46, 0x46] },
  { mime: 'audio/ogg', bytes: [0x4f, 0x67, 0x67, 0x53] },

  // Video
  { mime: 'video/mp4', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { mime: 'video/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
];

function combina(buffer: Uint8Array, assinatura: Assinatura): boolean {
  const inicio = assinatura.offset ?? 0;
  if (buffer.length < inicio + assinatura.bytes.length) return false;
  return assinatura.bytes.every((b, i) => buffer[inicio + i] === b);
}

/**
 * Descobre o tipo real do arquivo pelos primeiros bytes.
 *
 * Devolve `null` quando nao reconhece: o chamador deve recusar, nao
 * assumir o que o cliente disse.
 */
export function detectarMimeReal(buffer: Uint8Array): string | null {
  for (const assinatura of ASSINATURAS) {
    if (combina(buffer, assinatura)) {
      // RIFF cobre WAV e WebP: sem o marcador secundario, um WebP
      // entraria como audio.
      if (assinatura.mime === 'audio/wav' && buffer.length >= 12) {
        const marcador = String.fromCharCode(...buffer.slice(8, 12));
        if (marcador === 'WEBP') return 'image/webp';
        if (marcador !== 'WAVE') return null;
      }
      return assinatura.mime;
    }
  }

  // SVG e JSON sao texto: nao tem assinatura binaria. Verificados a
  // parte, com cuidado redobrado -- SVG pode conter <script>.
  // Decodificacao ASCII a mao em vez de TextDecoder: este pacote e
  // consumido pela API e pelo navegador, e nao deve depender dos
  // tipos de Node. Os marcadores procurados (<?xml, <svg, {) sao
  // todos ASCII, entao byte-a-byte basta.
  let inicio = '';
  for (let i = 0; i < Math.min(buffer.length, 512); i += 1) {
    const byte = buffer[i];
    if (byte === undefined) break;
    inicio += String.fromCharCode(byte);
  }
  inicio = inicio.trimStart();

  if (inicio.startsWith('<?xml') || inicio.startsWith('<svg')) {
    return inicio.includes('<svg') ? 'image/svg+xml' : null;
  }

  if (inicio.startsWith('{')) return 'application/json';

  return null;
}

/** Conteudo ativo dentro de um SVG (plano, secao 10.2). */
const PADROES_PERIGOSOS: readonly RegExp[] = [
  /<script[\s>]/i,
  /\son\w+\s*=/i,          // onload=, onclick=, ...
  /javascript:/i,
  /<foreignObject[\s>]/i,  // permite HTML arbitrario dentro do SVG
  /<use[^>]+href\s*=\s*["']?https?:/i, // referencia externa
  /<!ENTITY/i,             // XXE
];

export interface ResultadoSvg {
  seguro: boolean;
  motivo?: string;
}

/**
 * Recusa SVG com conteudo executavel.
 *
 * Um SVG e um documento XML: servido inline, seu script roda no
 * dominio da aplicacao, com acesso aos cookies de sessao. Como o
 * cliente envia o proprio logo, o arquivo e confiavel na intencao e
 * nao na forma -- um editor grafico pode embutir script sem que
 * ninguem perceba.
 */
export function svgEhSeguro(conteudo: string): ResultadoSvg {
  for (const padrao of PADROES_PERIGOSOS) {
    if (padrao.test(conteudo)) {
      return { seguro: false, motivo: `conteudo ativo detectado: ${padrao.source}` };
    }
  }
  return { seguro: true };
}

export interface ValidacaoArquivo {
  ok: boolean;
  mimeReal?: string;
  erro?: string;
}

/**
 * Valida o arquivo recebido contra o que foi declarado.
 *
 * @param buffer     primeiros bytes do arquivo (512 bastam)
 * @param mimeDeclarado Content-Type informado pelo cliente
 * @param permitidos MIMEs aceitos para o tipo de asset
 */
export function validarArquivo(
  buffer: Uint8Array,
  mimeDeclarado: string,
  permitidos: readonly string[],
): ValidacaoArquivo {
  const mimeReal = detectarMimeReal(buffer);

  if (!mimeReal) {
    return { ok: false, erro: 'formato nao reconhecido' };
  }

  // O que vale e o conteudo. A divergencia em si ja e sinal de
  // problema: ou o cliente errou, ou tentou disfarcar o arquivo.
  if (mimeReal !== mimeDeclarado) {
    return {
      ok: false,
      mimeReal,
      erro: `o arquivo e ${mimeReal}, mas foi enviado como ${mimeDeclarado}`,
    };
  }

  if (!permitidos.includes(mimeReal)) {
    return {
      ok: false,
      mimeReal,
      erro: `${mimeReal} nao e aceito para este tipo de asset`,
    };
  }

  return { ok: true, mimeReal };
}
