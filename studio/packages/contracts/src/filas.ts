// ============================================================
// Nomes das filas.
//
// Vivem no contrato, e nao em cada lado, porque um nome divergente
// entre a API e o worker nao quebra build nem teste: o job vai para
// uma fila que ninguem escuta, e o projeto fica parado em silencio.
// Foi o tipo de erro que motivou trazer isto para ca.
//
// O BullMQ RECUSA dois pontos no nome da fila -- ele usa ":" como
// separador das proprias chaves no Redis. Por isso "studio-media" e
// nao "studio:media"; o prefixo compartilhado da o agrupamento que os
// dois pontos dariam.
// ============================================================

export const FILA_MIDIA = 'studio-media';
export const FILA_TRANSCRICAO = 'studio-transcription';
export const FILA_RENDER = 'studio-render';
/**
 * Análise automática: a transcrição termina e a proposta de edição
 * precisa nascer sem que ninguém aperte botão. Consumida pela API,
 * que é onde vivem a credencial de IA e o teto de gasto.
 */
export const FILA_ANALISE = 'studio-analysis';

export const FILAS = [FILA_MIDIA, FILA_TRANSCRICAO, FILA_ANALISE, FILA_RENDER] as const;
export type NomeDeFila = (typeof FILAS)[number];

/**
 * Prefixo das chaves do BullMQ no Redis.
 *
 * O Redis e compartilhado com outras aplicacoes da VPS (ADR 0003):
 * sem prefixo proprio, uma limpeza de chaves de outro app varreria
 * jobs do studio junto.
 */
export const PREFIXO_DAS_FILAS = '{studio}';
