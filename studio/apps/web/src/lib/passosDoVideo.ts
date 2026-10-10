// ============================================================
// Os três passos de criar um vídeo: Roteiro, Vídeo e Edição.
//
// Ficam aqui porque três telas contam a mesma história: /novo mostra o
// caminho inteiro antes de começar, /roteiros é o passo 1 e /gravar
// anda pelos passos 2 e 3. Com os nomes num lugar só, elas não divergem.
//
// O roteiro vem primeiro: sem saber o que falar não há o que gravar.
// (Quem já tem o vídeo pronto pula o passo 1, mas ele continua na
// contagem: a régua é a mesma para todo mundo.)
// ============================================================

export const PASSOS_DE_CRIAR = [
  { titulo: 'Roteiro', explicacao: 'O texto que você vai falar. Você diz o assunto e a IA escreve.' },
  { titulo: 'Vídeo', explicacao: 'Grave lendo o roteiro na tela, ou envie um vídeo que você já tem.' },
  { titulo: 'Edição', explicacao: 'Escolha o estilo e a IA monta a edição.' },
] as const;

/**
 * As telas de /gravar, uma de cada vez. `passo` diz a qual dos três
 * passos acima cada uma pertence (o estilo e os detalhes são as duas
 * telas da Edição).
 *
 * Eram quatro telas: a última ("Revisar") só repetia o que a pessoa
 * tinha acabado de escolher. O que é obrigatório vem primeiro (o
 * vídeo); o estilo tem um padrão bom (Automático) e os detalhes são
 * todos opcionais.
 */
export const TELAS_DE_GRAVAR = [
  {
    passo: 1,
    pergunta: 'Envie ou grave o seu vídeo',
    explicacao: 'Grave pela câmera ou envie um vídeo que você já tem.',
  },
  {
    passo: 2,
    pergunta: 'Escolha o estilo',
    explicacao: 'É a cara do vídeo: cores, letras e animações. Na dúvida, deixe no Automático.',
  },
  {
    passo: 2,
    pergunta: 'Algum detalhe para a IA?',
    explicacao: 'Tudo opcional: nome do vídeo, preço ou oferta. Depois a IA monta a edição.',
  },
] as const;
