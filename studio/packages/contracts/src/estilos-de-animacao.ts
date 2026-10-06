// ============================================================
// MAKUCHO STUDIO - Os estilos das animações (HyperFrames).
//
// Um catálogo só, para a IA (montagem e "Peça à IA") e para o editor:
//   cartao     -- os 10 estilos de cartão da skill talking-head-recut
//                 (adaptada do vtake-skills, MIT);
//   identidade -- as 8 identidades visuais da skill hyperframes-creative
//                 (cores, tipografia E o caráter do movimento);
//   preset     -- os 13 frame-presets da hyperframes-creative (sistemas
//                 de design completos: tokens, componentes, regras);
//   referencia -- o "tecnologia" dos vídeos de referência do Studio;
//   exclusivo  -- os do Studio (Liquid Glass, o vidro da Apple; ver liquid-glass.ts);
//   motion     -- os visuais dos presets de motion (motion-presets.ts): cenas
//                 prontas, montadas sem a IA escrever código.
// As referências completas (o cartão, os tokens) vivem na API; aqui fica
// o que a tela e o plano precisam: nome, caráter, quando usar e cores.
// ============================================================

import { VISUAIS_DE_MOTION } from './motion-presets';

export interface EstiloDeAnimacao {
  chave: string;
  nome: string;
  familia: 'cartao' | 'identidade' | 'preset' | 'referencia' | 'exclusivo' | 'motion';
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
    "chave": "biennale-yellow",
    "nome": "Biennale Yellow",
    "familia": "preset",
    "carater": "catálogo de museu: pergaminho, tinta índigo, amarelo solar, serifa fina, filetes",
    "quando": "elegância, autoridade editorial, sofisticação contida",
    "escuro": false,
    "fontes": [
      "'DM Serif Display'",
      "'Archivo ExtraBold'",
      "'Space Grotesk Bold'"
    ],
    "cores": [
      "#E9E5DB",
      "#DCD6C4",
      "#F1EE2E"
    ]
  },
  {
    "chave": "blockframe",
    "nome": "Blockframe",
    "familia": "preset",
    "carater": "neobrutalista: bordas pretas grossas, sombra dura, cinco pastéis, caixa-alta pesada",
    "quando": "ousado, divertido e alto, marca confiante",
    "escuro": false,
    "fontes": [
      "'Inter ExtraBold'",
      "'Space Grotesk Bold'"
    ],
    "cores": [
      "#000000",
      "#FFFFFF",
      "#FFFDF5"
    ]
  },
  {
    "chave": "blue-professional",
    "nome": "Blue Professional",
    "familia": "preset",
    "carater": "consultoria: creme, um azul-cobalto só, cartões suaves sem sombra",
    "quando": "executivo, relatório, pesquisa, premium discreto",
    "escuro": false,
    "fontes": [
      "'Space Grotesk Bold'",
      "'Inter SemiBold'"
    ],
    "cores": [
      "#1e2bfa",
      "#fdfae7",
      "#1e2bfa"
    ]
  },
  {
    "chave": "bold-poster",
    "nome": "Bold Poster",
    "familia": "preset",
    "carater": "cartaz editorial: display inclinado, serifa, vermelho-tomate, grades de borda dupla",
    "quando": "autoridade editorial com força, vintage",
    "escuro": false,
    "fontes": [
      "'Titan One'",
      "'Libre Baskerville Bold'",
      "'Space Grotesk Bold'"
    ],
    "cores": [
      "#FFFFFF",
      "#1C1410",
      "#D8000F"
    ]
  },
  {
    "chave": "broadside",
    "nome": "Broadside",
    "familia": "preset",
    "carater": "cartaz de protesto: preto e laranja-fogo, minúsculas gigantes, filetes",
    "quando": "declaração, manifesto, presença e autoridade",
    "escuro": true,
    "fontes": [
      "'Barlow Condensed ExtraBold'",
      "'Space Grotesk Bold'"
    ],
    "cores": [
      "#111111",
      "#1A1A18",
      "#E85D26"
    ]
  },
  {
    "chave": "capsule",
    "nome": "Capsule",
    "familia": "preset",
    "carater": "editorial lúdico: tudo em pílula com contorno, creme, nove cores doces",
    "quando": "amigável, acolhedor, marca próxima",
    "escuro": false,
    "fontes": [
      "'Bodoni Moda ExtraBold'",
      "'Space Grotesk Bold'"
    ],
    "cores": [
      "#F5F5F0",
      "#1A1A1A",
      "#1E1E1E"
    ]
  },
  {
    "chave": "cartesian",
    "nome": "Cartesian",
    "familia": "preset",
    "carater": "catálogo de museu: grade fina cor de pedra, Playfair, anéis geométricos",
    "quando": "silencioso, literário, rigor contido",
    "escuro": false,
    "fontes": [
      "'Playfair Display'",
      "'Inter SemiBold'"
    ],
    "cores": [
      "#EDE8E0",
      "#E2DBD1",
      "#1A1A1A"
    ]
  },
  {
    "chave": "cobalt-grid",
    "nome": "Cobalt Grid",
    "familia": "preset",
    "carater": "risografia: papel creme, tinta cobalto, papel quadriculado, serifa",
    "quando": "claro, sistemático, autoridade medida",
    "escuro": false,
    "fontes": [
      "'Lora Bold'",
      "'Figtree ExtraBold'",
      "'Space Grotesk Bold'"
    ],
    "cores": [
      "#F0EBDE",
      "#E6E0CE",
      "#1F2BE0"
    ]
  },
  {
    "chave": "code-editorial",
    "nome": "Code Editorial",
    "familia": "preset",
    "carater": "livro de marca: papel creme, terracota escassa, serifa clássica e código",
    "quando": "lançamento considerado, desenvolvedor, texto calmo",
    "escuro": false,
    "fontes": [
      "'Cormorant Garamond Bold'",
      "'Inter SemiBold'",
      "'Space Grotesk Bold'"
    ],
    "cores": [
      "#141413",
      "#FAF9F5",
      "#EFE9DE"
    ]
  },
  {
    "chave": "coral",
    "nome": "Coral",
    "familia": "preset",
    "carater": "revista ousada: coral, preto e creme em blocos, hachura, Bebas",
    "quando": "estruturalista, gráfico, confiança de bordas duras",
    "escuro": false,
    "fontes": [
      "'Bebas Neue'",
      "'Inter SemiBold'"
    ],
    "cores": [
      "#E85D5D",
      "#D44A4A",
      "#F5F0E8"
    ]
  },
  {
    "chave": "creative-mode",
    "nome": "Creative Mode",
    "familia": "preset",
    "carater": "neobrutalista editorial: creme, bordas de tinta, sombra dura, Archivo Black",
    "quando": "gráfico e direto, presença editorial",
    "escuro": false,
    "fontes": [
      "'Archivo Black'",
      "'Space Grotesk Bold'"
    ],
    "cores": [
      "#EFE9D9",
      "#E4DCC4",
      "#0F0F0F"
    ]
  },
  {
    "chave": "daisy-days",
    "nome": "Daisy Days",
    "familia": "preset",
    "carater": "livro infantil: contornos, pastéis de jardim, margaridas e sóis desenhados",
    "quando": "lúdico, caloroso, fofo",
    "escuro": false,
    "fontes": [
      "'Titan One'",
      "'Nunito Black'"
    ],
    "cores": [
      "#F5F0E6",
      "#7ECDC0",
      "#F7C8D4"
    ]
  },
  {
    "chave": "editorial-forest",
    "nome": "Editorial Forest",
    "familia": "preset",
    "carater": "editorial literário: verde, rosa e creme, serifa, carimbo de monograma",
    "quando": "espaçoso, contido, tom literário",
    "escuro": true,
    "fontes": [
      "'Lora Bold'",
      "'Space Grotesk Bold'"
    ],
    "cores": [
      "#2e4a2a",
      "#243a21",
      "#3a5a36"
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
  },
  // ---------- Exclusivos do Studio (escritos à mão; liquid-glass.ts) ----------
  {
    "chave": "liquid-glass",
    "nome": "Liquid Glass",
    "familia": "exclusivo",
    "carater": "o vidro da Apple: peças de vidro com borda de luz sobre um fundo vivo de cor, movimento de gota",
    "quando": "tecnologia, produto, lançamento premium, tutorial de app, tudo que pede um visual moderno e limpo",
    "escuro": false,
    "fontes": [
      "'Inter ExtraBold'",
      "'Inter SemiBold'"
    ],
    "cores": [
      "#D9DCE3",
      "#1D1D1F",
      "#2F7BE3",
      "#FF2D6F",
      "#4CBB55"
    ]
  },
  {
    "chave": "liquid-glass-noite",
    "nome": "Liquid Glass Noite",
    "familia": "exclusivo",
    "carater": "o vidro da Apple no escuro: vidro fumê com borda de luz sobre cores que brilham, movimento de gota",
    "quando": "noite, cinema, premium, finanças, lançamento dramático, conteúdo sofisticado",
    "escuro": true,
    "fontes": [
      "'Inter ExtraBold'",
      "'Inter SemiBold'"
    ],
    "cores": [
      "#15161A",
      "#F5F5F7",
      "#3B8BFF",
      "#FF4D84",
      "#34D15B"
    ]
  },
  ...VISUAIS_DE_MOTION.map((v) => ({ chave: v.chave, nome: v.nome, familia: 'motion' as const, carater: v.carater, quando: v.quando, escuro: v.escuro, fontes: [...v.fontes], cores: [...v.cores] })),
];

