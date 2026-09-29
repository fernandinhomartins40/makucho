// ============================================================
// MAKUCHO STUDIO - Os estilos das animações (HyperFrames).
//
// Um catálogo só, para a IA (montagem e "Peça à IA") e para o editor:
//   cartao     -- os 10 estilos de cartão da skill talking-head-recut
//                 (adaptada do vtake-skills, MIT);
//   identidade -- as 8 identidades visuais da skill hyperframes-creative
//                 (cores, tipografia E o caráter do movimento);
//   referencia -- o "tecnologia" dos vídeos de referência do Studio.
// As referências completas (o cartão, os tokens) vivem na API; aqui fica
// o que a tela e o plano precisam: nome, caráter, quando usar e cores.
// ============================================================

export interface EstiloDeAnimacao {
  chave: string;
  nome: string;
  familia: 'cartao' | 'identidade' | 'referencia';
  /** O visual, em poucas palavras. */
  carater: string;
  /** Quando usar (o tom da fala). */
  quando: string;
  /** Fundo escuro ou claro. */
  escuro: boolean;
  /** As nossas fontes que fazem este visual. */
  fontes: string[];
  /** Fundo, texto e destaque (amostra na tela). */
  cores: string[];
}

export const ESTILOS_DE_ANIMACAO: readonly EstiloDeAnimacao[] = [
  {
    "chave": "academic",
    "nome": "Acadêmico",
    "familia": "cartao",
    "carater": "papel quente com grade, serifa, grifo azul",
    "quando": "reflexão, educação, finanças explicadas com calma",
    "escuro": false,
    "fontes": [
      "'Lora Bold'",
      "'Libre Baskerville Bold'"
    ],
    "cores": [
      "#f1ead8",
      "#1a1d2b",
      "#2557a7"
    ]
  },
  {
    "chave": "editorial",
    "nome": "Editorial",
    "familia": "cartao",
    "carater": "creme, bloco coral, citação grande em itálico",
    "quando": "lançamento, manifesto, frase de efeito, opinião forte",
    "escuro": false,
    "fontes": [
      "'DM Serif Display'",
      "'Playfair Display'",
      "'Lora Bold'"
    ],
    "cores": [
      "#f1e8d5",
      "#0e1018",
      "#ff3a2d"
    ]
  },
  {
    "chave": "minimal",
    "nome": "Minimalista",
    "familia": "cartao",
    "carater": "preto e branco, tipografia enorme, muito espaço",
    "quando": "uma afirmação só, apresentação limpa, conselho direto",
    "escuro": false,
    "fontes": [
      "'Inter ExtraBold'",
      "'Inter SemiBold'"
    ],
    "cores": [
      "#ffffff",
      "#000000",
      "#000000"
    ]
  },
  {
    "chave": "spotlight",
    "nome": "Holofote",
    "familia": "cartao",
    "carater": "gradiente roxo escuro, brilho, dramático",
    "quando": "história emocional, revelação, virada",
    "escuro": true,
    "fontes": [
      "'Sora ExtraBold'",
      "'Manrope ExtraBold'"
    ],
    "cores": [
      "#1a0b2e",
      "#f5f3ff",
      "#a78bfa"
    ]
  },
  {
    "chave": "geom",
    "nome": "Geométrico",
    "familia": "cartao",
    "carater": "amarelo-limão, rosa-choque e preto em choque de formas",
    "quando": "energia, lançamento ousado, cortes rápidos, jovem",
    "escuro": false,
    "fontes": [
      "'Archivo Black'",
      "'Space Grotesk Bold'"
    ],
    "cores": [
      "#0a0a0a",
      "#ffffff",
      "#d4ff00"
    ]
  },
  {
    "chave": "whiteboard",
    "nome": "Quadro branco",
    "familia": "cartao",
    "carater": "papel, letra à mão, contornos esboçados",
    "quando": "tutorial, passo a passo, explicar como funciona",
    "escuro": false,
    "fontes": [
      "'Caveat Bold'",
      "'Kalam Bold'",
      "'Permanent Marker'"
    ],
    "cores": [
      "#fdf6e3",
      "#1a1a1a",
      "#ff6b35"
    ]
  },
  {
    "chave": "audit",
    "nome": "Dossiê",
    "familia": "cartao",
    "carater": "papel manilha, serifa, carimbo APROVADO",
    "quando": "análise, prova, investigação, números sérios",
    "escuro": false,
    "fontes": [
      "'Libre Baskerville Bold'",
      "'Bodoni Moda ExtraBold'"
    ],
    "cores": [
      "#ebd9b4",
      "#1d1a14",
      "#8b1d1d"
    ]
  },
  {
    "chave": "terminal",
    "nome": "Terminal",
    "familia": "cartao",
    "carater": "escuro, texto de código, moldura ASCII, cursor",
    "quando": "tecnologia, dados técnicos, rigor de engenharia",
    "escuro": true,
    "fontes": [
      "'Space Grotesk Bold'",
      "'Press Start 2P'"
    ],
    "cores": [
      "#0d1117",
      "#e6edf3",
      "#4ade80"
    ]
  },
  {
    "chave": "swiss",
    "nome": "Suíço",
    "familia": "cartao",
    "carater": "branco, grotesca, filetes duplos, acento vermelho",
    "quando": "dados, comparação, apresentação séria e objetiva",
    "escuro": false,
    "fontes": [
      "'Inter ExtraBold'",
      "'Inter SemiBold'"
    ],
    "cores": [
      "#ffffff",
      "#111111",
      "#e8190f"
    ]
  },
  {
    "chave": "xhs",
    "nome": "Social",
    "familia": "cartao",
    "carater": "creme e rosa-choque, chips, #hashtags, curtidas",
    "quando": "redes sociais, estilo de vida, dicas, recomendação",
    "escuro": false,
    "fontes": [
      "'Poppins ExtraBold'",
      "'Nunito Black'"
    ],
    "cores": [
      "#fff5e9",
      "#1d1418",
      "#ff2e63"
    ]
  },
  {
    "chave": "swiss-pulse",
    "nome": "Swiss Pulse",
    "familia": "identidade",
    "carater": "grade rígida, números enormes que contam, cortes secos",
    "quando": "dados, métricas, SaaS, ferramentas",
    "escuro": true,
    "fontes": [
      "'Inter ExtraBold'",
      "'Inter SemiBold'"
    ],
    "cores": [
      "#1a1a1a",
      "#ffffff",
      "#0066FF"
    ]
  },
  {
    "chave": "velvet-standard",
    "nome": "Velvet Standard",
    "familia": "identidade",
    "carater": "premium e atemporal: muito espaço, caixa-alta espaçada, tudo desliza",
    "quando": "luxo, empresa grande, palestra, investidores",
    "escuro": true,
    "fontes": [
      "'Inter SemiBold'",
      "'Cormorant Garamond Bold'"
    ],
    "cores": [
      "#0a0a0a",
      "#ffffff",
      "#1a237e"
    ]
  },
  {
    "chave": "deconstructed",
    "nome": "Deconstructed",
    "familia": "identidade",
    "carater": "industrial e cru: tipo inclinado, glitch, texto que bate",
    "quando": "tecnologia, segurança, lançamento com atitude",
    "escuro": true,
    "fontes": [
      "'Space Grotesk Bold'",
      "'Russo One'"
    ],
    "cores": [
      "#1a1a1a",
      "#f0f0f0",
      "#D4501E"
    ]
  },
  {
    "chave": "maximalist-type",
    "nome": "Maximalist Type",
    "familia": "identidade",
    "carater": "o texto é o visual: camadas de tipografia gigante, cores saturadas",
    "quando": "anúncio grande, hype, alta energia",
    "escuro": true,
    "fontes": [
      "'Anton'",
      "'Space Grotesk Bold'"
    ],
    "cores": [
      "#0a0a0a",
      "#ffffff",
      "#E63946"
    ]
  },
  {
    "chave": "data-drift",
    "nome": "Data Drift",
    "familia": "identidade",
    "carater": "futurista e imersivo: partículas, rastros de luz, brilho radial",
    "quando": "IA, dados, futuro, tecnologia de ponta",
    "escuro": true,
    "fontes": [
      "'Sora ExtraBold'",
      "'Inter SemiBold'"
    ],
    "cores": [
      "#0a0a0a",
      "#e0e0e0",
      "#7c3aed"
    ]
  },
  {
    "chave": "soft-signal",
    "nome": "Soft Signal",
    "familia": "identidade",
    "carater": "íntimo e quente: serifa em itálico, gradiente suave, movimentos lentos",
    "quando": "bem-estar, história pessoal, marca humana",
    "escuro": false,
    "fontes": [
      "'Playfair Display'",
      "'Lora Bold'",
      "'Caveat Bold'"
    ],
    "cores": [
      "#FFF8EC",
      "#2a2a2a",
      "#F5A623"
    ]
  },
  {
    "chave": "folk-frequency",
    "nome": "Folk Frequency",
    "familia": "identidade",
    "carater": "vivo e festivo: tipografia arredondada, padrões, cores fortes",
    "quando": "consumo, comida, comunidade, promoção alegre",
    "escuro": false,
    "fontes": [
      "'Titan One'",
      "'Nunito Black'"
    ],
    "cores": [
      "#ffffff",
      "#1a1a1a",
      "#FF1493"
    ]
  },
  {
    "chave": "shadow-cut",
    "nome": "Shadow Cut",
    "familia": "identidade",
    "carater": "escuro e cinematográfico: preto, cinza, um vermelho de destaque",
    "quando": "revelação dramática, investigação, alerta",
    "escuro": true,
    "fontes": [
      "'Oswald Bold'",
      "'Inter SemiBold'"
    ],
    "cores": [
      "#0a0a0a",
      "#f0f0f0",
      "#C1121F"
    ]
  },
  {
    "chave": "tecnologia",
    "nome": "Tecnologia",
    "familia": "referencia",
    "carater": "escuro, cartões de interface arredondados, pílulas com bolinha colorida, ondas de áudio em barras",
    "quando": "lançamento de tecnologia, IA, aplicativos, novidades digitais",
    "escuro": true,
    "fontes": [
      "'Inter ExtraBold'",
      "'Inter SemiBold'"
    ],
    "cores": [
      "#0B0E13",
      "#F1F3F4",
      "#4285F4"
    ]
  }
];

export const CHAVES_DOS_ESTILOS_DE_ANIMACAO = ESTILOS_DE_ANIMACAO.map((e) => e.chave);

export function estiloDeAnimacao(chave: string | undefined | null): EstiloDeAnimacao | undefined {
  return ESTILOS_DE_ANIMACAO.find((e) => e.chave === chave);
}
