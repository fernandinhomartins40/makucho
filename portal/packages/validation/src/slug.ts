/**
 * Geracao de slug (secao 35).
 *
 * Usado no backend ao salvar e no admin para pre-visualizar a URL enquanto
 * o usuario digita o titulo. Por isso mora no pacote compartilhado: as duas
 * pontas precisam produzir exatamente o mesmo resultado.
 */

/** Caracteres que a normalizacao NFD nao separa em base + acento. */
const CARACTERES_ESPECIAIS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  ø: 'o',
  å: 'a',
  đ: 'd',
  ħ: 'h',
  ı: 'i',
  ł: 'l',
  ŋ: 'n',
  œ: 'oe',
  ŧ: 't',
  '&': '-e-',
  '@': '-at-',
  '%': '-porcento-',
  '+': '-mais-',
};

/**
 * Converte um texto em slug: minusculo, sem acentos, separado por hifens.
 *
 *   "Política Econômica & Inflação" -> "politica-economica-e-inflacao"
 */
export function gerarSlug(texto: string): string {
  if (!texto) return '';

  let resultado = texto.toLowerCase().trim();

  for (const [de, para] of Object.entries(CARACTERES_ESPECIAIS)) {
    resultado = resultado.split(de).join(para);
  }

  resultado = resultado
    // NFD separa "ç" em "c" + cedilha; o range remove os diacriticos.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Tudo que nao for letra, numero ou hifen vira separador
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return resultado;
}

/**
 * Acrescenta sufixo numerico ate achar um slug livre.
 * "economia" ocupado -> "economia-2" -> "economia-3"...
 */
export function gerarSlugUnico(base: string, existentes: readonly string[]): string {
  const slug = gerarSlug(base);
  if (!slug) return '';

  const ocupados = new Set(existentes);
  if (!ocupados.has(slug)) return slug;

  let contador = 2;
  while (ocupados.has(`${slug}-${contador}`)) {
    contador += 1;
  }
  return `${slug}-${contador}`;
}

/** Um slug valido tem so minusculas, numeros e hifens simples. */
export const REGEX_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugValido(valor: string): boolean {
  return REGEX_SLUG.test(valor);
}
