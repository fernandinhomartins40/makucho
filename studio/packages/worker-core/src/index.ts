// ============================================================
// MAKUCHO STUDIO - Nucleo compartilhado dos workers
//
// O que os tres workers (midia, transcricao, render) tem em comum:
// o lock global que serializa jobs pesados na VPS compartilhada e o
// diretorio temporario com limpeza garantida.
//
// Ambos vem do ADR 0003 -- sao as contencoes que tornam viavel
// processar video numa maquina dividida com outros clientes.
// ============================================================

export * from './global-lock';
export * from './tmp-dir';
export * from './ffmpeg';
export * from './render';
export * from './legendas';
export * from './juntar';
