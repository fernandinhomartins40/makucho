// ============================================================
// MAKUCHO STUDIO - O tema e as regras de design das animações.
//
// Duas camadas, em variáveis de CSS que o documento já traz:
//   escala  -- tamanhos de vídeo (HyperFrames video-composition /
//              typography: título 90-132 px, texto 32-42, rótulo >= 24,
//              bordas 2-4, espaços generosos). Iguais em todo vídeo.
//   tema    -- cores e fontes do estilo, recoloridas pela paleta quando
//              houver: --cor-fundo, --cor-texto, --cor-apagado,
//              --cor-destaque(-2/-3), --fonte-titulo, --fonte-texto.
// Com as variáveis, a IA escreve var(--cor-destaque) em vez de um hex
// solto: o vídeo inteiro fica coerente e a legenda pode seguir o tema.
// ============================================================

import { coresDaPaleta, estiloDeAnimacao } from './estilos-de-animacao';

/** A escala de vídeo (px no quadro 1080x1920). */
export const ESCALA_DA_ANIMACAO = {
  display: 132,
  titulo: 104,
  subtitulo: 64,
  texto: 40,
  rotulo: 24,
  numero: 140,
  espaco: 56,
  espacoPequeno: 24,
  raio: 28,
  borda: 3,
} as const;

export interface TemaDaAnimacao {
  fundo: string;
  texto: string;
  apagado: string;
  destaque: string;
  destaque2: string;
  destaque3: string;
  fonteTitulo: string;
  fonteTexto: string;
}

const hexParaRgb = (h: string) => {
  const x = h.replace('#', '');
  const n = parseInt(x.length === 3 ? x.split('').map((c) => c + c).join('') : x.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
const rgbParaHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const luz = (h: string) => {
  const [r, g, b] = hexParaRgb(h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const saturacao = (h: string) => {
  const [r, g, b] = hexParaRgb(h);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};
/** a misturado com b (t = quanto de b). */
export function misturarCores(a: string, b: string, t: number): string {
  const x = hexParaRgb(a);
  const y = hexParaRgb(b);
  return rgbParaHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/**
 * O tema de um estilo (e paleta, se houver). A paleta decide as cores
 * pela luz: no estilo escuro, o fundo é a mais escura e o texto a mais
 * clara (no claro, o contrário); os destaques são as mais saturadas.
 */
export function temaDaAnimacao(estilo: string | undefined | null, paleta?: string | null): TemaDaAnimacao | null {
  const e = estiloDeAnimacao(estilo);
  if (!e) return null;
  const p = coresDaPaleta(paleta);
  let fundo: string;
  let texto: string;
  let destaques: string[];
  if (p) {
    const porLuz = [...p.cores].sort((a, b) => luz(a) - luz(b));
    fundo = e.escuro ? porLuz[0]! : porLuz[porLuz.length - 1]!;
    texto = e.escuro ? porLuz[porLuz.length - 1]! : porLuz[0]!;
    destaques = p.cores.filter((c) => c !== fundo && c !== texto).sort((a, b) => saturacao(b) - saturacao(a));
  } else {
    fundo = e.cores[0] ?? (e.escuro ? '#0b0e13' : '#ffffff');
    texto = e.cores[1] ?? (e.escuro ? '#f1f3f4' : '#111111');
    destaques = e.cores.slice(2);
  }
  const destaque = destaques[0] ?? texto;
  return {
    fundo,
    texto,
    apagado: misturarCores(texto, fundo, 0.42),
    destaque,
    destaque2: destaques[1] ?? misturarCores(destaque, texto, 0.35),
    destaque3: destaques[2] ?? misturarCores(destaque, fundo, 0.35),
    fonteTitulo: e.fontes[0] ?? "'Inter ExtraBold'",
    fonteTexto: e.fontes[1] ?? e.fontes[0] ?? "'Inter SemiBold'",
  };
}

/** As variáveis de CSS da escala e do tema (vão em #cena). */
export function cssDoTema(c: { estilo?: string | undefined; paleta?: string | undefined }): string {
  const s = ESCALA_DA_ANIMACAO;
  const escala = `--t-display: ${s.display}px; --t-titulo: ${s.titulo}px; --t-subtitulo: ${s.subtitulo}px; --t-texto: ${s.texto}px; --t-rotulo: ${s.rotulo}px; --t-numero: ${s.numero}px; --espaco: ${s.espaco}px; --espaco-p: ${s.espacoPequeno}px; --raio: ${s.raio}px; --borda: ${s.borda}px;`;
  const t = temaDaAnimacao(c.estilo, c.paleta);
  if (!t) return escala;
  return `${escala} --cor-fundo: ${t.fundo}; --cor-texto: ${t.texto}; --cor-apagado: ${t.apagado}; --cor-destaque: ${t.destaque}; --cor-destaque-2: ${t.destaque2}; --cor-destaque-3: ${t.destaque3}; --fonte-titulo: ${t.fonteTitulo}, sans-serif; --fonte-texto: ${t.fonteTexto}, sans-serif;`;
}

/** As regras de design (HyperFrames video-composition + typography), para a IA. */
export const REGRAS_DE_DESIGN = `DESIGN PARA VÍDEO (HyperFrames: video-composition e typography) -- vídeo não é página da web:
- Escala pronta em variáveis: var(--t-display) 132px, var(--t-titulo) 104px, var(--t-subtitulo) 64px, var(--t-texto) 40px, var(--t-rotulo) 24px, var(--t-numero) 140px; espaços var(--espaco) e var(--espaco-p); var(--raio), var(--borda). Nada de texto abaixo de 24px.
- Cores e fontes do tema em variáveis: var(--cor-fundo) var(--cor-texto) var(--cor-apagado) var(--cor-destaque) var(--cor-destaque-2) var(--cor-destaque-3); font-family: var(--fonte-titulo) / var(--fonte-texto). Use SEMPRE as variáveis do tema (o vídeo inteiro fica coerente e a pessoa pode trocar a paleta sem refazer).
- Composição: dois focos no máximo; ancore o conteúdo nas bordas da área útil (não deixe flutuar no centro como slide); título ocupando 60-80% da largura útil; zonas (faixa de rótulo em cima, conteúdo, rodapé) em vez de pilha centralizada.
- Três camadas: fundo (brilho radial, textura, grade, número gigante apagado), conteúdo (a mensagem) e acentos (filetes, rótulos, marcas de registro, barras de dados) -- os acentos fazem parecer produzido.
- Contraste alto; opacidade decorativa de 12-25% (menos some na compressão); bordas de 2-4px. Em fundo claro: bordas 2px+, destaque saturado e textura leve. Nada de gradiente linear em tela cheia escura (faz bandas no H.264): use radial ou sólido.
- Títulos grandes com letter-spacing de -0.02em a -0.04em; no máximo duas famílias de fonte.`;

/** O tema em texto, para a IA. */
export function textoDoTema(c: { estilo?: string | undefined; paleta?: string | undefined }): string {
  const t = temaDaAnimacao(c.estilo, c.paleta);
  if (!t) return '';
  return `TEMA (já nas variáveis): fundo ${t.fundo}, texto ${t.texto}, apagado ${t.apagado}, destaques ${t.destaque} ${t.destaque2} ${t.destaque3}; fonte do título ${t.fonteTitulo}, do texto ${t.fonteTexto}.`;
}
