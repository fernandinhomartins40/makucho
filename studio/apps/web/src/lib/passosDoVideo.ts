// ============================================================
// Os três passos de criar um vídeo: Roteiro, Gravar e Publicar.
//
// Ficam aqui porque três telas contam a mesma história: /novo mostra
// os três como cartões, /roteiros é o passo 1 e /gravar é o passo 2.
// Com os nomes num lugar só, elas não divergem.
//
// O roteiro vem primeiro: sem saber o que falar não há o que gravar.
// Publicar leva a "Meus vídeos": é de lá que o vídeo pronto é aberto e
// exportado (o Studio não posta nas redes).
// ============================================================

export const PASSOS_DE_CRIAR = [
  { titulo: 'Roteiro', href: '/roteiros?novo=1' },
  { titulo: 'Gravar', href: '/gravar' },
  { titulo: 'Publicar', href: '/' },
] as const;

/** Em /gravar, qual dos três passos acima está em curso. */
export const PASSO_DE_GRAVAR = 1;

/**
 * As telas de /gravar, uma de cada vez (todas dentro do passo Gravar).
 *
 * Eram quatro telas: a última ("Revisar") só repetia o que a pessoa
 * tinha acabado de escolher. O que é obrigatório vem primeiro (o
 * vídeo); o estilo tem um padrão bom (Automático) e os detalhes são
 * todos opcionais.
 */
export const TELAS_DE_GRAVAR = [
  {
    pergunta: 'Envie ou grave o seu vídeo',
    explicacao: 'Grave pela câmera ou envie um vídeo que você já tem.',
  },
  {
    pergunta: 'Escolha o estilo',
    explicacao: 'É a cara do vídeo: cores, letras e animações. Na dúvida, deixe no Automático.',
  },
  {
    pergunta: 'Algum detalhe para a IA?',
    explicacao: 'Tudo opcional: nome do vídeo, preço ou oferta. Depois a IA monta a edição.',
  },
] as const;
