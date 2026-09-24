// ============================================================
// MAKUCHO STUDIO - Progresso do preparo do vídeo, ao vivo.
//
// A espera entre o envio e a proposta é a parte mais longa do produto,
// e uma lista de etapas parada gera ansiedade: "travou?". Os workers
// (e a análise, na API) publicam aqui onde estão, quanto falta e -- na
// transcrição -- as últimas frases que a IA acabou de ouvir. A tela
// consulta a cada segundo e transforma a espera em expectativa.
//
// Vive no Redis com validade: é estado de passagem, não histórico.
// ============================================================

export const ETAPAS_DO_PREPARO = ['preparando', 'transcrevendo', 'montando'] as const;
export type EtapaDoPreparo = (typeof ETAPAS_DO_PREPARO)[number];

export interface ProgressoDoPreparo {
  etapa: EtapaDoPreparo;
  /** 0 a 100, dentro da etapa. */
  pct: number;
  /** Transcrição: as últimas frases ouvidas, da mais antiga à mais nova. */
  ouvidas?: string[];
  /** Epoch em ms. */
  em: number;
}

/** Quanto tempo o progresso fica guardado depois da última notícia. */
export const VALIDADE_DO_PROGRESSO_S = 3600;

export function chaveDoProgresso(projectId: string): string {
  return `studio:progresso:${projectId}`;
}
