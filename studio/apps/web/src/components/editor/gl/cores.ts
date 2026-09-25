// ============================================================
// Tabelas de cor da prévia, calculadas uma vez por cor.
//
// A conta é a de contracts/cor.ts (a mesma que gera o .cube do render);
// aqui só se guarda o resultado, porque a tabela 33³ leva alguns
// milissegundos e a prévia pede a mesma cor a cada quadro.
// ============================================================

import { LADO_DA_TABELA, chaveDaCor, corEhNeutra, tabelaDeCor, type CorDoTrecho } from '@makucho/studio-contracts';
import type { TabelaDeCor } from './compositor';

const cache = new Map<string, TabelaDeCor>();

export function tabelaDaPrevia(cor: CorDoTrecho | undefined | null, lado = LADO_DA_TABELA): TabelaDeCor | null {
  if (!cor || corEhNeutra(cor)) return null;
  const chave = `${chaveDaCor(cor)}@${lado}`;
  let t = cache.get(chave);
  if (!t) {
    t = { chave, lado, dados: tabelaDeCor(cor, lado) };
    cache.set(chave, t);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return t;
}
