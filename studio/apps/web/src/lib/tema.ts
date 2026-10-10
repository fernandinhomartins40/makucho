// ============================================================
// Tema claro ou escuro: o que o servidor e o navegador compartilham.
//
// Fica fora dos componentes porque o layout (servidor) precisa do
// texto do script, e de um arquivo 'use client' ele só receberia uma
// referência, não o texto.
// ============================================================

export const CHAVE_DO_TEMA = 'studio:tema';

/**
 * Aplica o tema salvo, ou o do aparelho, como `data-tema` no <html>,
 * e acompanha a troca do aparelho. Vai num <script> do <head>: roda
 * antes da primeira pintura, senão a tela piscaria clara antes de
 * escurecer.
 */
export const SCRIPT_DO_TEMA = `(function(){var m=window.matchMedia('(prefers-color-scheme: dark)');function aplicar(){var s=null;try{s=localStorage.getItem('${CHAVE_DO_TEMA}')}catch(e){}document.documentElement.dataset.tema=s==='claro'||s==='escuro'?s:m.matches?'escuro':'claro'}aplicar();if(m.addEventListener)m.addEventListener('change',aplicar)})()`;
