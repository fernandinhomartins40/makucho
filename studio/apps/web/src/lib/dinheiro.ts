// ============================================================
// Dólares na tela, a partir de centavos (com fração).
//
// O gasto de IA é real e pequeno: uma seleção custa uma fração de
// centavo. Mostrar "US$ 0,00" esconderia o gasto, e "US$ 0,01"
// (arredondado) o exageraria — abaixo de um centavo, quatro casas.
// ============================================================

export function dolares(centavos: number): string {
  const valor = centavos / 100;
  if (valor > 0 && valor < 0.01) return `US$ ${valor.toFixed(4).replace('.', ',')}`;
  return `US$ ${valor.toFixed(2).replace('.', ',')}`;
}
