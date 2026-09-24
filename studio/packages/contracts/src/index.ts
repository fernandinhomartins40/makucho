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
export * from './montagem-automatica';
export * from './estilos-de-legenda';
export * from './legendas-ass';
export * from './metricas-de-fontes';
export * from './textos-de-tela';
export * from './agenda';
export * from './pausas';
export * from './acabamento';
export * from './retomadas';
export * from './progresso';
export * from './fechamento';
export * from './ai-comando';
