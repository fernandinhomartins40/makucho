// ============================================================
// GERADO a partir do registro de componentes do HyperFrames (HeyGen,
// Apache 2.0): registry/components/caption-*. Os fontes adaptados ficam
// em ./componentes-hyperframes (FONTES_DAS_LEGENDAS). Não editar à mão.
// ============================================================

export interface EstiloDeLegendaHyperFrames {
  nome: string;
  rotulo: string;
  descricao: string;
  /** As nossas fontes que ele usa (para o documento carregar). */
  fontes: string[];
}

export const LEGENDAS_HYPERFRAMES: readonly EstiloDeLegendaHyperFrames[] = [
  {
    "nome": "caption-highlight",
    "rotulo": "Destaque vermelho",
    "descricao": "fundo vermelho varre cada palavra falada (TikTok)",
    "fontes": [
      "Montserrat ExtraBold"
    ]
  },
  {
    "nome": "caption-clip-wipe",
    "rotulo": "Revelação",
    "descricao": "cada palavra se revela da esquerda para a direita",
    "fontes": [
      "Poppins ExtraBold"
    ]
  },
  {
    "nome": "caption-gradient-fill",
    "rotulo": "Gradiente",
    "descricao": "texto preenchido por gradiente, entrada elástica",
    "fontes": [
      "Montserrat ExtraBold"
    ]
  },
  {
    "nome": "caption-matrix-decode",
    "rotulo": "Decodificação",
    "descricao": "letras embaralham antes de revelar a palavra",
    "fontes": [
      "Space Grotesk Bold"
    ]
  },
  {
    "nome": "caption-neon-glow",
    "rotulo": "Neon",
    "descricao": "brilho ciano e magenta, palavras-chave em destaque",
    "fontes": [
      "Outfit ExtraBold"
    ]
  },
  {
    "nome": "caption-particle-burst",
    "rotulo": "Partículas",
    "descricao": "palavras-chave explodem em partículas coloridas",
    "fontes": [
      "Outfit ExtraBold"
    ]
  },
  {
    "nome": "caption-glitch-rgb",
    "rotulo": "Glitch",
    "descricao": "aberração RGB com linhas de CRT",
    "fontes": [
      "Space Grotesk Bold"
    ]
  },
  {
    "nome": "caption-kinetic-slam",
    "rotulo": "Impacto",
    "descricao": "uma palavra por vez, tela cheia, entrando de lados alternados",
    "fontes": [
      "Anton"
    ]
  },
  {
    "nome": "caption-pill-karaoke",
    "rotulo": "Pílula karaokê",
    "descricao": "pílula com a palavra falada acendendo",
    "fontes": [
      "Poppins ExtraBold"
    ]
  },
  {
    "nome": "caption-weight-shift",
    "rotulo": "Peso",
    "descricao": "a espessura da fonte muda entre as linhas, elegante",
    "fontes": [
      "Montserrat ExtraBold"
    ]
  },
  {
    "nome": "caption-neon-accent",
    "rotulo": "Neon colorido",
    "descricao": "acentos neon de várias cores com leve balanço",
    "fontes": [
      "Montserrat ExtraBold"
    ]
  }
];

export function legendaHyperFrames(nome: string | undefined | null): EstiloDeLegendaHyperFrames | undefined {
  return LEGENDAS_HYPERFRAMES.find((l) => l.nome === nome);
}
