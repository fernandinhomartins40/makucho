// ============================================================
// MAKUCHO STUDIO - As técnicas de cena (motion graphics).
//
// Cada técnica é um MÓDULO, no formato das skills que a comunidade usa
// com agentes (os `categories/<id>/module.md` da skill motion-graphics do
// HyperFrames): quando usar, o que a direção precisa decidir e COMO se
// constrói -- com números. A direção escolhe a técnica pelo que a fala
// tem; o desenho recebe só o módulo da técnica daquela cena.
//
// Não é uma lista fechada de "tipos de cartão": é o repertório que tira o
// pedido do vago. "livre" existe para o que o repertório não cobre -- e aí
// a direção tem de especificar no mesmo nível de detalhe.
// ============================================================

export interface TecnicaDeCena {
  chave: string;
  nome: string;
  /** A evidência na fala que a pede. */
  quando: string;
  /** O que a direção decide e escreve no plano da cena. */
  plano: string;
  /** Como se constrói: composição, números, coreografia. */
  construcao: string;
  /** O que denuncia a versão amadora desta técnica. */
  evitar: string;
  /** Onde costuma funcionar melhor. */
  layouts: string;
}

export const TECNICAS_DE_CENA: readonly TecnicaDeCena[] = [
  {
    chave: 'tipografia_cinetica',
    nome: 'Tipografia cinética',
    quando: 'uma frase de peso, a tese, a virada -- a fala É a imagem',
    plano: 'a frase exata (até 9 palavras), dividida em blocos de 1 a 3 palavras; 1 ou 2 palavras de ênfase; o arco (gancho, construção, impacto, resolução)',
    construcao:
      'Um bloco por vez no quadro, trocando por CORTE SECO no instante da palavra seguinte (o bloco anterior some em 0,08 s). Corpo de 150 a 240 px, peso 800-900, letter-spacing -0.03em, alinhado à esquerda na área útil ou em diagonal de leitura -- nunca tudo centralizado no mesmo ponto. A palavra de ênfase muda UMA coisa (cor de destaque, ou escala 1.3x, ou itálico) e entra com peso (BATE: y -200, power4.in, 0,22 s, tremor de 0,2 s no palco). As outras SOBEM por máscara (yPercent 110 a 0, expo.out, 0,35 s). Fundo: a palavra de ênfase gigante e apagada (5% de opacidade), cortada pela borda.',
    evitar: 'a frase inteira na tela de uma vez; todas as palavras do mesmo tamanho; fade em tudo',
    layouts: 'tela_cheia (impacto) ou meio_a_meio',
  },
  {
    chave: 'dado_em_destaque',
    nome: 'Dado em destaque',
    quando: 'um número, porcentagem, valor ou prazo dito',
    plano: 'o valor EXATO dito (com prefixo e sufixo: R$, %, x, mil), um rótulo de até 5 palavras dizendo o que ele mede, e a forma que dá a medida (anel, barra, proporção em pontos, régua)',
    construcao:
      'O número é o herói: 220 a 320 px, tabular-nums, largura fixa. CONTA de 0 (ou de um valor de partida plausível) até o valor dito em 0,9 a 1,4 s com power2.out, começando 0,1 s antes da palavra do número, e TRAVA com um pulso (scale 1.08, 0,18 s). O rótulo em caixa alta, 28-34 px, com filete, entra antes do número. A forma de medida cresce JUNTO com a contagem (anel: strokeDashoffset; barra: scaleX; pontos: stagger) e para na mesma fração. Depois de travar, um brilho varre o número uma vez.',
    evitar: 'número que passa do valor e volta; número sem rótulo; contar um ano ou um telefone',
    layouts: 'meio_a_meio ou cartao; tela_cheia quando o número é a tese do vídeo',
  },
  {
    chave: 'grafico',
    nome: 'Gráfico que cresce com a fala',
    quando: 'dois ou mais números relacionados ditos em sequência (antes e agora, A e B, evolução)',
    plano: 'as séries com os valores EXATOS ditos e o nome de cada uma; qual é o ponto que importa; o tipo (barras, linha, proporção)',
    construcao:
      'No máximo 5 barras ou 1 linha. Cada barra CRESCE (scaleY, transformOrigin na base, power3.out, 0,6 s) no instante em que o número dela é dito; o rótulo do valor sobe junto e trava. A barra do ponto que importa na cor de destaque; as outras no tom apagado. Eixo e grade discretos (opacidade 15-20%). Título do gráfico em cima, pequeno. A altura das barras é proporcional aos valores ditos -- sem escala inventada.',
    evitar: 'todas as barras da mesma cor; valores que a fala não disse; eixo cheio de números',
    layouts: 'meio_a_meio ou pip',
  },
  {
    chave: 'lista_viva',
    nome: 'Lista viva',
    quando: 'três ou mais itens enumerados ("primeiro... segundo...", "são três coisas")',
    plano: 'os itens como foram ditos (até 5 palavras cada), o título da lista, e a palavra da fala em que cada item entra',
    construcao:
      'O contador ou título primeiro ("3 erros"), grande, num canto. Cada item ENTRA na palavra em que é dito (x -60 a 0, expo.out, 0,4 s) com seu número em destaque; o item anterior RECUA (opacidade 0.4, escala 0.96) -- só o item da vez está aceso. Itens com 44-56 px, numeração em fonte de título. Uma linha vertical se DESENHA ligando os itens conforme entram. No fim, todos acendem juntos por 0,6 s.',
    evitar: 'todos os itens aparecendo de uma vez; marcador de bolinha padrão; item com frase longa',
    layouts: 'meio_a_meio ou pip',
  },
  {
    chave: 'passo_a_passo',
    nome: 'Passo a passo / processo',
    quando: 'uma sequência de ações ou etapas ditas em ordem',
    plano: 'as etapas (verbo + objeto, até 4 palavras cada), a palavra da fala em que cada uma acontece, e o que liga uma à outra (seta, trilho, linha do tempo)',
    construcao:
      'Nós numerados sobre um trilho que se DESENHA (strokeDashoffset, power2.inOut) de um nó ao seguinte no tempo entre as palavras. O nó da vez CRESCE com peso (back.out(1.6), 0,4 s) e acende; os anteriores ficam marcados como feitos (check que se desenha, 0,3 s). Um pictograma simples em SVG por etapa quando ajuda. Horizontal em tela larga de painel; vertical no quadro inteiro.',
    evitar: 'etapas sem ligação visual entre si; texto longo em cada nó; todas acesas ao mesmo tempo',
    layouts: 'pip, meio_a_meio ou tela_cheia',
  },
  {
    chave: 'comparacao',
    nome: 'Comparação (dois lados)',
    quando: 'antes e depois, errado e certo, A contra B',
    plano: 'os dois lados com o rótulo e o conteúdo de cada um (como dito), qual lado "ganha", e a palavra da virada',
    construcao:
      'Dois painéis com PESOS DIFERENTES: o lado que perde entra primeiro, em tom apagado, e ocupa o quadro; na palavra da virada a CORTINA abre (clipPath inset, power3.inOut, 0,7 s) com uma linha fina acompanhando a borda, e o lado que ganha toma a cor de destaque e mais área. Um X se desenha no lado errado e um check no certo. Rótulos em caixa alta pequenos no topo de cada lado.',
    evitar: 'dois cartões iguais lado a lado; os dois lados entrando juntos; sem momento de virada',
    layouts: 'meio_a_meio, pip ou tela_cheia',
  },
  {
    chave: 'definicao',
    nome: 'Definição de termo',
    quando: 'um nome técnico, sigla ou conceito que quem assiste pode não conhecer',
    plano: 'o termo como foi dito, e a explicação em até 10 palavras tirada da fala',
    construcao:
      'Como um verbete: o termo grande em fonte de título, entra por máscara; um filete se DESENHA embaixo; a explicação em 36-42 px DIGITA ou sobe em seguida. Um rótulo pequeno em cima ("o que é", a categoria). Peça compacta, ancorada num canto da área útil, fora do rosto.',
    evitar: 'definição que a fala não deu; parágrafo; ocupar a tela inteira para uma palavra',
    layouts: 'cartao',
  },
  {
    chave: 'pergunta',
    nome: 'Pergunta em destaque',
    quando: 'uma pergunta retórica dita, que o vídeo responde',
    plano: 'a pergunta exata, e a palavra que carrega a dúvida',
    construcao:
      'A pergunta em blocos, alinhada à esquerda, com o ponto de interrogação GIGANTE (400+ px) apagado no fundo entrando em rotação fixa de poucos graus. A palavra da dúvida na cor de destaque. Entra palavra a palavra no ritmo da fala e FICA 0,8 s parada antes de sair -- a pausa é a pergunta.',
    evitar: 'responder na mesma cena; pergunta centralizada pequena',
    layouts: 'tela_cheia ou meio_a_meio',
  },
  {
    chave: 'citacao',
    nome: 'Citação / frase-tese',
    quando: 'a frase que resume o vídeo (no máximo uma por vídeo)',
    plano: 'a frase exata (até 14 palavras), o grifo (2 a 4 palavras) e a quem atribuir, se foi dito',
    construcao:
      'Aspas gigantes apagadas no fundo. A frase em fonte de título, 72-96 px, entra LINHA a linha por máscara (stagger 0,12 s). O grifo é uma marca-texto que se ESTENDE atrás das palavras (scaleX 0 a 1, 0,5 s, power2.inOut) na palavra em que são ditas. Muito respiro; nada mais na cena.',
    evitar: 'mais de uma citação no vídeo; frase parafraseada; enfeite em volta',
    layouts: 'tela_cheia ou meio_a_meio',
  },
  {
    chave: 'manchete',
    nome: 'Manchete / notícia',
    quando: 'uma novidade, um lançamento, um fato com data ou fonte',
    plano: 'a manchete (até 9 palavras, do que foi dito), a tarja (o assunto ou a fonte dita) e o trecho-chave a grifar',
    construcao:
      'Uma tarja colorida ENTRA de lado (0,3 s, power4.out) com o rótulo em caixa alta; a manchete em serifa forte sobe por máscara em duas linhas; um filete e a data ou fonte (só se ditas) embaixo, pequenos. O trecho-chave ganha grifo. Composição de jornal: alinhada à esquerda, coluna estreita.',
    evitar: 'fonte ou data que ninguém disse; logotipo de veículo real; texto de notícia inteiro',
    layouts: 'meio_a_meio, cartao ou tela_cheia',
  },
  {
    chave: 'interface_simulada',
    nome: 'Interface simulada',
    quando: 'a fala descreve algo que acontece numa tela (app, site, mensagem, busca, pagamento)',
    plano: 'que tela é (genérica, sem marca que não foi dita), os elementos (campo, botão, mensagem) com os textos exatos, e o gesto (digitar, clicar, receber) com a palavra de cada um',
    construcao:
      'Desenhe a tela em HTML com acabamento de produto: barra de título, cantos de 28-36 px, sombra suave, tipografia do design. O que vende é o GESTO: o texto DIGITA caractere a caractere (0,045 s cada), o cursor em SVG ANDA até o botão (power2.inOut, 0,5 s), o botão AFUNDA (scale 0.96, 0,08 s) e a resposta SURGE (back.out, 0,4 s). A janela inteira tem leve inclinação ou push-in para não parecer captura de tela.',
    evitar: 'copiar a interface de um app real; tela estática; texto minúsculo',
    layouts: 'meio_a_meio, pip ou tela_cheia',
  },
  {
    chave: 'rotulo',
    nome: 'Rótulo de identificação',
    quando: 'a pessoa se apresenta, ou cita um nome, lugar ou data que merece ficar na tela',
    plano: 'o nome e a segunda linha (cargo, lugar, data) exatamente como ditos',
    construcao:
      'Discreto e colado na borda da área útil. Um filete CRESCE (scaleX, 0,3 s), o nome sobe por máscara (0,35 s), a segunda linha em seguida, menor e apagada. Fica 2,5 a 4 s e sai fechando a máscara. Altura total da peça: até 200 px.',
    evitar: 'rótulo grande; cobrir o rosto; cargo que a pessoa não disse',
    layouts: 'cartao',
  },
  {
    chave: 'selo',
    nome: 'Selo / carimbo',
    quando: 'um veredito, uma garantia, um "aprovado", um aviso',
    plano: 'a palavra do selo (1 a 3 palavras ditas) e o que ele carimba',
    construcao:
      'O selo BATE: entra de escala 2.2 a 1 com rotação fixa de -8 graus, power4.in, 0,2 s; no instante do impacto o palco TREME (0,2 s) e um clarão passa (opacidade 0 a 0.5 a 0 em 0,15 s). Borda dupla, texto em caixa alta, tinta levemente irregular (opacidade 0.92). Depois fica parado.',
    evitar: 'selo flutuando ou pulsando; mais de um selo no vídeo',
    layouts: 'cartao ou por cima de outra cena',
  },
  {
    chave: 'livre',
    nome: 'Encenação livre',
    quando: 'o trecho pede algo que nenhuma técnica acima cobre (uma metáfora visual, um mapa de conceitos, uma linha do tempo, um objeto que se monta)',
    plano: 'a metáfora em uma frase, os elementos (o que é cada um), e as batidas completas -- no mesmo nível de detalhe das outras técnicas',
    construcao:
      'Siga as batidas da direção e a skill de motion graphics: um foco dominante, três camadas, um movimento-assinatura, cada elemento com um verbo. Tudo em SVG e HTML.',
    evitar: 'usar "livre" para fugir de especificar; metáfora que a fala não sustenta',
    layouts: 'qualquer um',
  },
];