export const CHAVES_DOS_ESTILOS_DE_ANIMACAO = ESTILOS_DE_ANIMACAO.map((e) => e.chave);

export function estiloDeAnimacao(chave: string | undefined | null): EstiloDeAnimacao | undefined {
  return ESTILOS_DE_ANIMACAO.find((e) => e.chave === chave);
}

// ---------- Paletas (hyperframes-creative/palettes) ----------

/** Um clima de cores com 8 conjuntos de 5 cores, para recolorir um estilo. */
export interface PaletaDeAnimacao {
  chave: string;
  nome: string;
  /** Para que conteúdo o clima serve. */
  clima: string;
  conjuntos: string[][];
}

export const PALETAS_DE_ANIMACAO: readonly PaletaDeAnimacao[] = [
  {
    "chave": "bold-energetic",
    "nome": "Energia",
    "clima": "lançamento, redes sociais, anúncio",
    "conjuntos": [
      [
        "#FFBE0B",
        "#FB5607",
        "#FF006E",
        "#8338EC",
        "#3A86FF"
      ],
      [
        "#F72585",
        "#7209B7",
        "#3A0CA3",
        "#4361EE",
        "#4CC9F0"
      ],
      [
        "#EF476F",
        "#FFD166",
        "#06D6A0",
        "#118AB2",
        "#073B4C"
      ],
      [
        "#FF595E",
        "#FFCA3A",
        "#8AC926",
        "#1982C4",
        "#6A4C93"
      ],
      [
        "#9B5DE5",
        "#F15BB5",
        "#FEE440",
        "#00BBF9",
        "#00F5D4"
      ],
      [
        "#390099",
        "#9E0059",
        "#FF0054",
        "#FF5400",
        "#FFBD00"
      ],
      [
        "#3D348B",
        "#7678ED",
        "#F7B801",
        "#F18701",
        "#F35B04"
      ],
      [
        "#FFBC42",
        "#D81159",
        "#8F2D56",
        "#218380",
        "#73D2DE"
      ]
    ]
  },
  {
    "chave": "clean-corporate",
    "nome": "Corporativo",
    "clima": "explicação, tutorial, apresentação",
    "conjuntos": [
      [
        "#FFFCF2",
        "#CCC5B9",
        "#403D39",
        "#252422",
        "#EB5E28"
      ],
      [
        "#22223B",
        "#4A4E69",
        "#9A8C98",
        "#C9ADA7",
        "#F2E9E4"
      ],
      [
        "#3D5A80",
        "#98C1D9",
        "#E0FBFC",
        "#EE6C4D",
        "#293241"
      ],
      [
        "#2B2D42",
        "#8D99AE",
        "#EDF2F4",
        "#EF233C",
        "#D90429"
      ],
      [
        "#353535",
        "#3C6E71",
        "#FFFFFF",
        "#D9D9D9",
        "#284B63"
      ],
      [
        "#E7ECEF",
        "#274C77",
        "#6096BA",
        "#A3CEF1",
        "#8B8C89"
      ],
      [
        "#CFDBD5",
        "#E8EDDF",
        "#F5CB5C",
        "#242423",
        "#333533"
      ],
      [
        "#2F6690",
        "#3A7CA5",
        "#D9DCD6",
        "#16425B",
        "#81C3D7"
      ]
    ]
  },
  {
    "chave": "dark-premium",
    "nome": "Escuro premium",
    "clima": "tecnologia, finanças, luxo, cinema",
    "conjuntos": [
      [
        "#000000",
        "#14213D",
        "#FCA311",
        "#E5E5E5",
        "#FFFFFF"
      ],
      [
        "#000814",
        "#001D3D",
        "#003566",
        "#FFC300",
        "#FFD60A"
      ],
      [
        "#0D1B2A",
        "#1B263B",
        "#415A77",
        "#778DA9",
        "#E0E1DD"
      ],
      [
        "#0D1321",
        "#1D2D44",
        "#3E5C76",
        "#748CAB",
        "#F0EBD8"
      ],
      [
        "#011627",
        "#FDFFFC",
        "#2EC4B6",
        "#E71D36",
        "#FF9F1C"
      ],
      [
        "#0B090A",
        "#161A1D",
        "#660708",
        "#A4161A",
        "#E5383B"
      ],
      [
        "#001427",
        "#708D81",
        "#F4D58D",
        "#BF0603",
        "#8D0801"
      ],
      [
        "#001524",
        "#15616D",
        "#FFECD1",
        "#FF7D00",
        "#78290F"
      ]
    ]
  },
  {
    "chave": "jewel-rich",
    "nome": "Joias",
    "clima": "luxo, eventos, sofisticação",
    "conjuntos": [
      [
        "#5F0F40",
        "#9A031E",
        "#FB8B24",
        "#E36414",
        "#0F4C5C"
      ],
      [
        "#780000",
        "#C1121F",
        "#FDF0D5",
        "#003049",
        "#669BBC"
      ],
      [
        "#10002B",
        "#240046",
        "#3C096C",
        "#5A189A",
        "#7B2CBF"
      ],
      [
        "#355070",
        "#6D597A",
        "#B56576",
        "#E56B6F",
        "#EAAC8B"
      ],
      [
        "#6F1D1B",
        "#BB9457",
        "#432818",
        "#99582A",
        "#FFE6A7"
      ],
      [
        "#231942",
        "#5E548E",
        "#9F86C0",
        "#BE95C4",
        "#E0B1CB"
      ],
      [
        "#461220",
        "#8C2F39",
        "#B23A48",
        "#FCB9B2",
        "#FED0BB"
      ],
      [
        "#780116",
        "#F7B538",
        "#DB7C26",
        "#D8572A",
        "#C32F27"
      ]
    ]
  },
  {
    "chave": "monochrome",
    "nome": "Monocromático",
    "clima": "dramático, tipográfico, sério",
    "conjuntos": [
      [
        "#F8F9FA",
        "#E9ECEF",
        "#DEE2E6",
        "#CED4DA",
        "#ADB5BD",
        "#6C757D",
        "#495057",
        "#343A40",
        "#212529"
      ],
      [
        "#0466C8",
        "#0353A4",
        "#023E7D",
        "#002855",
        "#001233"
      ],
      [
        "#012A4A",
        "#013A63",
        "#01497C",
        "#2A6F97",
        "#468FAF",
        "#89C2D9"
      ],
      [
        "#582F0E",
        "#7F4F24",
        "#936639",
        "#A68A64",
        "#C2C5AA"
      ],
      [
        "#463F3A",
        "#8A817C",
        "#BCB8B1",
        "#F4F3EE",
        "#E0AFA0"
      ],
      [
        "#03071E",
        "#370617",
        "#6A040F",
        "#9D0208",
        "#DC2F02",
        "#F48C06",
        "#FFBA08"
      ],
      [
        "#590D22",
        "#800F2F",
        "#A4133C",
        "#FF4D6D",
        "#FF8FA3",
        "#FFCCD5"
      ],
      [
        "#220901",
        "#621708",
        "#941B0C",
        "#BC3908",
        "#F6AA1C"
      ]
    ]
  },
  {
    "chave": "nature-earth",
    "nome": "Natureza",
    "clima": "sustentável, ar livre, orgânico, bem-estar",
    "conjuntos": [
      [
        "#606C38",
        "#283618",
        "#FEFAE0",
        "#DDA15E",
        "#BC6C25"
      ],
      [
        "#DAD7CD",
        "#A3B18A",
        "#588157",
        "#3A5A40",
        "#344E41"
      ],
      [
        "#386641",
        "#6A994E",
        "#A7C957",
        "#F2E8CF",
        "#BC4749"
      ],
      [
        "#CAD2C5",
        "#84A98C",
        "#52796F",
        "#354F52",
        "#2F3E46"
      ],
      [
        "#F0EAD2",
        "#DDE5B6",
        "#ADC178",
        "#A98467",
        "#6C584C"
      ],
      [
        "#132A13",
        "#31572C",
        "#4F772D",
        "#90A955",
        "#ECF39E"
      ],
      [
        "#6B9080",
        "#A4C3B2",
        "#CCE3DE",
        "#EAF4F4",
        "#F6FFF8"
      ],
      [
        "#233D4D",
        "#FE7F2D",
        "#FCCA46",
        "#A1C181",
        "#619B8A"
      ]
    ]
  },
  {
    "chave": "neon-electric",
    "nome": "Neon",
    "clima": "games, tecnologia, noite, geração Z",
    "conjuntos": [
      [
        "#F72585",
        "#B5179E",
        "#7209B7",
        "#560BAD",
        "#3A0CA3"
      ],
      [
        "#70D6FF",
        "#FF70A6",
        "#FF9770",
        "#FFD670",
        "#E9FF70"
      ],
      [
        "#7400B8",
        "#6930C3",
        "#5E60CE",
        "#5390D9",
        "#48BFE3"
      ],
      [
        "#0B132B",
        "#1C2541",
        "#3A506B",
        "#5BC0BE",
        "#6FFFE9"
      ],
      [
        "#540D6E",
        "#EE4266",
        "#FFD23F",
        "#3BCEAC",
        "#0EAD69"
      ],
      [
        "#2D00F7",
        "#6A00F4",
        "#8900F2",
        "#A100F2",
        "#F20089"
      ],
      [
        "#FF6D00",
        "#FF7900",
        "#FF8500",
        "#FF9100",
        "#240046"
      ],
      [
        "#BBFBFF",
        "#8DD8FF",
        "#4E71FF",
        "#5409DA"
      ]
    ]
  },
  {
    "chave": "pastel-soft",
    "nome": "Pastel",
    "clima": "moda, beleza, estilo de vida",
    "conjuntos": [
      [
        "#CDB4DB",
        "#FFC8DD",
        "#FFAFCC",
        "#BDE0FE",
        "#A2D2FF"
      ],
      [
        "#CCD5AE",
        "#E9EDC9",
        "#FEFAE0",
        "#FAEDCD",
        "#D4A373"
      ],
      [
        "#FFD6FF",
        "#E7C6FF",
        "#C8B6FF",
        "#B8C0FF",
        "#BBD0FF"
      ],
      [
        "#FFA69E",
        "#FAF3DD",
        "#B8F2E6",
        "#AED9E0",
        "#5E6472"
      ],
      [
        "#EDAFB8",
        "#F7E1D7",
        "#DEDBD2",
        "#B0C4B1",
        "#4A5759"
      ],
      [
        "#555B6E",
        "#89B0AE",
        "#BEE3DB",
        "#FAF9F9",
        "#FFD6BA"
      ],
      [
        "#006D77",
        "#83C5BE",
        "#EDF6F9",
        "#FFDDD2",
        "#E29578"
      ],
      [
        "#0081A7",
        "#00AFB9",
        "#FDFCDC",
        "#FED9B7",
        "#F07167"
      ]
    ]
  },
  {
    "chave": "warm-editorial",
    "nome": "Editorial quente",
    "clima": "história, documentário, caso real",
    "conjuntos": [
      [
        "#264653",
        "#2A9D8F",
        "#E9C46A",
        "#F4A261",
        "#E76F51"
      ],
      [
        "#335C67",
        "#FFF3B0",
        "#E09F3E",
        "#9E2A2B",
        "#540B0E"
      ],
      [
        "#F4F1DE",
        "#E07A5F",
        "#3D405B",
        "#81B29A",
        "#F2CC8F"
      ],
      [
        "#F6BD60",
        "#F7EDE2",
        "#F5CAC3",
        "#84A59D",
        "#F28482"
      ],
      [
        "#003049",
        "#D62828",
        "#F77F00",
        "#FCBF49",
        "#EAE2B7"
      ],
      [
        "#588B8B",
        "#FFFFFF",
        "#FFD5C2",
        "#F28F3B",
        "#C8553D"
      ],
      [
        "#283D3B",
        "#197278",
        "#EDDDD4",
        "#C44536",
        "#772E25"
      ],
      [
        "#0D3B66",
        "#FAF0CA",
        "#F4D35E",
        "#EE964B",
        "#F95738"
      ]
    ]
  }
];

/** "chave:indice" (ex.: "dark-premium:2") -> as 5 cores. Nulo se não existe. */
export function coresDaPaleta(valor: string | undefined | null): { paleta: PaletaDeAnimacao; cores: string[] } | null {
  const [chave, i] = (valor ?? '').split(':');
  const paleta = PALETAS_DE_ANIMACAO.find((p) => p.chave === chave);
  const cores = paleta?.conjuntos[Number(i) || 0];
  return paleta && cores ? { paleta, cores } : null;
}
