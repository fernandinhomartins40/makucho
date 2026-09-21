// ============================================================
// Nomes e cores das funções narrativas.
//
// Estavam duplicados em três arquivos, o que já tinha produzido
// divergência: a timeline pintava "hook" de azul enquanto o painel
// não pintava nada. Uma função tem um nome e uma cor, em um lugar.
// ============================================================

export const NOME_DA_FUNCAO: Record<string, string> = {
  hook: 'Hook',
  problem: 'Problema',
  context: 'Contexto',
  curiosity_gap: 'Curiosidade',
  authority: 'Autoridade',
  introduction: 'Apresentação',
  proof: 'Prova',
  insight: 'Insight',
  solution: 'Solução',
  pattern_interrupt: 'Quebra de padrão',
  payoff: 'Payoff',
  offer: 'Oferta',
  cta: 'CTA',
};

export const COR_DA_FUNCAO: Record<string, string> = {
  hook: '#2f66ff',
  problem: '#ff4d5e',
  context: '#64748b',
  curiosity_gap: '#8b5cf6',
  authority: '#22c55e',
  introduction: '#64748b',
  proof: '#22c55e',
  insight: '#eab308',
  solution: '#41c8ff',
  pattern_interrupt: '#f97316',
  payoff: '#22c55e',
  offer: '#f97316',
  cta: '#ec4899',
};

export function nomeDaFuncao(role: string): string {
  return NOME_DA_FUNCAO[role] ?? role;
}

export function corDaFuncao(role: string): string {
  return COR_DA_FUNCAO[role] ?? '#3a5a94';
}

/** m:ss — o formato que a pessoa lê no player. */
export function tempo(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}