export const CHAVES_DAS_TECNICAS = TECNICAS_DE_CENA.map((t) => t.chave);

export function tecnicaDeCena(chave: string | undefined | null): TecnicaDeCena | undefined {
  const c = String(chave ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return TECNICAS_DE_CENA.find((t) => t.chave === c);
}

/** O repertório para a direção: quando usar cada técnica e o que ela precisa decidir. */
export function indiceDasTecnicas(): string {
  return TECNICAS_DE_CENA.map((t) => `- ${t.chave} (${t.nome}). Quando: ${t.quando}. Você decide: ${t.plano}. Onde: ${t.layouts}.`).join('\n');
}

/** O módulo de uma técnica, para quem desenha a cena. */
export function moduloDaTecnica(chave: string | undefined | null): string {
  const t = tecnicaDeCena(chave) ?? tecnicaDeCena('livre')!;
  return `TÉCNICA DESTA CENA: ${t.nome} (${t.chave})
Como se constrói: ${t.construcao}
Evite: ${t.evitar}.`;
}

/**
 * Os verbos de movimento (beat-direction do HyperFrames): todo elemento de
 * uma batida leva um. É o que impede "o texto aparece".
 */
export const VERBOS_DE_MOVIMENTO =
  'peso: BATE, CAI, CRAVA, TRAVA · direção: SOBE, DESLIZA, EMPURRA, VARRE · revelação: DESENHA, ENCHE, CRESCE, MONTA, ABRE, CONTA · mecânico: DIGITA, CLICA, ENCAIXA, AFUNDA · orgânico: RESPIRA, DERIVA · saída: RECUA, FECHA, SOME';
