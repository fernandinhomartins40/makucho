// ============================================================
// MAKUCHO STUDIO - Contratos compartilhados
//
// Consumido por studio-api, studio-web e pelos tres workers. E o
// unico lugar onde os formatos trocados entre eles sao definidos:
// se o EditPlan mudar, muda aqui e o typecheck aponta todos os
// pontos afetados.
// ============================================================

export * from './vocabulary';
export * from './edit-plan';
export * from './ai-proposal';
export * from './ai-roteiro';
export * from './ai-refino';
export * from './semantic-safety';
export * from './brand';
export * from './file-signature';
export * from './script';
export * from './project';
export * from './filas';
export * from './ingest';
export * from './retention';
export * from './timeline';
export * from './bridge';
export * from './events';
export * from './ai-usage';
export * from './compilador';
