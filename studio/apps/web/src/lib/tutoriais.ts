// ============================================================
// Os tutoriais guiados: a própria tela do Studio ensinando a usar.
//
// Cada tutorial é curto (uma tela, poucos passos) e destaca um elemento
// de verdade por vez, com uma frase do que ele faz. Nos passos marcados
// com `clicar`, a pessoa avança tocando no próprio botão -- aprende
// fazendo, em vez de só ler. O primeiro de cada tela aparece sozinho na
// primeira visita; depois, fica no botão "Tutorial" e na Ajuda.
//
// Os alvos são listas de seletores: vale o primeiro que estiver VISÍVEL
// (a barra lateral no computador, a barra de abas no celular). Um passo
// sem alvo visível é pulado -- o tutorial nunca trava numa tela que
// mudou.
// ============================================================

export type Lado = 'top' | 'right' | 'bottom' | 'left';

export interface PassoDoTutorial {
  /** Seletores do elemento destacado; sem alvo, o passo aparece no meio da tela. */
  alvo?: string[];
  titulo: string;
  texto: string;
  lado?: Lado;
  /** A pessoa avança tocando no próprio elemento (aprender fazendo). */
  clicar?: boolean;
  /** Quanto esperar o alvo aparecer (ms): o passo depois de um toque que muda a tela. */
  esperar?: number;
}

export interface Tutorial {
  id: string;
  titulo: string;
  /** Uma linha para a lista da Ajuda. */
  resumo: string;
  /** Onde ele vale (o começo do caminho da página). */
  pagina: string;
  /** Vale nesta tela agora? (o modo do editor, o aparelho...). */
  quando?: () => boolean;
  /** Aparece sozinho quando este elemento surge na tela (sem ser na abertura da página). */
  gatilho?: string;
  passos: PassoDoTutorial[];
}

const celular = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
const noModo = (modo: 'pratico' | 'completo') => () => !!document.querySelector(`.editor[data-modo='${modo}']`);

