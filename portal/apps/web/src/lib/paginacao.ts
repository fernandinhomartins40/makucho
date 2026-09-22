/** Evita enviar pagina fracionária, infinita ou fora do intervalo numérico seguro à API. */
export function paginaDaUrl(valor?: string): number {
  const pagina = Number(valor);
  return Number.isSafeInteger(pagina) && pagina > 0 ? pagina : 1;
}