export const TUTORIAIS: Tutorial[] = [
  {
    id: 'inicio',
    titulo: 'Conhecendo o Studio',
    resumo: 'Onde ficam seus vídeos, como criar um novo e onde configurar sua marca.',
    pagina: '/',
    passos: [
      {
        titulo: 'Bem-vindo ao Studio! 👋',
        texto: 'Em menos de um minuto você conhece o caminho. Você grava (ou envia) o vídeo, a IA corta, legenda e anima, e você só confere e publica.',
      },
      {
        alvo: ['.inicio__acoes a[href="/novo"]', '.barra-inferior__criar'],
        titulo: 'Criar um vídeo',
        texto: 'Comece sempre por aqui. São 3 passos: o roteiro (a IA ajuda a escrever), a gravação e a publicação.',
        lado: 'bottom',
      },
      {
        alvo: ['.inicio__acoes a[href^="/gravar"]'],
        titulo: 'Já tem um vídeo gravado?',
        texto: 'Envie direto por aqui. Pode ser um vídeo ou vários: eles viram um vídeo só, e a IA monta a edição.',
        lado: 'bottom',
      },
      {
        alvo: ['.projetos__grade article.cartao'],
        titulo: 'Seus vídeos',
        texto: 'Cada vídeo aparece aqui com a etapa em que está: Transcrevendo, Proposta pronta, Em edição ou Concluído. Toque na imagem para abrir.',
        lado: 'right',
      },
      {
        alvo: ['.projetos__grade article.cartao button[aria-haspopup]', '.projetos__grade article.cartao .linha.entre button'],
        titulo: 'Mais opções do vídeo',
        texto: 'Nos três pontinhos: pedir a revisão final da IA, arquivar ou apagar o vídeo.',
        lado: 'left',
      },
      {
        alvo: ['.sidebar a[href="/marca"]', '.barra-inferior a[href="/marca"]'],
        titulo: 'Minha marca',
        texto: 'Configure uma vez: logo, cores e fontes. Tudo isso entra sozinho em todos os vídeos.',
        lado: 'right',
      },
      {
        alvo: ['[data-tutorial-botao]'],
        titulo: 'Quer ver de novo?',
        texto: 'Toque aqui em qualquer tela para rever o tutorial dela. A lista completa fica em Ajuda.',
        lado: 'bottom',
      },
    ],
  },
  {
    id: 'criar',
    titulo: 'Criar um vídeo',
    resumo: 'Os 3 passos do vídeo: roteiro, gravação e publicação.',
    pagina: '/novo',
    passos: [
      {
        alvo: ['.criar a[href^="/roteiros"]', 'a[href^="/roteiros"]'],
        titulo: 'Passo 1 · Roteiro',
        texto: 'Diga em poucas palavras sobre o que é o vídeo e a IA escreve o roteiro, com abertura que prende e chamada no final.',
        lado: 'bottom',
      },
      {
        alvo: ['.criar a[href^="/gravar"]'],
        titulo: 'Passo 2 · Gravar',
        texto: 'Grave com o texto passando na tela (teleprompter) ou envie um vídeo que você já tem.',
        lado: 'bottom',
      },
      {
        alvo: ['.criar a[href^="/publicar"]'],
        titulo: 'Passo 3 · Publicar',
        texto: 'Escolha o vídeo editado, exporte e compartilhe com a legenda do post já escrita pela IA.',
        lado: 'bottom',
      },
    ],
  },
  {
    id: 'roteiro',
    titulo: 'Escrever o roteiro com a IA',
    resumo: 'Como pedir um roteiro, falar em vez de digitar e escolher a duração.',
    pagina: '/roteiros',
    passos: [
      {
        alvo: ['.roteiro-novo textarea', 'textarea'],
        titulo: 'Sobre o que é o vídeo?',
        texto: 'Escreva do seu jeito, como se contasse para um amigo. Ex.: "3 hábitos para uma manhã mais saudável".',
        lado: 'bottom',
      },
      {
        alvo: ['button[aria-label*="Falar"]', '.botao-de-ditado'],
        titulo: 'Prefere falar?',
        texto: 'Toque em Falar e diga a ideia em voz alta: o texto aparece sozinho.',
        lado: 'top',
      },
      {
        alvo: ['.roteiro-novo select', 'select'],
        titulo: 'Duração',
        texto: 'Deixe "A IA decide" ou escolha quanto tempo o vídeo deve ter.',
        lado: 'top',
      },
      {
        alvo: ['button[data-criar-roteiro]', '.roteiro-novo button.botao:not(.botao--secundario)'],
        titulo: 'Criar roteiro',
        texto: 'A IA monta o roteiro em blocos (abertura, conteúdo, chamada). Depois você pode mudar qualquer frase.',
        lado: 'top',
      },
      {
        alvo: ['[data-meus-roteiros]'],
        titulo: 'Meus roteiros',
        texto: 'Todos os roteiros ficam guardados aqui, para gravar quando quiser.',
        lado: 'bottom',
      },
    ],
  },
  {
    id: 'gravar',
    titulo: 'Gravar ou enviar o vídeo',
    resumo: 'Gravar com o teleprompter, enviar vídeos prontos e seguir para a edição.',
    pagina: '/gravar',
    passos: [
      {
        alvo: ['.roteiro-da-gravacao'],
        titulo: 'O roteiro da gravação',
        texto: 'Escolha um roteiro e ele passa na tela enquanto você grava. Sem roteiro, aparecem dicas do que falar.',
        lado: 'bottom',
      },
      {
        alvo: ['.assistente__caminhos .caminho--principal'],
        titulo: 'Enviar um vídeo pronto',
        texto: 'Escolha um ou vários vídeos do celular ou do computador. Eles viram um vídeo só, na ordem que você quiser.',
        lado: 'bottom',
      },
      {
        alvo: ['.assistente__caminhos .caminho:not(.caminho--principal)'],
        titulo: 'Gravar agora',
        texto: 'Abre a câmera com o texto passando na tela. Dica: grave na vertical, com luz de frente.',
        lado: 'bottom',
      },
      {
        alvo: ['.assistente__rodape .botao:not(.botao--fantasma)'],
        titulo: 'Continuar',
        texto: 'Com o vídeo enviado, toque em Continuar. A IA transcreve a fala, escolhe os melhores trechos e monta a edição — leva alguns minutos e você pode fechar a tela.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'editor-pratico',
    titulo: 'Editar o vídeo (modo prático)',
    resumo: 'Assistir, entrar na edição, mudar o que aparece na tela e pedir à IA.',
    pagina: '/editor',
    quando: noModo('pratico'),
    passos: [
      {
        titulo: 'Seu vídeo já vem editado ✂️',
        texto: 'A IA cortou, legendou e colocou animações. Aqui você confere e ajusta o que quiser — tudo salva sozinho.',
      },
      {
        alvo: ['.pratico__tempo'],
        titulo: 'Assistir',
        texto: 'Toque no vídeo para tocar e pausar. Arraste a barra para ir a qualquer momento.',
        lado: 'top',
      },
      {
        alvo: ['.pratico__editar'],
        titulo: 'Entrar na edição',
        texto: 'Toque em Editar agora para continuar o tutorial.',
        lado: 'bottom',
        clicar: true,
      },
      {
        alvo: ['.pratico__cena'],
        titulo: 'O que está na tela agora',
        texto: 'Aqui aparece tudo o que está no vídeo neste momento: a animação, a legenda, o trecho. Toque num item para mudá-lo.',
        lado: 'top',
        esperar: 3000,
      },
      {
        alvo: ['.pratico__chip[data-tudo]'],
        titulo: 'Tudo no vídeo',
        texto: 'A lista de tudo o que o vídeo tem, do começo ao fim. Tocar num item leva o vídeo até ele.',
        lado: 'top',
      },
      {
        alvo: ['.pratico__acoes button:first-child'],
        titulo: 'Adicionar',
        texto: 'Coloque texto, imagem, música, enfeite, animação, efeito, som ou grave a sua voz por cima.',
        lado: 'top',
      },
      {
        alvo: ['.pratico__acoes button[data-ia]'],
        titulo: 'Pedir à IA',
        texto: 'Escreva o que quer, do seu jeito: "deixa a legenda maior", "coloca uma música animada". A IA faz por você.',
        lado: 'top',
      },
      {
        alvo: ['.pratico__acoes button:last-child'],
        titulo: 'Mais ajustes',
        texto: 'Estilo da legenda, cor e filtro, transições, formato, volume, tirar silêncios e a revisão final da IA.',
        lado: 'top',
      },
      {
        alvo: ['.pratico__topo [aria-label="Desfazer"]'],
        titulo: 'Errou? Sem problema',
        texto: 'Desfazer e Refazer voltam qualquer mudança.',
        lado: 'bottom',
      },
      {
        alvo: ['.pratico__exportar'],
        titulo: 'Exportar',
        texto: 'Quando estiver do seu gosto, exporte. O vídeo final sai em alta qualidade, pronto para postar.',
        lado: 'bottom',
      },
    ],
  },
  {
    id: 'editor-completo',
    titulo: 'Editar o vídeo (editor completo)',
    resumo: 'As ferramentas, a linha do tempo, a pré-visualização e a exportação no computador.',
    pagina: '/editor',
    quando: noModo('completo'),
    passos: [
      {
        titulo: 'O editor completo 🎬',
        texto: 'O seu vídeo já vem montado pela IA. Aqui você tem todas as ferramentas e a linha do tempo, como num editor profissional.',
      },
      {
        alvo: ['.editor__rail'],
        titulo: 'Ferramentas',
        texto: 'Escolha o que adicionar ou mudar: imagens, textos, animações, legendas, música, sons, efeitos, transições, filtros, enfeites e marca.',
        lado: 'right',
      },
      {
        alvo: ['.painel-da-ia textarea', '.painel-da-ia input', '.editor__ia'],
        titulo: 'Peça à IA',
        texto: 'Escreva o que quer mudar, do seu jeito, e toque em Aplicar. Ou use uma das sugestões prontas.',
        lado: 'right',
      },
      {
        alvo: ['.palco__quadro', '.editor__palco'],
        titulo: 'O vídeo',
        texto: 'Toque num texto, legenda ou animação para selecionar, mover e mudar o tamanho. As linhas tracejadas mostram onde o Instagram e o TikTok põem os botões.',
        lado: 'left',
      },
      {
        alvo: ['.editor__timeline'],
        titulo: 'Linha do tempo',
        texto: 'Cada faixa é uma parte do vídeo: os trechos da fala, as animações, a legenda e o som. Arraste para mudar de lugar ou de tamanho.',
        lado: 'top',
      },
      {
        alvo: ['button[title*="Assistir do começo"]'],
        titulo: 'Pré-visualizar',
        texto: 'Assiste do começo, exatamente como o vídeo vai sair.',
        lado: 'bottom',
      },
      {
        alvo: ['button[aria-label="Modo prático"]'],
        titulo: 'Modo prático',
        texto: 'Prefere algo mais simples? O modo prático deixa o vídeo na tela toda e você edita tocando nele.',
        lado: 'bottom',
      },
      {
        alvo: ['.topbar--editor .botao:not(.botao--secundario)'],
        titulo: 'Exportar vídeo',
        texto: 'Gera o vídeo final em alta qualidade, pronto para postar.',
        lado: 'bottom',
      },
    ],
  },
  {
    id: 'animacao',
    titulo: 'Ajustar as peças de uma animação',
    resumo: 'Selecionar textos, ícones e conjuntos da animação, mover, aumentar e aplicar.',
    pagina: '/editor',
    gatilho: '.palco__edicao-animacao .palco__peca',
    passos: [
      {
        alvo: ['.palco__edicao-animacao'],
        titulo: 'Cada peça da animação',
        texto: 'Toque num texto ou ícone para selecionar. Toque de novo para pegar o conjunto todo (o fundo com o texto).',
        lado: 'left',
      },
      {
        alvo: ['.palco__etiqueta-da-selecao'],
        titulo: 'A etiqueta da peça',
        texto: 'Mover (arraste a setinha), selecionar o conjunto, editar o texto ou escolher várias peças de uma vez.',
        lado: 'bottom',
        esperar: 1500,
      },
      {
        alvo: ['.palco__barra-da-peca'],
        titulo: 'Maior ou menor',
        texto: 'Use − e + para mudar o tamanho, ou arraste os cantinhos da peça. Com dois dedos, você amplia a vista para ajustar com precisão. No fim, toque em Aplicar para gravar o ajuste (Desfazer volta como estava).',
        lado: 'bottom',
      },
    ],
  },
  {
    id: 'marca',
    titulo: 'Configurar a sua marca',
    resumo: 'Logo, cores, fontes e o ramo do negócio, aplicados em todos os vídeos.',
    pagina: '/marca',
    passos: [
      {
        alvo: ['.marca-ia, [data-marca-ia]', '.conteudo .cartao:first-of-type'],
        titulo: 'A IA monta a sua marca',
        texto: 'Envie a sua logo e a IA tira dela as cores, as fontes e o estilo. Você confere antes de usar.',
        lado: 'bottom',
      },
      {
        alvo: ['.conteudo select'],
        titulo: 'O seu negócio',
        texto: 'Escolha o ramo: a IA ajusta o jeito de montar os vídeos para o seu público.',
        lado: 'bottom',
      },
      {
        alvo: ['.conteudo details summary'],
        titulo: 'Ajustar à mão',
        texto: 'Logos, cores, fontes, estilo da legenda, abertura, encerramento e trilha padrão. Tudo o que você salvar aqui entra nos próximos vídeos.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'configuracoes',
    titulo: 'Configurações',
    resumo: 'A chave da IA, o gasto do mês, o espaço e o app no celular.',
    pagina: '/configuracoes',
    passos: [
      {
        alvo: ['[role="tablist"]', '.abas'],
        titulo: 'As abas',
        texto: 'IA (a conexão e o gasto), Imagens grátis (bancos de imagens), Espaço (quanto você usou) e App (instalar no celular).',
        lado: 'bottom',
      },
      {
        alvo: ['.conteudo .cartao:first-of-type'],
        titulo: 'Conexão com a IA',
        texto: 'A IA do Studio usa uma chave da DeepSeek. Com ela salva e "Ativa", tudo funciona. Use "Testar a chave" se algo parecer errado.',
        lado: 'bottom',
      },
      {
        alvo: ['.conteudo .cartao:nth-of-type(2)'],
        titulo: 'Gasto da IA',
        texto: 'Quanto a IA custou no mês e o limite. Ao chegar perto do limite, o Studio avisa antes de parar.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'publicar',
    titulo: 'Publicar o vídeo',
    resumo: 'Escolher o vídeo, exportar e compartilhar com a legenda do post.',
    pagina: '/publicar',
    passos: [
      {
        alvo: ['.publicar__lista li:first-child a'],
        titulo: 'Escolha o vídeo',
        texto: 'Toque no vídeo: ele abre e a exportação começa sozinha.',
        lado: 'bottom',
      },
      {
        titulo: 'Vídeo pronto 🎉',
        texto: 'Quando terminar, aparece a legenda do post e as hashtags escritas pela IA, com os botões para baixar e compartilhar no Instagram, TikTok ou WhatsApp.',
      },
    ],
  },
];

/** Os tutoriais que valem nesta página e neste estado da tela. */
export function tutoriaisDaPagina(caminho: string): Tutorial[] {
  return TUTORIAIS.filter((t) => (t.pagina === '/' ? caminho === '/' : caminho.startsWith(t.pagina)) && (!t.quando || t.quando()));
}

export const ehCelular = celular;
