// ============================================================
// MAKUCHO STUDIO - Motion graphics por PRESETS (o jeito rápido).
//
// O que a comunidade faz com Remotion e HyperFrames quando quer vídeo
// bonito, rápido e barato: "template the primitives, data-drive the
// content" -- as cenas já existem, prontas e testadas, e a IA só ESCOLHE
// qual usar onde e PREENCHE os textos. Escrever HTML/CSS/GSAP a cada cena
// custava ~30 mil tokens e um minuto por cena (medido em produção,
// 2026-10); escolher e preencher custa uma chamada pequena por vídeo.
//
// Duas peças que se combinam (18 visuais x 22 cenas):
//   visual -- o sistema de design do vídeo inteiro: cores, fontes, a
//             superfície dos cartões (sólida, vidro, brutal, papel...), a
//             textura do fundo (grão, papel, grade, scanlines) e o caráter
//             do movimento (curvas, durações, intervalo). Inspirados nos
//             estilos que dominam os vídeos curtos em 2026: o "soco" do
//             Hormozi, o caderno do Ali Abdaal, o luxo do Gadzhi, keynote,
//             neo-brutalismo, suíço, analógico com grão, Y2K, colagem...
//   preset -- a cena: contador, anel, barras, linha, versus, antes e
//             depois, lista, passos, citação, termo, pergunta, notificação,
//             selo, busca, chat, alerta, preço, ranking, rótulo, ícone,
//             frase cinética e palavra de impacto.
//
// Cada elemento entra no SEGUNDO em que a palavra dele é dita (o tempo
// das palavras da transcrição); o tamanho do texto se ajusta à área útil
// do layout (container queries), então a mesma cena serve no cartão, no
// meio a meio, no pip e na tela cheia. Trocar o visual, a paleta ou o
// layout de uma cena pronta é remontar -- sem IA, na hora.
// ============================================================

import type { ComposicaoHtml } from './animacao-html';
import { CSS_DOS_ASSETS, assetAnimado, assetDeMotion } from './motion-assets';
import { lugarDoCartao, type PessoaNoQuadro } from './pessoa-no-quadro';
import { iconeDoTexto, objetoDoTexto } from './ilustracao';

// ---------- Os visuais ----------

export type SuperficieDoVisual = 'solida' | 'vidro' | 'contorno' | 'brutal' | 'papel' | 'nenhuma';
export type TexturaDoVisual = 'nenhuma' | 'grao' | 'papel' | 'grade' | 'pontos' | 'scanlines';
export type MarcadorDoVisual = 'bloco' | 'sublinhado' | 'circulo' | 'marca-texto';

export interface VisualDeMotion {
  chave: string;
  nome: string;
  carater: string;
  quando: string;
  escuro: boolean;
  /** Título e texto (famílias que existem no servidor). */
  fontes: [string, string];
  /** Fundo, texto, destaque, destaque 2, destaque 3. */
  cores: [string, string, string, string, string];
  superficie: SuperficieDoVisual;
  textura: TexturaDoVisual;
  /** Manchas de luz da cor de destaque no fundo, que derivam devagar. */
  brilho: boolean;
  caixaAlta: boolean;
  /** Como a palavra de ênfase é marcada. */
  marcador: MarcadorDoVisual;
  raio: number;
  movimento: {
    /** Curva das entradas, das saídas e dos impactos (GSAP). */
    entrada: string;
    saida: string;
    impacto: string;
    /** Duração de uma entrada típica (s) e o intervalo entre itens. */
    duracao: number;
    intervalo: number;
  };
  /** Os rabiscos que enfeitam as cenas de destaque deste visual (motion-assets.ts); vazio = sóbrio. */
  enfeites: string[];
  /** Um detalhe que só este visual tem (inclinação, faixas de cinema, brilho no texto). */
  extra?: 'inclinado' | 'cinema' | 'neon' | 'fita';
  /** Largura média de uma letra da fonte do título, em em (como sai: com a caixa alta). Mede o corpo que cabe. */
  largura: number;
}

export const VISUAIS_DE_MOTION: readonly VisualDeMotion[] = [
  {
    chave: 'mg-soco',
    nome: 'Soco',
    carater: 'preto, branco e amarelo, caixa alta enorme, tudo bate com peso',
    quando: 'negócios, vendas, conselho direto, motivação, opinião forte (estilo Hormozi)',
    escuro: true,
    fontes: ["'Montserrat Black'", "'Montserrat ExtraBold'"],
    cores: ['#0D0D0D', '#F7F7F2', '#FFD400', '#2BD957', '#FF4D3D'],
    superficie: 'solida',
    textura: 'nenhuma',
    brilho: false,
    caixaAlta: true,
    marcador: 'bloco',
    raio: 18,
    movimento: { entrada: 'back.out(1.8)', saida: 'power3.in', impacto: 'power4.in', duracao: 0.28, intervalo: 0.06 },
    largura: 0.8,
    enfeites: ['explosao', 'velocidade'],
  },
  {
    chave: 'mg-caderno',
    nome: 'Caderno',
    carater: 'papel creme, tinta azul, anotações à mão e círculos desenhados',
    quando: 'produtividade, estudo, explicação calma, dicas práticas (estilo Ali Abdaal)',
    escuro: false,
    fontes: ["'Lexend Bold'", "'Kalam Bold'"],
    cores: ['#FAF6EE', '#22223B', '#2F6FED', '#E85D5D', '#E9A23B'],
    superficie: 'papel',
    textura: 'papel',
    brilho: false,
    caixaAlta: false,
    marcador: 'circulo',
    raio: 14,
    movimento: { entrada: 'power3.out', saida: 'power2.in', impacto: 'back.out(1.6)', duracao: 0.45, intervalo: 0.09 },
    largura: 0.62,
    enfeites: ['circulo', 'sublinhado', 'seta_curva'],
  },
  {
    chave: 'mg-luxo',
    nome: 'Luxo',
    carater: 'preto profundo, serifa elegante e dourado, movimento lento e preciso',
    quando: 'premium, finanças, mentoria, alto padrão, lifestyle sofisticado (estilo Gadzhi)',
    escuro: true,
    fontes: ["'Cormorant Garamond Bold'", "'Manrope ExtraBold'"],
    cores: ['#0B0B0C', '#F2EDE4', '#C9A96E', '#9C8B6E', '#E6D3A8'],
    superficie: 'contorno',
    textura: 'grao',
    brilho: true,
    caixaAlta: false,
    marcador: 'sublinhado',
    raio: 4,
    movimento: { entrada: 'expo.out', saida: 'power2.in', impacto: 'expo.out', duracao: 0.75, intervalo: 0.13 },
    largura: 0.5,
    enfeites: ['brilhos'],
  },
  {
    chave: 'mg-keynote',
    nome: 'Keynote',
    carater: 'preto puro, tipografia enorme e limpa, vidro e luz azul suave',
    quando: 'tecnologia, produto, lançamento, IA, apresentação de novidade',
    escuro: true,
    fontes: ["'Inter ExtraBold'", "'Inter SemiBold'"],
    cores: ['#050507', '#F5F5F7', '#2997FF', '#BF5AF2', '#30D158'],
    superficie: 'vidro',
    textura: 'nenhuma',
    brilho: true,
    caixaAlta: false,
    marcador: 'sublinhado',
    raio: 28,
    movimento: { entrada: 'expo.out', saida: 'power2.in', impacto: 'back.out(1.4)', duracao: 0.55, intervalo: 0.08 },
    largura: 0.6,
    enfeites: ['brilhos'],
  },
  {
    chave: 'mg-brutal',
    nome: 'Neo-brutal',
    carater: 'creme, bordas pretas grossas, sombra dura e cores chapadas vibrantes',
    quando: 'criadores, design, marketing jovem, humor, conteúdo ousado',
    escuro: false,
    fontes: ["'Archivo Black'", "'Space Grotesk Bold'"],
    cores: ['#FFF4E0', '#111111', '#FF5CA8', '#3D7BFF', '#FFC700'],
    superficie: 'brutal',
    textura: 'pontos',
    brilho: false,
    caixaAlta: false,
    marcador: 'bloco',
    raio: 14,
    movimento: { entrada: 'back.out(2)', saida: 'power3.in', impacto: 'back.out(2.4)', duracao: 0.32, intervalo: 0.07 },
    largura: 0.72,
    enfeites: ['estrela', 'explosao'],
  },
  {
    chave: 'mg-suico',
    nome: 'Suíço',
    carater: 'off-white, grade rígida, preto e UM vermelho, alinhado à esquerda',
    quando: 'explicação séria, dados, arquitetura, design, educação',
    escuro: false,
    fontes: ["'Inter ExtraBold'", "'Inter SemiBold'"],
    cores: ['#F2F0EB', '#111111', '#E4002B', '#1F3B73', '#7A7A7A'],
    superficie: 'nenhuma',
    textura: 'grade',
    brilho: false,
    caixaAlta: false,
    marcador: 'bloco',
    raio: 0,
    movimento: { entrada: 'power4.out', saida: 'power2.in', impacto: 'power4.out', duracao: 0.42, intervalo: 0.07 },
    largura: 0.6,
    enfeites: [],
  },
  {
    chave: 'mg-analogico',
    nome: 'Analógico',
    carater: 'marrom quente, grão de filme, serifa e âmbar, cara de documentário',
    quando: 'história, memórias, bastidores, autenticidade, reflexão',
    escuro: true,
    fontes: ["'DM Serif Display'", "'DM Sans ExtraBold'"],
    cores: ['#1C1712', '#F3E9D7', '#E8A33D', '#C8553D', '#8FB08F'],
    superficie: 'contorno',
    textura: 'grao',
    brilho: true,
    caixaAlta: false,
    marcador: 'marca-texto',
    raio: 6,
    movimento: { entrada: 'power3.out', saida: 'power2.in', impacto: 'power3.out', duracao: 0.6, intervalo: 0.11 },
    largura: 0.55,
    enfeites: ['sublinhado'],
  },
  {
    chave: 'mg-y2k',
    nome: 'Y2K',
    carater: 'roxo noturno, verde-limão e magenta, scanlines e brilho digital',
    quando: 'cultura digital, games, tendências, internet, público jovem',
    escuro: true,
    fontes: ["'Syne ExtraBold'", "'Space Grotesk Bold'"],
    cores: ['#0E0B1F', '#F4F1FF', '#C6FF00', '#FF2BD6', '#00E5FF'],
    superficie: 'contorno',
    textura: 'scanlines',
    brilho: true,
    caixaAlta: true,
    marcador: 'bloco',
    raio: 10,
    movimento: { entrada: 'expo.out', saida: 'power3.in', impacto: 'back.out(2)', duracao: 0.34, intervalo: 0.06 },
    largura: 1.0,
    enfeites: ['brilhos', 'estrela'],
    extra: 'neon',
  },
  {
    chave: 'mg-terminal',
    nome: 'Terminal',
    carater: 'tela de código: verde fósforo, âmbar, scanlines e cursor piscando',
    quando: 'programação, automação, IA técnica, segurança, ferramentas',
    escuro: true,
    fontes: ["'Space Grotesk Bold'", "'Space Grotesk Bold'"],
    cores: ['#0A0F0B', '#D7FFE1', '#39FF88', '#FFB000', '#5AC8FA'],
    superficie: 'contorno',
    textura: 'scanlines',
    brilho: true,
    caixaAlta: false,
    marcador: 'sublinhado',
    raio: 8,
    movimento: { entrada: 'power3.out', saida: 'power2.in', impacto: 'power4.out', duracao: 0.3, intervalo: 0.06 },
    largura: 0.62,
    enfeites: [],
  },
  {
    chave: 'mg-mercado',
    nome: 'Mercado',
    carater: 'azul-marinho de terminal financeiro, verde e vermelho, números condensados',
    quando: 'investimentos, economia, preços, resultados, métricas de negócio',
    escuro: true,
    fontes: ["'Barlow Condensed ExtraBold'", "'Inter SemiBold'"],
    cores: ['#07111F', '#EAF2FF', '#00D26A', '#FF4D4F', '#FFB020'],
    superficie: 'solida',
    textura: 'grade',
    brilho: false,
    caixaAlta: true,
    marcador: 'bloco',
    raio: 10,
    movimento: { entrada: 'power4.out', saida: 'power2.in', impacto: 'power4.out', duracao: 0.36, intervalo: 0.06 },
    largura: 0.52,
    enfeites: ['velocidade'],
  },
  {
    chave: 'mg-pop',
    nome: 'Pop',
    carater: 'azul elétrico chapado, amarelo e rosa, tipografia gorda que pula',
    quando: 'entretenimento, curiosidades, listas divertidas, conteúdo leve e rápido',
    escuro: true,
    fontes: ["'Bowlby One'", "'Outfit ExtraBold'"],
    cores: ['#2430FF', '#FFFFFF', '#FFE600', '#FF8AD0', '#00F0B5'],
    superficie: 'nenhuma',
    textura: 'nenhuma',
    brilho: false,
    caixaAlta: false,
    marcador: 'bloco',
    raio: 24,
    movimento: { entrada: 'back.out(2.2)', saida: 'back.in(1.6)', impacto: 'back.out(2.6)', duracao: 0.34, intervalo: 0.07 },
    largura: 0.8,
    enfeites: ['explosao', 'estrela', 'brilhos'],
  },
  {
    chave: 'mg-pastel',
    nome: 'Pastel',
    carater: 'rosa-claro, cartões brancos arredondados, sombras macias e cores doces',
    quando: 'beleza, bem-estar, maternidade, lifestyle, conteúdo acolhedor',
    escuro: false,
    fontes: ["'Poppins ExtraBold'", "'Poppins'"],
    cores: ['#FFF1F5', '#2D2A32', '#F25C8A', '#5B8DEF', '#22A699'],
    superficie: 'solida',
    textura: 'nenhuma',
    brilho: true,
    caixaAlta: false,
    marcador: 'marca-texto',
    raio: 36,
    movimento: { entrada: 'back.out(1.5)', saida: 'power2.in', impacto: 'back.out(1.8)', duracao: 0.45, intervalo: 0.09 },
    largura: 0.66,
    enfeites: ['brilhos'],
  },
  {
    chave: 'mg-cinema',
    nome: 'Cinema',
    carater: 'faixas pretas de cinema, letras altas condensadas, âmbar e grão',
    quando: 'storytelling, viagem, documentário, trailer, momento dramático',
    escuro: true,
    fontes: ["'Bebas Neue'", "'Inter SemiBold'"],
    cores: ['#050505', '#EDEDED', '#D4B483', '#9BB1C8', '#ED6A5A'],
    superficie: 'nenhuma',
    textura: 'grao',
    brilho: false,
    caixaAlta: true,
    marcador: 'sublinhado',
    raio: 2,
    movimento: { entrada: 'power2.out', saida: 'power2.in', impacto: 'expo.out', duracao: 0.8, intervalo: 0.14 },
    largura: 0.44,
    enfeites: [],
    extra: 'cinema',
  },
  {
    chave: 'mg-esporte',
    nome: 'Esporte',
    carater: 'preto e vermelho, letras condensadas inclinadas, velocidade e impacto',
    quando: 'treino, esporte, competição, desafio, resultado, energia alta',
    escuro: true,
    fontes: ["'Anton'", "'Barlow Condensed ExtraBold'"],
    cores: ['#0C0C0C', '#FFFFFF', '#FF2E2E', '#FFD400', '#00C2FF'],
    superficie: 'solida',
    textura: 'nenhuma',
    brilho: false,
    caixaAlta: true,
    marcador: 'bloco',
    raio: 4,
    movimento: { entrada: 'power4.out', saida: 'power4.in', impacto: 'power4.in', duracao: 0.24, intervalo: 0.05 },
    largura: 0.5,
    enfeites: ['velocidade', 'explosao'],
    extra: 'inclinado',
  },
  {
    chave: 'mg-vidro-claro',
    nome: 'Vidro claro',
    carater: 'cinza-gelo, vidro fosco com borda de luz, índigo e rosa, cara de app moderno',
    quando: 'apps, SaaS, startups, produtividade digital, tutoriais de ferramenta',
    escuro: false,
    fontes: ["'Plus Jakarta Sans ExtraBold'", "'Plus Jakarta Sans ExtraBold'"],
    cores: ['#EEF1F7', '#0F172A', '#5B5CF0', '#E5468F', '#0EA5A0'],
    superficie: 'vidro',
    textura: 'nenhuma',
    brilho: true,
    caixaAlta: false,
    marcador: 'marca-texto',
    raio: 30,
    movimento: { entrada: 'expo.out', saida: 'power2.in', impacto: 'back.out(1.5)', duracao: 0.5, intervalo: 0.08 },
    largura: 0.64,
    enfeites: ['brilhos'],
  },
  {
    chave: 'mg-revista',
    nome: 'Revista',
    carater: 'papel de revista, serifa gorda, laranja-vivo e azul tinta',
    quando: 'opinião, cultura, moda, análise, manifesto, notícia comentada',
    escuro: false,
    fontes: ["'Fraunces ExtraBold'", "'Work Sans ExtraBold'"],
    cores: ['#F4EFE6', '#1A1A1A', '#FF4A1C', '#1F4E79', '#C99A2E'],
    superficie: 'nenhuma',
    textura: 'papel',
    brilho: false,
    caixaAlta: false,
    marcador: 'sublinhado',
    raio: 0,
    movimento: { entrada: 'power3.out', saida: 'power2.in', impacto: 'power4.out', duracao: 0.5, intervalo: 0.09 },
    largura: 0.64,
    enfeites: ['sublinhado', 'seta_curva'],
  },
  {
    chave: 'mg-neon',
    nome: 'Neon',
    carater: 'noite azul, rosa e ciano que brilham, letras geométricas',
    quando: 'música, festa, vida noturna, tecnologia com atitude, eventos',
    escuro: true,
    fontes: ["'Sora ExtraBold'", "'Sora ExtraBold'"],
    cores: ['#0A0A14', '#F5F7FF', '#FF3CAC', '#2BD2FF', '#FAFF00'],
    superficie: 'contorno',
    textura: 'nenhuma',
    brilho: true,
    caixaAlta: false,
    marcador: 'sublinhado',
    raio: 22,
    movimento: { entrada: 'expo.out', saida: 'power2.in', impacto: 'back.out(1.8)', duracao: 0.42, intervalo: 0.08 },
    largura: 0.66,
    enfeites: ['brilhos', 'estrela'],
    extra: 'neon',
  },
  {
    chave: 'mg-colagem',
    nome: 'Colagem',
    carater: 'papel kraft, recortes tortos com fita, letra de marcador e cores de cartaz',
    quando: 'artesanal, criativo, DIY, educação infantil, conteúdo pessoal e autêntico',
    escuro: false,
    fontes: ["'Archivo Black'", "'Permanent Marker'"],
    cores: ['#EDE6D6', '#1B1B1B', '#E63946', '#2F6690', '#E9A23B'],
    superficie: 'papel',
    textura: 'papel',
    brilho: false,
    caixaAlta: false,
    marcador: 'circulo',
    raio: 4,
    movimento: { entrada: 'back.out(1.7)', saida: 'power2.in', impacto: 'back.out(2.2)', duracao: 0.4, intervalo: 0.09 },
    largura: 0.72,
    enfeites: ['estrela', 'seta_curva', 'circulo'],
    extra: 'fita',
  },
  {
    chave: 'mg-quadro-negro',
    nome: 'Quadro-negro',
    carater: 'lousa verde, giz branco e amarelo, letra de professor e rabiscos de giz',
    quando: 'aula, explicação passo a passo, matemática, concurso, ensino',
    escuro: true,
    fontes: ["'Caveat Brush'", "'Kalam Bold'"],
    cores: ['#1F3B2F', '#F1F1E8', '#F6D365', '#8FD3FE', '#F49FBC'],
    superficie: 'nenhuma',
    textura: 'grao',
    brilho: false,
    caixaAlta: false,
    marcador: 'circulo',
    raio: 6,
    movimento: { entrada: 'power2.out', saida: 'power2.in', impacto: 'back.out(1.6)', duracao: 0.45, intervalo: 0.1 },
    largura: 0.5,
    enfeites: ['circulo', 'seta_curva', 'sublinhado'],
  },
  {
    chave: 'mg-blueprint',
    nome: 'Blueprint',
    carater: 'planta técnica azul, grade fina, traço branco e cotas de engenheiro',
    quando: 'engenharia, arquitetura, processo, plano, produto em construção',
    escuro: true,
    fontes: ["'Space Grotesk Bold'", "'Space Grotesk Bold'"],
    cores: ['#0B3D91', '#EAF2FF', '#7FD1FF', '#FFD166', '#FF8FA3'],
    superficie: 'contorno',
    textura: 'grade',
    brilho: false,
    caixaAlta: true,
    marcador: 'sublinhado',
    raio: 4,
    movimento: { entrada: 'power3.out', saida: 'power2.in', impacto: 'power4.out', duracao: 0.4, intervalo: 0.08 },
    largura: 0.66,
    enfeites: ['seta_curva'],
  },
  {
    chave: 'mg-vaporwave',
    nome: 'Vaporwave',
    carater: 'roxo profundo, rosa e ciano neon, scanlines e brilho anos 80',
    quando: 'nostalgia, música, cultura pop, estética, entretenimento',
    escuro: true,
    fontes: ["'Righteous'", "'Outfit ExtraBold'"],
    cores: ['#1A0B2E', '#FFF1FA', '#FF71CE', '#01CDFE', '#FFFB96'],
    superficie: 'contorno',
    textura: 'scanlines',
    brilho: true,
    caixaAlta: false,
    marcador: 'bloco',
    raio: 18,
    movimento: { entrada: 'expo.out', saida: 'power2.in', impacto: 'back.out(1.8)', duracao: 0.45, intervalo: 0.08 },
    largura: 0.62,
    enfeites: ['brilhos', 'estrela'],
    extra: 'neon',
  },
  {
    chave: 'mg-retro70',
    nome: 'Retrô 70',
    carater: 'creme, laranja queimado e mostarda, letras gordas e arredondadas',
    quando: 'lifestyle, música, moda, café, marca com personalidade',
    escuro: false,
    fontes: ["'Bowlby One'", "'Lora Bold'"],
    cores: ['#F3E3C3', '#3B2314', '#E2711D', '#C9A227', '#8C4A2F'],
    superficie: 'solida',
    textura: 'papel',
    brilho: false,
    caixaAlta: false,
    marcador: 'bloco',
    raio: 30,
    movimento: { entrada: 'back.out(1.6)', saida: 'power2.in', impacto: 'back.out(2)', duracao: 0.42, intervalo: 0.09 },
    largura: 0.8,
    enfeites: ['estrela', 'brilhos'],
  },
  {
    chave: 'mg-jornal',
    nome: 'Jornal',
    carater: 'papel-jornal, serifa clássica, manchete e marca-texto vermelho',
    quando: 'notícia, polêmica, fato, análise, "saiu hoje"',
    escuro: false,
    fontes: ["'Libre Baskerville Bold'", "'Source Sans 3'"],
    cores: ['#F2EFE8', '#111111', '#C1121F', '#1D3557', '#6C757D'],
    superficie: 'nenhuma',
    textura: 'papel',
    brilho: false,
    caixaAlta: false,
    marcador: 'marca-texto',
    raio: 0,
    movimento: { entrada: 'power3.out', saida: 'power2.in', impacto: 'power4.out', duracao: 0.5, intervalo: 0.09 },
    largura: 0.62,
    enfeites: ['circulo', 'sublinhado'],
  },
  {
    chave: 'mg-gamer',
    nome: 'Gamer',
    carater: 'roxo-noite, verde e rosa elétricos, letras de placar e scanlines',
    quando: 'games, e-sports, desafio, ranking, streaming',
    escuro: true,
    fontes: ["'Russo One'", "'Space Grotesk Bold'"],
    cores: ['#0D0221', '#F5F5F5', '#00FF9F', '#FF3864', '#FFD319'],
    superficie: 'contorno',
    textura: 'scanlines',
    brilho: true,
    caixaAlta: true,
    marcador: 'bloco',
    raio: 8,
    movimento: { entrada: 'expo.out', saida: 'power3.in', impacto: 'back.out(2.2)', duracao: 0.3, intervalo: 0.05 },
    largura: 0.78,
    enfeites: ['explosao', 'velocidade'],
    extra: 'neon',
  },
  {
    chave: 'mg-cripto',
    nome: 'Cripto',
    carater: 'grafite escuro, laranja e roxo de blockchain, vidro e grade de dados',
    quando: 'cripto, fintech, investimento digital, Web3, mercado',
    escuro: true,
    fontes: ["'Orbitron ExtraBold'", "'Inter SemiBold'"],
    cores: ['#0B0F1A', '#E6EDF7', '#F7931A', '#627EEA', '#16C784'],
    superficie: 'vidro',
    textura: 'grade',
    brilho: true,
    caixaAlta: true,
    marcador: 'sublinhado',
    raio: 18,
    movimento: { entrada: 'expo.out', saida: 'power2.in', impacto: 'back.out(1.6)', duracao: 0.42, intervalo: 0.07 },
    largura: 0.9,
    enfeites: ['brilhos'],
  },
  {
    chave: 'mg-saude',
    nome: 'Saúde',
    carater: 'branco-menta, verde-água e azul calmo, cartões macios e limpos',
    quando: 'saúde, medicina, nutrição, clínica, bem-estar, psicologia',
    escuro: false,
    fontes: ["'Nunito Black'", "'Nunito Black'"],
    cores: ['#F3FAF8', '#0F2A2E', '#12A594', '#4D96FF', '#FF6B6B'],
    superficie: 'solida',
    textura: 'nenhuma',
    brilho: true,
    caixaAlta: false,
    marcador: 'marca-texto',
    raio: 28,
    movimento: { entrada: 'power3.out', saida: 'power2.in', impacto: 'back.out(1.5)', duracao: 0.45, intervalo: 0.09 },
    largura: 0.62,
    enfeites: ['check', 'brilhos'],
  },
  {
    chave: 'mg-juridico',
    nome: 'Jurídico',
    carater: 'grafite e marfim, serifa romana em caixa alta e bronze, sóbrio',
    quando: 'direito, contabilidade, consultoria, contratos, autoridade',
    escuro: true,
    fontes: ["'Cinzel ExtraBold'", "'Source Sans 3'"],
    cores: ['#10151C', '#F1ECE2', '#B08D57', '#7A8B99', '#C2410C'],
    superficie: 'contorno',
    textura: 'grao',
    brilho: false,
    caixaAlta: true,
    marcador: 'sublinhado',
    raio: 2,
    movimento: { entrada: 'expo.out', saida: 'power2.in', impacto: 'expo.out', duracao: 0.7, intervalo: 0.12 },
    largura: 0.82,
    enfeites: [],
  },
  {
    chave: 'mg-gourmet',
    nome: 'Gourmet',
    carater: 'chocolate escuro, creme e laranja-especiaria, serifa de cardápio',
    quando: 'gastronomia, receita, restaurante, café, delivery',
    escuro: true,
    fontes: ["'DM Serif Display'", "'Work Sans ExtraBold'"],
    cores: ['#1E1410', '#F7EBDD', '#E07A2F', '#D9A441', '#8FB339'],
    superficie: 'contorno',
    textura: 'grao',
    brilho: true,
    caixaAlta: false,
    marcador: 'sublinhado',
    raio: 14,
    movimento: { entrada: 'power3.out', saida: 'power2.in', impacto: 'back.out(1.5)', duracao: 0.55, intervalo: 0.1 },
    largura: 0.55,
    enfeites: ['brilhos', 'sublinhado'],
  },
  {
    chave: 'mg-fitness',
    nome: 'Fitness',
    carater: 'preto, verde-limão e laranja, letras condensadas altas e inclinadas',
    quando: 'treino, academia, corrida, dieta, desafio físico',
    escuro: true,
    fontes: ["'Big Shoulders Display Black'", "'Barlow Condensed ExtraBold'"],
    cores: ['#111111', '#FFFFFF', '#C6FF00', '#FF4D00', '#00B2FF'],
    superficie: 'solida',
    textura: 'nenhuma',
    brilho: false,
    caixaAlta: true,
    marcador: 'bloco',
    raio: 6,
    movimento: { entrada: 'power4.out', saida: 'power4.in', impacto: 'power4.in', duracao: 0.24, intervalo: 0.05 },
    largura: 0.46,
    enfeites: ['velocidade', 'explosao'],
    extra: 'inclinado',
  },
  {
    chave: 'mg-imovel',
    nome: 'Imóveis',
    carater: 'off-white de catálogo, verde-floresta e madeira, vidro claro e letras geométricas',
    quando: 'imóveis, arquitetura, decoração, construção, corretor',
    escuro: false,
    fontes: ["'Manrope ExtraBold'", "'Manrope ExtraBold'"],
    cores: ['#F5F3EF', '#1F2933', '#2F855A', '#B7791F', '#2B6CB0'],
    superficie: 'vidro',
    textura: 'nenhuma',
    brilho: true,
    caixaAlta: false,
    marcador: 'sublinhado',
    raio: 24,
    movimento: { entrada: 'expo.out', saida: 'power2.in', impacto: 'back.out(1.4)', duracao: 0.55, intervalo: 0.09 },
    largura: 0.64,
    enfeites: ['brilhos'],
  },
  {
    chave: 'mg-infantil',
    nome: 'Infantil',
    carater: 'amarelo-manteiga, coral, turquesa e letras de gibi que pulam',
    quando: 'crianças, educação infantil, maternidade divertida, brinquedos',
    escuro: false,
    fontes: ["'Luckiest Guy'", "'Nunito Black'"],
    cores: ['#FFF7E0', '#2B2D42', '#FF6B6B', '#1FA9A0', '#E0A800'],
    superficie: 'solida',
    textura: 'pontos',
    brilho: false,
    caixaAlta: false,
    marcador: 'bloco',
    raio: 40,
    movimento: { entrada: 'back.out(2.2)', saida: 'back.in(1.6)', impacto: 'back.out(2.8)', duracao: 0.38, intervalo: 0.08 },
    largura: 0.72,
    enfeites: ['estrela', 'brilhos', 'explosao'],
  },
  {
    chave: 'mg-beleza',
    nome: 'Beleza',
    carater: 'rosé, malva e ameixa, serifa delicada e vidro suave',
    quando: 'beleza, skincare, estética, moda feminina, autocuidado',
    escuro: false,
    fontes: ["'Cormorant Garamond Bold'", "'Poppins'"],
    cores: ['#FBF1EE', '#3A2A2A', '#B8606C', '#8E6C88', '#6D597A'],
    superficie: 'vidro',
    textura: 'nenhuma',
    brilho: true,
    caixaAlta: false,
    marcador: 'sublinhado',
    raio: 30,
    movimento: { entrada: 'power2.out', saida: 'power2.in', impacto: 'back.out(1.4)', duracao: 0.65, intervalo: 0.12 },
    largura: 0.5,
    enfeites: ['brilhos'],
  },
  {
    chave: 'mg-minimal',
    nome: 'Minimal',
    carater: 'quase branco, preto e um laranja só, tipografia grande e muito espaço',
    quando: 'qualquer assunto que pede clareza: produto, ideia, opinião, design',
    escuro: false,
    fontes: ["'Inter ExtraBold'", "'Inter SemiBold'"],
    cores: ['#F6F6F4', '#0B0B0B', '#FF4F00', '#5C5C5C', '#A3A3A3'],
    superficie: 'nenhuma',
    textura: 'nenhuma',
    brilho: false,
    caixaAlta: false,
    marcador: 'bloco',
    raio: 0,
    movimento: { entrada: 'power4.out', saida: 'power2.in', impacto: 'power4.out', duracao: 0.45, intervalo: 0.07 },
    largura: 0.6,
    enfeites: [],
  },
  {
    chave: 'mg-oceano',
    nome: 'Oceano',
    carater: 'azul-petróleo profundo, turquesa e coral, vidro e luz que ondula',
    quando: 'viagem, natureza, sustentabilidade, calma, bem-estar',
    escuro: true,
    fontes: ["'Sora ExtraBold'", "'Inter SemiBold'"],
    cores: ['#04293A', '#ECFBFF', '#64CCC5', '#FFB703', '#F28482'],
    superficie: 'vidro',
    textura: 'nenhuma',
    brilho: true,
    caixaAlta: false,
    marcador: 'sublinhado',
    raio: 26,
    movimento: { entrada: 'power2.out', saida: 'power2.in', impacto: 'back.out(1.4)', duracao: 0.6, intervalo: 0.1 },
    largura: 0.66,
    enfeites: ['brilhos'],
  },
  {
    chave: 'mg-adesivo',
    nome: 'Adesivo',
    carater: 'roxo vivo, adesivos com borda branca grossa, amarelo, verde e rosa',
    quando: 'redes sociais, criadores, dicas rápidas, humor, público jovem',
    escuro: true,
    fontes: ["'Titan One'", "'Nunito Black'"],
    cores: ['#5B4BDB', '#FFFFFF', '#FFD166', '#06D6A0', '#EF476F'],
    superficie: 'brutal',
    textura: 'nenhuma',
    brilho: false,
    caixaAlta: false,
    marcador: 'bloco',
    raio: 26,
    movimento: { entrada: 'back.out(2)', saida: 'back.in(1.5)', impacto: 'back.out(2.6)', duracao: 0.36, intervalo: 0.07 },
    largura: 0.72,
    enfeites: ['estrela', 'brilhos'],
  },
  {
    chave: 'mg-podcast',
    nome: 'Podcast',
    carater: 'preto de estúdio, verde de player e laranja, ondas de áudio e cartões sólidos',
    quando: 'podcast, entrevista, corte de episódio, conversa, áudio',
    escuro: true,
    fontes: ["'Montserrat ExtraBold'", "'Inter SemiBold'"],
    cores: ['#121212', '#F5F5F5', '#1DB954', '#FF9F1C', '#E5383B'],
    superficie: 'solida',
    textura: 'nenhuma',
    brilho: true,
    caixaAlta: false,
    marcador: 'bloco',
    raio: 16,
    movimento: { entrada: 'expo.out', saida: 'power2.in', impacto: 'back.out(1.6)', duracao: 0.4, intervalo: 0.07 },
    largura: 0.66,
    enfeites: ['velocidade'],
  },
  {
    chave: 'mg-produto',
    nome: 'Produto',
    carater: 'branco de app (Notion, Linear), cinza fino, azul e vermelho de interface',
    quando: 'SaaS, produtividade, tutorial de software, startup, ferramenta',
    escuro: false,
    fontes: ["'Inter ExtraBold'", "'Inter SemiBold'"],
    cores: ['#FBFBFA', '#191919', '#2383E2', '#E03E3E', '#0F7B6C'],
    superficie: 'contorno',
    textura: 'nenhuma',
    brilho: false,
    caixaAlta: false,
    marcador: 'marca-texto',
    raio: 12,
    movimento: { entrada: 'power3.out', saida: 'power2.in', impacto: 'back.out(1.4)', duracao: 0.4, intervalo: 0.07 },
    largura: 0.6,
    enfeites: [],
  },
  {
    chave: 'mg-grafite',
    nome: 'Grafite',
    carater: 'muro escuro, spray rosa, ciano e amarelo, letras de rua e rabiscos',
    quando: 'cultura urbana, rap, skate, moda de rua, atitude',
    escuro: true,
    fontes: ["'Bangers'", "'Permanent Marker'"],
    cores: ['#1B1B1B', '#FAFAFA', '#FF2E63', '#08D9D6', '#F9ED69'],
    superficie: 'nenhuma',
    textura: 'grao',
    brilho: false,
    caixaAlta: true,
    marcador: 'bloco',
    raio: 4,
    movimento: { entrada: 'back.out(1.8)', saida: 'power3.in', impacto: 'back.out(2.4)', duracao: 0.32, intervalo: 0.06 },
    largura: 0.5,
    enfeites: ['explosao', 'estrela', 'seta_curva'],
  },
];

export function visualDeMotion(chave: string | undefined | null): VisualDeMotion | undefined {
  return VISUAIS_DE_MOTION.find((v) => v.chave === chave);
}

// ---------- Os textos de uma cena ----------

export interface TextosDaCena {
  kicker?: string;
  titulo?: string;
  detalhe?: string;
  /** O número dito ("87", "1.500", "2,5"), sem a unidade. */
  numero?: string;
  /** Antes do número ("R$") e depois dele ("%", "mil", "dias"). */
  prefixo?: string;
  unidade?: string;
  antes?: string;
  depois?: string;
  a?: string;
  b?: string;
  itens?: string[];
  /** Os números de um gráfico (ditos), na ordem dos itens. */
  valores?: string[];
  /** A palavra (ou duas) que carrega o sentido. */
  enfase?: string;
  icone?: string;
  /** Um ícone por item (lista, ranking), na ordem dos itens. */
  icones?: string[];
  /** Um objeto animado (motion-assets.ts): o herói da cena "objeto" ou o acompanhante do ícone. */
  objeto?: string;
  /** Um rabisco à mão sobre a cena ("nenhum" tira o enfeite do visual). */
  rabisco?: string;
  /** Cena atrás da pessoa: o que pinta o fundo do vídeo por trás dela (a pessoa fica acesa por cima). */
  fundo?: FundoAtras;
}

/** O fundo que uma cena atrás da pessoa pinta: escurecido, xadrez de transparência ("sem fundo") ou grade de blueprint. */
export const FUNDOS_ATRAS = ['escuro', 'xadrez', 'grade'] as const;
export type FundoAtras = (typeof FUNDOS_ATRAS)[number];

const LIMITES: Record<string, number> = { kicker: 32, titulo: 96, detalhe: 140, numero: 16, prefixo: 6, unidade: 14, antes: 80, depois: 80, a: 60, b: 60, enfase: 40, icone: 32 };

/** Os textos que a IA mandou, limpos e no tamanho (nunca recusa: o que sobra é cortado). */
export function lerTextosDaCena(bruto: unknown): TextosDaCena {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const saida: TextosDaCena = {};
  const texto = (v: unknown) => (typeof v === 'number' ? String(v) : typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  for (const [k, max] of Object.entries(LIMITES)) {
    const v = texto(b[k]);
    if (v) (saida as Record<string, string>)[k] = v.slice(0, max);
  }
  const lista = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : [])
      .map(texto)
      .filter(Boolean)
      .map((x) => x.slice(0, max))
      .slice(0, 6);
  const itens = lista(b.itens, 64);
  if (itens.length) saida.itens = itens;
  const valores = lista(b.valores, 16);
  if (valores.length) saida.valores = valores;
  // Asset que não existe não entra (a cena sai sem ele, nunca quebra).
  // Ícone que não existe cai no padrão do preset (nunca quebra a cena).
  if (saida.icone && !iconeExiste(saida.icone)) delete saida.icone;
  const icones = lista(b.icones, 32).filter(iconeExiste);
  if (icones.length) saida.icones = icones;
  const objeto = texto(b.objeto);
  if (assetDeMotion(objeto)?.tipo === 'objeto') saida.objeto = objeto;
  const rabisco = texto(b.rabisco);
  if (rabisco === 'nenhum' || assetDeMotion(rabisco)?.tipo === 'rabisco') saida.rabisco = rabisco;
  const fundo = texto(b.fundo);
  if ((FUNDOS_ATRAS as readonly string[]).includes(fundo)) saida.fundo = fundo as FundoAtras;
  return saida;
}

// ---------- Os presets (as cenas) ----------

export type LayoutDoPreset = 'meio_a_meio' | 'cartao' | 'tela_cheia' | 'pip';

export interface PresetDeMotion {
  chave: string;
  nome: string;
  /** O que, na fala, pede este preset. */
  quando: string;
  /** Os campos de TextosDaCena que ele usa (os obrigatórios com *). */
  campos: string;
  /** Os layouts em que funciona (o primeiro é o preferido). */
  layouts: readonly LayoutDoPreset[];
  /** Do começo e do fim do vídeo: o servidor cria (a escolha das cenas da fala não os vê). */
  interno?: boolean;
  /** Ocupa o quadro em volta da pessoa e passa ATRÁS dela (recortada por cima) -- salvo pedido contrário. */
  atras?: boolean;
}

export const PRESETS_DE_MOTION: readonly PresetDeMotion[] = [
  { chave: 'impacto', nome: 'Palavra de impacto', quando: 'a palavra da virada, uma afirmação curta e forte', campos: 'titulo* (1-3 palavras), kicker, detalhe', layouts: ['tela_cheia', 'cartao', 'meio_a_meio'] },
  { chave: 'frase', nome: 'Frase cinética', quando: 'a frase-tese ou a frase de peso, dita devagar', campos: 'titulo* (a frase, até 12 palavras), enfase', layouts: ['tela_cheia', 'meio_a_meio', 'cartao'] },
  { chave: 'contador', nome: 'Contador', quando: 'um número, valor, prazo ou porcentagem DITO', campos: 'numero*, prefixo, unidade, titulo* (o que o número é), kicker, detalhe', layouts: ['meio_a_meio', 'cartao', 'pip', 'tela_cheia'] },
  { chave: 'anel', nome: 'Anel de progresso', quando: 'uma porcentagem dita (0 a 100)', campos: 'numero* (0-100), titulo*, detalhe', layouts: ['meio_a_meio', 'pip', 'tela_cheia', 'cartao'] },
  { chave: 'barras', nome: 'Gráfico de barras', quando: 'dois a cinco números ditos que se comparam', campos: 'itens* (rótulo de cada barra), valores* (os números ditos, mesma ordem), titulo, unidade', layouts: ['meio_a_meio', 'pip', 'tela_cheia'] },
  { chave: 'linha', nome: 'Gráfico de linha', quando: 'uma evolução dita (cresceu de X para Y, ao longo do tempo)', campos: 'valores* (2-6 números ditos, em ordem), itens (rótulos do eixo), titulo, unidade', layouts: ['meio_a_meio', 'pip', 'tela_cheia'] },
  { chave: 'versus', nome: 'Versus', quando: 'dois lados: A x B, errado x certo, isto ou aquilo', campos: 'a*, b*, kicker, detalhe', layouts: ['meio_a_meio', 'tela_cheia', 'pip'] },
  { chave: 'antes_depois', nome: 'Antes e depois', quando: 'uma troca: o jeito velho riscado e o novo', campos: 'antes*, depois*, kicker', layouts: ['cartao', 'meio_a_meio', 'tela_cheia'] },
  { chave: 'lista', nome: 'Lista com checks', quando: 'três ou mais itens enumerados', campos: 'itens* (2-5, curtos), titulo, icones (um ícone por item, opcional)', layouts: ['meio_a_meio', 'pip', 'tela_cheia'] },
  { chave: 'passos', nome: 'Passo a passo', quando: 'uma sequência de ações ou etapas', campos: 'itens* (2-5 passos), titulo', layouts: ['meio_a_meio', 'pip', 'tela_cheia'] },
  { chave: 'citacao', nome: 'Citação', quando: 'uma frase de alguém, ou a conclusão para lembrar', campos: 'titulo* (a frase), kicker (quem disse), enfase', layouts: ['tela_cheia', 'meio_a_meio', 'cartao'] },
  { chave: 'termo', nome: 'Definição', quando: 'um nome técnico ou conceito que quem assiste pode não conhecer', campos: 'titulo* (o termo), detalhe* (o que é, como foi dito), kicker (classe: substantivo, sigla...)', layouts: ['cartao', 'meio_a_meio', 'pip'] },
  { chave: 'pergunta', nome: 'Pergunta', quando: 'uma pergunta dita que o vídeo responde', campos: 'titulo* (a pergunta), detalhe (a resposta curta, se dita)', layouts: ['tela_cheia', 'meio_a_meio', 'cartao'] },
  { chave: 'notificacao', nome: 'Notificação', quando: 'uma mensagem, alerta de app, venda, aviso que chega', campos: 'titulo*, detalhe, kicker (nome do app), itens (até 3 notificações seguidas)', layouts: ['cartao', 'meio_a_meio'] },
  { chave: 'selo', nome: 'Selo carimbado', quando: 'um veredito curto: grátis, erro, aprovado, mito, verdade', campos: 'titulo* (1-2 palavras), kicker', layouts: ['cartao', 'meio_a_meio', 'tela_cheia'] },
  { chave: 'busca', nome: 'Busca digitada', quando: 'algo que se pesquisa, um comando, um prompt, um nome de site', campos: 'titulo* (o que é digitado), itens (resultados, até 3)', layouts: ['cartao', 'meio_a_meio', 'pip'] },
  { chave: 'chat', nome: 'Conversa', quando: 'um diálogo, o que alguém disse e a resposta, um prompt e a resposta da IA', campos: 'itens* (2-4 falas, alternando os lados)', layouts: ['meio_a_meio', 'pip', 'tela_cheia', 'cartao'] },
  { chave: 'alerta', nome: 'Alerta', quando: 'um erro comum, um cuidado, um "não faça isso"', campos: 'titulo*, kicker (ATENÇÃO, ERRO...), detalhe', layouts: ['cartao', 'meio_a_meio', 'tela_cheia'] },
  { chave: 'preco', nome: 'Preço', quando: 'um preço ou oferta dita (e o preço antigo, se dito)', campos: 'numero*, prefixo (R$), antes (preço antigo dito), titulo* (o que é), kicker', layouts: ['cartao', 'meio_a_meio', 'tela_cheia'] },
  { chave: 'ranking', nome: 'Ranking', quando: 'um top 3, top 5, os melhores ou piores em ordem', campos: 'itens* (do 1º ao último, 2-5), titulo, icones (um por item, opcional)', layouts: ['meio_a_meio', 'pip', 'tela_cheia'] },
  { chave: 'rotulo', nome: 'Rótulo (lower third)', quando: 'apresentar quem fala, um lugar, uma marca ou o tema do trecho', campos: 'titulo*, kicker', layouts: ['cartao'] },
  { chave: 'titulo', nome: 'Título de abertura', quando: 'o título do vídeo, nos primeiros segundos (sem fundo; pode passar atrás da pessoa)', campos: 'titulo* (até 7 palavras), kicker, enfase', layouts: ['cartao'], interno: true },
  { chave: 'chamada', nome: 'Chamada final', quando: 'a chamada do fim: seguir, salvar, comentar, comprar (sem fundo)', campos: 'titulo* (até 6 palavras), kicker, enfase', layouts: ['cartao'], interno: true },
  { chave: 'objeto', nome: 'Objeto animado', quando: 'um conceito que um objeto que se mexe mostra (o celular que recebe a venda, o sino que toca, as moedas que caem, o foguete que decola)', campos: 'objeto* (da lista de objetos), titulo*, detalhe', layouts: ['meio_a_meio', 'cartao', 'pip', 'tela_cheia'] },
  { chave: 'anotacao', nome: 'Anotação à mão', quando: 'apontar ou marcar algo na imagem, com uma frase curta (seta, círculo, X, check)', campos: 'rabisco* (da lista de rabiscos), titulo* (até 5 palavras)', layouts: ['cartao'] },
  { chave: 'icone', nome: 'Ícone grande', quando: 'um conceito simples que um ícone resume', campos: 'icone* (da lista de ícones), titulo*, detalhe', layouts: ['meio_a_meio', 'cartao', 'pip', 'tela_cheia'] },
  // Em volta da pessoa: o quadro inteiro, sem caixa; as de "atras" passam por trás dela.
  { chave: 'cartaz', nome: 'Título gigante atrás', quando: 'o nome do assunto, a palavra-tema, uma afirmação de 1 a 3 palavras para gravar (O MELHOR / EDITOR / DE VÍDEOS)', campos: 'titulo* (1-3 palavras), kicker (etiqueta de cima, 1-3 palavras), detalhe (etiqueta de baixo, 1-3 palavras), fundo', layouts: ['cartao'], atras: true },
  { chave: 'numero_gigante', nome: 'Número gigante atrás', quando: 'um número ou porcentagem DITO que é o ponto alto (66%, 10 mil)', campos: 'numero*, prefixo, unidade, kicker, fundo', layouts: ['cartao'], atras: true },
  { chave: 'placar', nome: 'Placar nas laterais', quando: 'dois números DITOS que se comparam (A tinha 27%, B tem 66%): uma barra de cada lado da pessoa', campos: 'a* (nome do 1º), b* (nome do 2º), valores* (os 2 números ditos), unidade, titulo, kicker, fundo', layouts: ['cartao'], atras: true },
  { chave: 'mosaico', nome: 'Cards em volta', quando: 'duas a quatro coisas citadas juntas (gráfico, imagem, mapa; os recursos de algo): um card com ícone para cada uma, em volta da pessoa', campos: 'itens* (2-4, de 1-2 palavras), icones (um por item), titulo', layouts: ['cartao'] },
  { chave: 'ladeando', nome: 'Ícones ao lado do rosto', quando: 'duas marcas, ferramentas ou ideias citadas juntas (isto e aquilo, um contra o outro)', campos: 'icones* (2), a (rótulo do 1º), b (rótulo do 2º), kicker', layouts: ['cartao'] },
  { chave: 'selecao', nome: 'Moldura de seleção', quando: 'mostrar a própria imagem como objeto: o "antes" cru, o "editado", o "você", um destaque de quem fala', campos: 'titulo* (a etiqueta: "RAW · sem edição", "✓ EDITADO"), fundo (xadrez = sem fundo)', layouts: ['cartao'], atras: true },
  { chave: 'hud', nome: 'Linhas de perspectiva', quando: 'perspectiva, visão, análise, enxergar, profundidade, foco: linhas e nós que desenham o ambiente em volta da pessoa', campos: 'titulo* (1-2 palavras), fundo', layouts: ['cartao'], atras: true },
  { chave: 'profundidade', nome: 'Texto 3D', quando: 'uma palavra que pede peso ou dimensão (PROFUNDIDADE, LONGE, GRANDE), no peito de quem fala', campos: 'titulo* (1-2 palavras), kicker', layouts: ['cartao'] },
  { chave: 'janela', nome: 'Janela de app 3D', quando: 'apresentar um produto, um método, uma ferramenta: a janela flutua atrás da cabeça com o título e as etapas', campos: 'titulo* (até 6 palavras), kicker (nome da janela), enfase (selo curto), itens (2-3 etapas de 1-2 palavras), icones (um por etapa)', layouts: ['cartao'], atras: true },
  { chave: 'linha_do_tempo', nome: 'Timeline de editor', quando: 'as partes, capítulos ou etapas de algo, mostradas como blocos numa linha do tempo com o cursor andando', campos: 'itens* (2-7 blocos de 1-2 palavras), titulo, kicker (etiqueta do cursor)', layouts: ['cartao'] },
  { chave: 'comentario', nome: 'Caixa de comentário', quando: 'o pedido de comentar uma palavra (comenta GUIA, escreve EU QUERO)', campos: 'titulo* (a palavra digitada), detalhe (a chamada acima, ex.: Comenta GUIA), kicker (o texto apagado da caixa)', layouts: ['cartao'] },
  { chave: 'mensagem', nome: 'Mensagem chegando', quando: 'algo que chega no direct, no e-mail ou no WhatsApp (o material, a resposta, a venda)', campos: 'titulo* (quem manda), detalhe* (a mensagem), kicker (o app), enfase (o anexo, 1 palavra)', layouts: ['cartao'] },
];

export function presetDeMotion(chave: string | undefined | null): PresetDeMotion | undefined {
  return PRESETS_DE_MOTION.find((p) => p.chave === chave);
}

/** Os visuais, uma linha cada, para a IA escolher. */
export function textoDosVisuais(): string {
  return VISUAIS_DE_MOTION.map((v) => `- ${v.chave}: ${v.carater}. Para: ${v.quando}.`).join('\n');
}

/** Os presets, uma linha cada, para a IA escolher. */
export function textoDosPresets(): string {
  return PRESETS_DE_MOTION.filter((p) => !p.interno)
    .map((p) => `- ${p.chave} [${p.layouts.join('|')}${p.atras ? ', atrás da pessoa' : ''}]: ${p.quando}. Campos: ${p.campos}.`)
    .join('\n');
}

// ---------- Montagem ----------

// "=" também: um texto como "onclick=" não pode parecer atributo para a checagem.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/=/g, '&#61;');
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "1.500" = 1500; "2,5" = 2.5 (casas = 1); texto que não é número = null. */
export function lerNumero(bruto: string | undefined): { valor: number; casas: number } | null {
  const t = (bruto ?? '').trim();
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$|^-?\d+\.\d{1,2}$/.test(t)) return null;
  let s = t;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(',', '.');
  const valor = Number(s);
  if (!Number.isFinite(valor)) return null;
  return { valor, casas: (s.split('.')[1] ?? '').length };
}

/**
 * O relógio da cena: o segundo (dentro da cena) em que um texto é DITO --
 * a primeira palavra dele com 3+ letras (ou um número) na fala, a partir
 * de `depois`. Sem achar, `depois + passo`. Nunca passa do último segundo
 * útil (a cena precisa de tempo para ser lida antes de sair).
 */
function relogio(palavras: ReadonlyArray<{ s: number; texto: string }>, duracaoS: number) {
  const ps = palavras.map((p) => ({ s: p.s, w: normal(p.texto).replace(/[^a-z0-9]/g, '') }));
  const limite = Math.max(0.15, duracaoS - 1.1);
  return (texto: string | undefined, depois: number, passo = 0.45): number => {
    const alvo = Math.min(limite, Math.max(0, depois));
    if (texto) {
      // "1.500" e "2,5" são uma palavra só (a transcrição também os escreve assim).
      const chaves = normal(texto)
        .replace(/(\d)[.,](?=\d)/g, '$1')
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 || /\d/.test(w));
      for (const c of chaves.slice(0, 3)) {
        const achada = ps.find((p) => p.s >= alvo - 0.05 && p.s <= limite && (p.w === c || (c.length >= 5 && p.w.startsWith(c.slice(0, 5)))));
        if (achada) return r2(Math.max(alvo, achada.s - 0.08));
      }
    }
    return r2(Math.min(limite, alvo + passo));
  };
}

const ICONES: Record<string, string> = {
  dinheiro: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.1 0 2.8 6 1.4 6 4 0 1.3-1.3 2.4-3 2.4-1.4 0-2.6-.6-3.2-1.6M12 6.5v11"/>',
  tempo: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/>',
  raio: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  grafico: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
  lampada: '<path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1v.5h5V16c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/><path d="M9.5 19h5M10.5 21.5h3"/>',
  estrela: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>',
  fogo: '<path d="M12 22c4 0 7-2.7 7-6.6 0-3.6-2.4-5.6-4-8.4-.6 2-1.6 3-3 3.5.4-2.8-.6-5.7-3-7.5.3 3.4-4 6.2-4 11.4C5 18.9 8 22 12 22z"/>',
  alerta: '<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  coracao: '<path d="M12 20s-7.5-4.4-9.2-9A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 9.2 4.4c-1.7 4.6-9.2 9-9.2 9z"/>',
  mensagem: '<path d="M4 5h16v11H9l-5 4z"/>',
  celular: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  foguete: '<path d="M12 2c3.5 2.5 5 6 5 10l-2.5 4h-5L7 12c0-4 1.5-7.5 5-10z"/><circle cx="12" cy="10" r="1.8"/><path d="M9.5 16 8 21l4-2 4 2-1.5-5"/>',
  seta: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  escudo: '<path d="M12 3 4.5 6v6c0 4.5 3.2 8 7.5 9 4.3-1 7.5-4.5 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>',
  lupa: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
};

export const ICONES_DE_MOTION = Object.keys(ICONES);

/** Os ícones duotone (Phosphor) registrados pelo servidor: [fundo, contorno] em 256x256. */
let ICONES_DUOTONE: Record<string, readonly [string, string]> = {};
let CATEGORIAS_DUOTONE: Record<string, readonly string[]> = {};

/**
 * Registra os ícones duotone ('@makucho/studio-contracts/icones-phosphor').
 * Só o servidor chama: o módulo tem centenas de ícones e não deve ir para o
 * navegador (as cenas já saem dele com o SVG pronto).
 */
export function usarIconesDuotone(icones: Record<string, readonly [string, string]>, categorias: Record<string, readonly string[]> = {}): void {
  ICONES_DUOTONE = icones;
  CATEGORIAS_DUOTONE = categorias;
}

/** O ícone existe (desenhado à mão ou duotone registrado)? */
export function iconeExiste(nome: string | undefined | null): boolean {
  return !!nome && (nome in ICONES || nome in ICONES_DUOTONE);
}

/** Os ícones, por assunto, para a IA escolher pelo nome. */
export function textoDosIcones(): string {
  const cats = Object.entries(CATEGORIAS_DUOTONE);
  if (!cats.length) return `ÍCONES: ${ICONES_DE_MOTION.join(', ')}.`;
  return `ÍCONES (campo "icone"; animados: o contorno se revela e a cor preenche):\n${cats.map(([c, l]) => `- ${c}: ${l.join(' ')}`).join('\n')}`;
}

/** Um ícone de traço que se desenha a partir de `t` (cada traço com pathLength 1); duotone: revela e preenche. */
function icone(nome: string | undefined, t: number, d = 0.9, classe = 'ic'): string {
  const duo = !ICONES[nome ?? ''] ? ICONES_DUOTONE[nome ?? ''] : undefined;
  if (duo) {
    const cls = classe.replace(/\bic\b/, 'icd');
    return `<svg class="${cls}" viewBox="0 0 256 256" aria-hidden="true" data-in="revela" data-t="${r2(t)}" data-d="${Math.min(0.7, d)}">${duo[0] ? `<path class="icd-f" d="${duo[0]}" data-in="aparece" data-t="${r2(t + 0.25)}"/>` : ''}<path class="icd-l" d="${duo[1]}"/></svg>`;
  }
  const miolo = ICONES[nome ?? ''] ?? ICONES.estrela!;
  const desenhado = miolo.replace(/<(path|circle|rect)\b/g, `<$1 pathLength="1" data-in="desenha" data-t="${r2(t)}" data-d="${d}"`);
  return `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true">${desenhado}</svg>`;
}

interface Ctx {
  v: VisualDeMotion;
  D: number;
  layout: LayoutDoPreset;
  /** A cena passa sobre o vídeo (layout cartão): sem fundo pintado. */
  sobre: boolean;
  t: ReturnType<typeof relogio>;
  /** Marca a palavra de ênfase dentro de um texto (revelada em `t`). */
  marcar: (texto: string, enfase: string | undefined, t: number) => string;
  /** O corpo do título que cabe (classe da escala, texto, fração da largura que ele ocupa). */
  corpo: (classe: ClasseDoTitulo, texto: string, fracao?: number) => string;
  /** Pip e tela cheia: a área é alta, peças lado a lado vão uma sobre a outra. */
  alto: boolean;
  /** Um asset animado (motion-assets.ts) no segundo `t`: devolve o SVG; o script dele entra na cena. */
  asset: (chave: string, t: number, classe?: string) => string;
  /** A pessoa medida no trecho (px de 1080x1920): as cenas em volta dela se ajustam; sem medida, o lugar padrão. */
  p?: PessoaNoQuadro;
}

const entre = (n: number, a: number, b: number) => Math.round(Math.max(a, Math.min(b, n)));

/** Quanto cabe ao lado da cabeça: a escala (0,6 a 1) de uma peça de `largura` px encostada na borda. */
function escalaAoLado(p: PessoaNoQuadro | undefined, largura: number): number {
  if (!p) return 1;
  const livre = Math.min(p.cabeca.x - p.cabeca.largura / 2, 1080 - (p.cabeca.x + p.cabeca.largura / 2));
  return r2(Math.max(0.6, Math.min(1, (livre - 24) / largura)));
}

type ClasseDoTitulo = 't-xl' | 't-l' | 't-m' | 't-s';

/** O teto de cada classe de título por layout (cqw, cqh da área útil). */
const ESCALA_DO_LAYOUT: Record<LayoutDoPreset, Record<ClasseDoTitulo, [number, number]>> = {
  meio_a_meio: { 't-xl': [21, 34], 't-l': [12.5, 15], 't-m': [9.4, 11], 't-s': [7, 8.5] },
  cartao: { 't-xl': [17, 40], 't-l': [9.5, 22], 't-m': [7.6, 19], 't-s': [6.2, 15] },
  tela_cheia: { 't-xl': [21, 34], 't-l': [14, 15], 't-m': [11, 12], 't-s': [8.4, 9] },
  // A coluna ao lado da janela do vídeo é estreita e alta: o teto é a largura.
  pip: { 't-xl': [24, 18], 't-l': [16, 10], 't-m': [13, 7.5], 't-s': [10.5, 6] },
};

/** O teto do número grande por layout (cqw, cqh). */
const NUMERO_DO_LAYOUT: Record<LayoutDoPreset, [number, number]> = { meio_a_meio: [30, 36], cartao: [20, 42], tela_cheia: [30, 24], pip: [34, 18] };

/** O número grande com prefixo e unidade, no corpo que cabe na largura. */
function corpoDoNumero(c: Ctx, x: TextosDaCena, fracao = 1): string {
  const [w, h] = NUMERO_DO_LAYOUT[c.layout];
  // Prefixo e unidade saem a 42% do corpo; algarismos ~0,6 em.
  const l = Math.max(0.55, c.v.largura);
  const largura = [...(x.numero ?? '')].length * l + ([...(x.prefixo ?? '')].length + [...(x.unidade ?? '')].length) * 0.42 * l + 0.2;
  return `font-size:min(${Math.min(w, (90 * fracao) / Math.max(1.5, largura)).toFixed(1)}cqw,${h}cqh)`;
}

/** A palavra de ênfase envolvida no marcador do visual. */
function marcador(v: VisualDeMotion) {
  return (texto: string, enfase: string | undefined, t: number): string => {
    const seguro = esc(texto);
    if (!enfase) return seguro;
    // Palavra inteira: "feito" não marca o fim de "perfeito".
    const n = normal(texto);
    const e = normal(enfase);
    let i = -1;
    for (let k = n.indexOf(e); k >= 0; k = n.indexOf(e, k + 1)) {
      const antesOk = k === 0 || !/[a-z0-9]/.test(n[k - 1]!);
      const depoisOk = k + e.length >= n.length || !/[a-z0-9]/.test(n[k + e.length]!);
      if (antesOk && depoisOk) {
        i = k;
        break;
      }
    }
    if (i < 0) return seguro;
    const antes = esc(texto.slice(0, i));
    const palavra = esc(texto.slice(i, i + enfase.length));
    const depois = esc(texto.slice(i + enfase.length));
    const fundo =
      v.marcador === 'circulo'
        ? `<svg class="mk-c" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" data-in="desenha" data-t="${r2(t + 0.1)}" data-d="0.55" d="M10 24C8 9 90 4 95 19c4 13-78 19-88 6C3 18 18 9 34 7"/></svg>`
        : `<i class="mk-x" data-in="enche" data-t="${r2(t + 0.08)}" data-d="0.4"></i>`;
    return `${antes}<span class="mk">${fundo}<span class="mk-p">${palavra}</span></span>${depois}`;
  };
}

/**
 * O corpo que cabe: a palavra mais longa não pode passar da largura (uma
 * palavra não quebra). Devolve o estilo com o teto pela largura.
 */
function cabe(texto: string, maxCqw: number, maxCqh: number, v: VisualDeMotion, fracao = 1): string {
  const longa = Math.max(3, ...texto.split(/\s+/).map((w) => [...w].length));
  const letra = v.largura;
  const cqw = Math.min(maxCqw, (92 * fracao) / (longa * letra));
  return `font-size:min(${cqw.toFixed(1)}cqw,${maxCqh}cqh)`;
}

/**
 * O corpo (px no quadro de 1080) em que um texto cabe em `linhas` linhas de
 * `largura` px: a palavra mais longa numa linha só, o todo nas linhas.
 * `caixa`: o texto sai em caixa alta mesmo num visual que não usa (letra mais larga).
 */
function corpoPx(texto: string, largura: number, teto: number, v: VisualDeMotion, linhas = 1, caixa = false): number {
  const l = Math.max(0.42, v.largura) * (caixa && !v.caixaAlta ? 1.12 : 1);
  const longa = Math.max(2, ...texto.split(/\s+/).map((w) => [...w].length));
  const todo = Math.max(2, [...texto].length);
  return Math.max(18, Math.round(Math.min(teto, largura / (longa * l), (largura * linhas) / (todo * l * 1.08))));
}

/** Palavras que não terminam linha: ficam com a palavra seguinte ("de vídeos", não "de / vídeos"). */
const LIGACOES = new Set(['o', 'a', 'os', 'as', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'para', 'pra', 'com', 'que', 'por', 'se', 'ao', 'à', 'é', 'seu', 'sua', 'meu', 'minha']);

/** As palavras em `n` linhas: a divisão com a linha mais longa mais curta, sem ligação no fim de linha. */
function quebrarEm(palavras: readonly string[], n: number): string[] {
  let melhor: { linhas: string[]; nota: number } | null = null;
  const tentar = (de: number, resto: number, acc: string[][]) => {
    if (resto === 1) {
      const linhas = [...acc, palavras.slice(de) as string[]].map((l) => l.join(' '));
      const nota = Math.max(...linhas.map((l) => [...l].length)) + 4 * [...acc].filter((l) => LIGACOES.has(normal(l[l.length - 1]!))).length;
      if (!melhor || nota < melhor.nota) melhor = { linhas, nota };
      return;
    }
    for (let ate = de + 1; ate <= palavras.length - resto + 1; ate += 1) tentar(ate, resto - 1, [...acc, palavras.slice(de, ate) as string[]]);
  };
  tentar(0, Math.min(n, palavras.length), []);
  return melhor!.linhas;
}

/**
 * O bloco de texto acima da cabeça (os textos que passam atrás da pessoa):
 * o MENOR número de linhas em que a letra ainda fica grande (`alvo`), o
 * corpo que cabe na largura e na altura livre, e o pé do bloco encostado no
 * topo da cabeça -- o máximo de texto à mostra. Sem a pessoa medida, o
 * rosto de um vídeo típico (topo da cabeça em ~560 px).
 */
export function blocoAcimaDaCabeca(
  texto: string,
  v: Pick<VisualDeMotion, 'largura' | 'caixaAlta'>,
  p: PessoaNoQuadro | null | undefined,
  o: { caixa?: boolean; fonteMax: number; alvo: number; maxLinhas?: number; topoMin?: number; acima?: number; altura?: number },
): { linhas: string[]; fonte: number; topo: number; base: number } {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const l = Math.max(0.42, v.largura) * (o.caixa && !v.caixaAlta ? 1.12 : 1);
  const alturaDaLinha = o.altura ?? 0.9;
  const topoMin = o.topoMin ?? 205;
  // O pé do bloco: um pouco abaixo do topo da cabeça (o cabelo cobre a base das letras: dá profundidade).
  const base = p ? Math.max(topoMin + 160, Math.min(1000, p.cabeca.topo + Math.round((p.cabeca.base - p.cabeca.topo) * 0.12))) : 620;
  const livre = base - topoMin - (o.acima ?? 0);
  const larguraUtil = 1000;
  const corpoDe = (linhas: string[]) => Math.min(o.fonteMax, larguraUtil / (Math.max(...linhas.map((x) => [...x].length)) * l));
  const max = Math.max(1, Math.min(o.maxLinhas ?? 4, palavras.length));
  const opcoes = Array.from({ length: max }, (_, i) => {
    const linhas = quebrarEm(palavras, i + 1);
    return { linhas, fonte: Math.min(corpoDe(linhas), livre / ((i + 1) * alturaDaLinha)) };
  });
  // A menor quantidade de linhas com a letra grande o bastante; se nenhuma
  // chega lá, a de menos linhas que fica perto (85%) da maior letra possível.
  const maior = Math.max(...opcoes.map((x) => x.fonte));
  const escolha = opcoes.find((x) => x.fonte >= o.alvo) ?? opcoes.find((x) => x.fonte >= maior * 0.85)!;
  const fonte = Math.max(40, Math.floor(escolha.fonte));
  const alturaDoBloco = Math.round(escolha.linhas.length * fonte * alturaDaLinha);
  return { linhas: escolha.linhas, fonte, base, topo: Math.max(topoMin + (o.acima ?? 0), base - alturaDoBloco) };
}

/** Um título em linhas que sobem por máscara, uma de cada vez, no ritmo da fala. */
function linhas(c: Ctx, texto: string, desde: number, enfase?: string, classe = 't-l', porLinha = 0): { html: string; fim: number } {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const alvo = porLinha || (palavras.length <= 3 ? 1 : palavras.length <= 6 ? 2 : 3);
  const grupos: string[] = [];
  for (let i = 0; i < palavras.length; i += alvo) grupos.push(palavras.slice(i, i + alvo).join(' '));
  let t = desde;
  const html = grupos
    .map((g, i) => {
      t = i === 0 ? c.t(g, desde, 0) : c.t(g, t + 0.18, 0.32);
      const corpo = c.corpo(classe as ClasseDoTitulo, texto);
      return `<span class="mg-m"><span class="mg-t ${classe} mg-l" style="${corpo}" data-in="mascara" data-t="${t}">${c.marcar(g, enfase, t)}</span></span>`;
    })
    .join('');
  return { html: `<div class="mg-linhas">${html}</div>`, fim: t };
}

const kicker = (texto: string | undefined, t: number, classe = '') => (texto ? `<div class="mg-k ${classe}" data-in="sobe" data-t="${r2(Math.max(0, t))}">${esc(texto)}</div>` : '');
const detalhe = (texto: string | undefined, t: number) => (texto ? `<p class="mg-d" data-in="sobe" data-t="${r2(t)}">${esc(texto)}</p>` : '');

/** Um número que conta até o valor dito (ou o texto como veio, se não for número). */
function numero(n: string | undefined, t: number, d = 1.1): string {
  const lido = lerNumero(n);
  if (!lido) return `<span class="v">${esc(n ?? '')}</span>`;
  return `<span class="v" data-conta="${lido.valor}" data-casas="${lido.casas}" data-t="${r2(t)}" data-d="${d}">0</span>`;
}

type Montador = (x: TextosDaCena, c: Ctx) => { html: string; css?: string; script?: string };

const MONTADORES: Record<string, Montador> = {
  impacto: (x, c) => {
    const t0 = c.t(x.titulo, 0.12, 0.25);
    return {
      html: `<div class="mg mg-centro${c.sobre ? ' mg-solto' : ''}">${kicker(x.kicker, t0 - 0.3)}<h1 class="mg-t t-xl" style="${c.corpo('t-xl', x.titulo ?? '')}" data-in="bate" data-t="${t0}">${c.marcar(x.titulo ?? '', x.enfase ?? x.titulo, t0 + 0.2)}</h1>${detalhe(x.detalhe, c.t(x.detalhe, t0 + 0.7))}</div>`,
      script: `tl.fromTo('.mg', { x: 0 }, { x: -12, duration: 0.045, yoyo: true, repeat: 5, ease: 'none' }, ${r2(t0 + 0.3)});`,
    };
  },
  frase: (x, c) => {
    const l = linhas(c, x.titulo ?? '', 0.1, x.enfase);
    return { html: `<div class="mg mg-esq${c.sobre ? ' mg-solto' : ''}">${kicker(x.kicker, 0)}${l.html}</div>` };
  },
  contador: (x, c) => {
    const tn = c.t(x.numero ?? x.unidade, 0.3, 0.35);
    const tt = c.t(x.titulo, tn + 0.45);
    return {
      html: `<div class="mg mg-esq${c.sobre ? ' mg-card' : ''}">${kicker(x.kicker, tn - 0.35)}<div class="mg-num" style="${corpoDoNumero(c, x)}" data-in="escala" data-t="${tn}">${x.prefixo ? `<span class="pre">${esc(x.prefixo)}</span>` : ''}${numero(x.numero, tn)}${x.unidade ? `<span class="suf">${esc(x.unidade)}</span>` : ''}</div><div class="mg-trilho"><i data-in="enche" data-t="${r2(tn + 0.15)}" data-d="1.1"></i></div><div class="mg-t t-m" style="${c.corpo('t-m', x.titulo ?? '')}" data-in="sobe" data-t="${tt}">${c.marcar(x.titulo ?? '', x.enfase, tt)}</div>${detalhe(x.detalhe, c.t(x.detalhe, tt + 0.5))}</div>`,
    };
  },
  anel: (x, c) => {
    const tn = c.t(x.numero, 0.3, 0.3);
    const lido = lerNumero(x.numero);
    const fracao = lido ? Math.max(0, Math.min(1, lido.valor / 100)) : 1;
    const tt = c.t(x.titulo, tn + 0.5);
    return {
      html: `<div class="mg mg-anel${c.sobre ? ' mg-card' : ''}"><div class="anel" data-in="escala" data-t="${r2(Math.max(0, tn - 0.25))}"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="trilho" cx="100" cy="100" r="84"/><circle class="arco" cx="100" cy="100" r="84" pathLength="1" data-in="desenha" data-t="${tn}" data-d="1.3" data-ate="${r2(1 - fracao)}"/></svg><div class="mg-num anel-num" style="font-size:${(56 / (([...(x.numero ?? '')].length + 0.45) * Math.max(0.55, c.v.largura))).toFixed(1)}cqi">${numero(x.numero, tn, 1.3)}<span class="suf">%</span></div></div><div class="anel-txt"><div class="mg-t t-m" style="${c.corpo('t-m', x.titulo ?? '', c.alto ? 1 : 0.48)}" data-in="sobe" data-t="${tt}">${c.marcar(x.titulo ?? '', x.enfase, tt)}</div>${detalhe(x.detalhe, c.t(x.detalhe, tt + 0.5))}</div></div>`,
    };
  },
  barras: (x, c) => {
    const valores = (x.valores ?? []).map((v) => lerNumero(v)?.valor ?? 0);
    const n = Math.min(5, Math.max(valores.length, (x.itens ?? []).length));
    const maior = Math.max(1, ...valores);
    let t = 0.35;
    const barras = Array.from({ length: n }, (_, i) => {
      t = i === 0 ? c.t(x.itens?.[i] ?? x.valores?.[i], 0.35, 0.2) : c.t(x.itens?.[i] ?? x.valores?.[i], t + 0.3, 0.4);
      const h = Math.max(6, Math.round(((valores[i] ?? 0) / maior) * 100));
      const topo = valores[i] === maior;
      return `<div class="barra${topo ? ' topo' : ''}"><div class="barra-v mg-num" data-in="sobe" data-t="${r2(t + 0.3)}">${numero(x.valores?.[i], t + 0.3, 0.8)}${x.unidade ? `<span class="suf">${esc(x.unidade)}</span>` : ''}</div><div class="barra-col"><i style="height:${h}%" data-in="cresce" data-t="${t}" data-d="0.8"></i></div><div class="barra-r" data-in="aparece" data-t="${t}">${esc(x.itens?.[i] ?? '')}</div></div>`;
    }).join('');
    return { html: `<div class="mg mg-esq${c.sobre ? ' mg-card' : ''}">${x.titulo ? `<div class="mg-t t-s" style="${c.corpo('t-s', x.titulo)}" data-in="sobe" data-t="0.05">${esc(x.titulo)}</div>` : ''}<div class="mg-barras">${barras}</div></div>` };
  },
  linha: (x, c) => {
    const valores = (x.valores ?? []).map((v) => lerNumero(v)?.valor ?? 0).slice(0, 6);
    while (valores.length < 2) valores.unshift(0);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const pontos = valores.map((v, i) => [20 + (i * 560) / (valores.length - 1), 270 - ((v - min) / Math.max(1e-9, max - min)) * 230] as const);
    const d = pontos.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
    const t0 = c.t(x.valores?.[0], 0.35, 0.2);
    const tFim = c.t(x.valores?.[valores.length - 1], t0 + 1, 1.2);
    const dur = r2(Math.max(0.8, tFim - t0 + 0.3));
    const ult = pontos[pontos.length - 1]!;
    const marcas = pontos.map(([px, py], i) => `<circle class="pt" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9" data-in="escala" data-t="${r2(t0 + (dur * i) / Math.max(1, pontos.length - 1))}"/>`).join('');
    const rotulos = (x.itens ?? []).slice(0, valores.length).map((r) => `<span>${esc(r)}</span>`).join('');
    return {
      html: `<div class="mg mg-esq${c.sobre ? ' mg-card' : ''}">${x.titulo ? `<div class="mg-t t-s" style="${c.corpo('t-s', x.titulo)}" data-in="sobe" data-t="0.05">${esc(x.titulo)}</div>` : ''}<div class="mg-linha"><svg viewBox="0 0 600 300" aria-hidden="true"><path class="area" d="${d} L${ult[0].toFixed(1)} 290 L20 290 Z" data-in="aparece" data-t="${r2(t0 + dur * 0.6)}"/><path class="traco" pathLength="1" d="${d}" data-in="desenha" data-t="${t0}" data-d="${dur}"/>${marcas}</svg><div class="linha-fim mg-num" data-in="bate" data-t="${r2(t0 + dur)}" style="right:${(100 - (ult[0] / 600) * 100 + 2).toFixed(1)}%;top:${((ult[1] / 300) * 100 + 4).toFixed(1)}%">${numero(x.valores?.[x.valores.length - 1], t0 + dur, 0.6)}${x.unidade ? `<span class="suf">${esc(x.unidade)}</span>` : ''}</div></div>${rotulos ? `<div class="linha-eixo" data-in="aparece" data-t="${t0}">${rotulos}</div>` : ''}</div>`,
    };
  },
  versus: (x, c) => {
    const ta = c.t(x.a, 0.2, 0.15);
    const tb = c.t(x.b, ta + 0.6, 0.9);
    return {
      html: `<div class="mg mg-vs">${kicker(x.kicker, ta - 0.3, 'vs-k')}<div class="vs-lado vs-a mg-card" data-in="esq" data-t="${ta}">${icone('x', ta + 0.2, 0.5, 'ic vs-ic')}<div class="mg-t t-s" style="${c.corpo('t-s', x.a ?? '', c.layout === 'pip' ? 0.8 : 0.36)}">${esc(x.a ?? '')}</div></div><div class="vs-meio" data-in="bate" data-t="${r2((ta + tb) / 2)}">VS</div><div class="vs-lado vs-b mg-card" data-in="dir" data-t="${tb}">${icone('check', tb + 0.2, 0.5, 'ic vs-ic')}<div class="mg-t t-s" style="${c.corpo('t-s', x.b ?? '', c.layout === 'pip' ? 0.8 : 0.36)}">${esc(x.b ?? '')}</div></div>${detalhe(x.detalhe, c.t(x.detalhe, tb + 0.6))}</div>`,
    };
  },
  antes_depois: (x, c) => {
    const ta = c.t(x.antes, 0.15, 0.1);
    const td = c.t(x.depois, ta + 0.8, 1);
    return {
      html: `<div class="mg mg-esq${c.sobre ? ' mg-card' : ''}">${kicker(x.kicker, ta - 0.3)}<div class="ad-antes" data-in="sobe" data-t="${ta}"><span class="mg-t t-s" style="${c.corpo('t-s', x.antes ?? '')}">${esc(x.antes ?? '')}</span><i class="ad-risco" data-in="enche" data-t="${r2(Math.max(ta + 0.4, td - 0.35))}" data-d="0.35"></i></div><svg class="ad-seta" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" data-in="desenha" data-t="${r2(td - 0.15)}" data-d="0.35" d="M12 3v17m-6-6 6 6 6-6"/></svg><div class="mg-t t-m ad-depois" style="${c.corpo('t-m', x.depois ?? '')}" data-in="bate" data-t="${td}">${c.marcar(x.depois ?? '', x.enfase ?? x.depois, td + 0.15)}</div></div>`,
    };
  },
  lista: (x, c) => {
    const itens = (x.itens ?? []).slice(0, 5);
    let t = x.titulo ? 0.35 : 0.15;
    const linhasHtml = itens
      .map((it, i) => {
        t = c.t(it, i === 0 ? t : t + 0.35, i === 0 ? 0.15 : 0.55);
        return `<li data-in="esq" data-t="${t}">${icone(x.icones?.[i] ?? iconeDoTexto(it) ?? 'check', t + 0.12, 0.45, 'ic li-ic')}<span>${esc(it)}</span></li>`;
      })
      .join('');
    return { html: `<div class="mg mg-esq${c.sobre ? ' mg-card' : ''}">${x.titulo ? `<div class="mg-t t-s" style="${c.corpo('t-s', x.titulo)}" data-in="sobe" data-t="0.05">${esc(x.titulo)}</div>` : ''}<ul class="mg-lista">${linhasHtml}</ul></div>` };
  },
  passos: (x, c) => {
    const itens = (x.itens ?? []).slice(0, 5);
    let t = x.titulo ? 0.35 : 0.15;
    const tempos: number[] = [];
    const passos = itens
      .map((it, i) => {
        t = c.t(it, i === 0 ? t : t + 0.35, i === 0 ? 0.15 : 0.6);
        tempos.push(t);
        return `<li><b class="ps-n" data-in="bate" data-t="${t}">${i + 1}</b><span data-in="sobe" data-t="${r2(t + 0.08)}">${esc(it)}</span></li>`;
      })
      .join('');
    const fim = tempos[tempos.length - 1] ?? 1;
    return { html: `<div class="mg mg-esq${c.sobre ? ' mg-card' : ''}">${x.titulo ? `<div class="mg-t t-s" style="${c.corpo('t-s', x.titulo)}" data-in="sobe" data-t="0.05">${esc(x.titulo)}</div>` : ''}<ol class="mg-passos"><i class="ps-linha" data-in="desce-linha" data-t="${tempos[0] ?? 0.2}" data-d="${r2(Math.max(0.5, fim - (tempos[0] ?? 0)))}"></i>${passos}</ol></div>` };
  },
  citacao: (x, c) => {
    const l = linhas(c, x.titulo ?? '', 0.25, x.enfase, 't-m');
    return {
      html: `<div class="mg mg-esq${c.sobre ? ' mg-card' : ''}"><div class="cit-aspas" data-in="escala" data-t="0.05">“</div>${l.html}${x.kicker ? `<div class="cit-autor" data-in="sobe" data-t="${r2(l.fim + 0.45)}">— ${esc(x.kicker)}</div>` : ''}</div>`,
    };
  },
  termo: (x, c) => {
    const tt = c.t(x.titulo, 0.15, 0.1);
    const td = c.t(x.detalhe, tt + 0.6);
    return {
      html: `<div class="mg mg-esq mg-card mg-termo"><div class="mg-t t-m" style="${c.corpo('t-m', x.titulo ?? '')}" data-in="mascara-solo" data-t="${tt}">${esc(x.titulo ?? '')}</div>${x.kicker ? `<div class="termo-classe" data-in="aparece" data-t="${r2(tt + 0.3)}">${esc(x.kicker)}</div>` : ''}<i class="termo-fio" data-in="enche" data-t="${r2(tt + 0.35)}" data-d="0.6"></i>${detalhe(x.detalhe, td)}</div>`,
    };
  },
  pergunta: (x, c) => {
    const l = linhas(c, x.titulo ?? '', 0.2, x.enfase, 't-m');
    const tr = c.t(x.detalhe, l.fim + 0.7, 0.8);
    return {
      html: `<div class="mg mg-esq${c.sobre ? ' mg-card' : ''}"><div class="perg-glifo" data-in="gira" data-t="0.05">?</div>${l.html}${x.detalhe ? `<div class="perg-resp mg-t t-s" data-in="bate" data-t="${tr}">${c.marcar(x.detalhe, x.detalhe, tr + 0.12)}</div>` : ''}</div>`,
    };
  },
  notificacao: (x, c) => {
    const lista = x.itens?.length ? x.itens.slice(0, 3) : [x.titulo ?? ''];
    let t = 0.1;
    const cards = lista
      .map((it, i) => {
        t = c.t(it, i === 0 ? 0.1 : t + 0.5, i === 0 ? 0 : 0.8);
        return `<div class="notif mg-card" data-in="desce" data-t="${t}"><div class="notif-app">${icone(x.icone ?? 'mensagem', t + 0.1, 0.4, 'ic notif-ic')}</div><div class="notif-txt"><div class="notif-topo"><span>${esc(x.kicker ?? 'Agora')}</span><span>agora</span></div><div class="notif-tit">${esc(it)}</div>${i === 0 && x.detalhe ? `<div class="notif-det">${esc(x.detalhe)}</div>` : ''}</div></div>`;
      })
      .join('');
    return { html: `<div class="mg mg-notifs">${cards}</div>` };
  },
  selo: (x, c) => {
    const t0 = c.t(x.titulo, 0.15, 0.2);
    return {
      html: `<div class="mg mg-centro${c.sobre ? ' mg-solto' : ''}">${kicker(x.kicker, t0 - 0.35)}<div class="selo" style="${cabe(x.titulo ?? '', 15, 26, { ...c.v, caixaAlta: true })}" data-in="carimbo" data-t="${t0}"><span>${esc(x.titulo ?? '')}</span></div></div>`,
      script: `tl.fromTo('.mg', { x: 0, y: 0 }, { x: 8, y: -6, duration: 0.04, yoyo: true, repeat: 3, ease: 'none' }, ${r2(t0 + 0.2)});`,
    };
  },
  busca: (x, c) => {
    const q = x.titulo ?? '';
    const t0 = c.t(q, 0.25, 0.2);
    const letras = [...q].map((ch) => `<i class="c">${esc(ch)}</i>`).join('');
    const fimDigitacao = t0 + Math.min(1.8, q.length * 0.045);
    const res = (x.itens ?? [])
      .slice(0, 3)
      .map((r, i) => `<div class="busca-res" data-in="sobe" data-t="${r2(fimDigitacao + 0.35 + i * 0.25)}"><b></b><span>${esc(r)}</span></div>`)
      .join('');
    return {
      html: `<div class="mg mg-centro mg-busca"><div class="busca mg-card" data-in="escala" data-t="0.05">${icone('lupa', 0.15, 0.4, 'ic busca-ic')}<div class="busca-q" style="${cabe(q, c.layout === 'pip' ? 9 : 6.4, c.layout === 'cartao' ? 13 : 8, c.v, 0.8)}" data-digita="1" data-t="${t0}">${letras}<span class="cursor"></span></div></div>${res}</div>`,
    };
  },
  chat: (x, c) => {
    let t = 0.15;
    const falas = (x.itens ?? [])
      .slice(0, 4)
      .map((f, i) => {
        t = c.t(f, i === 0 ? 0.15 : t + 0.5, i === 0 ? 0 : 0.9);
        return `<div class="bolha ${i % 2 ? 'eu' : 'ele'}" data-in="balao" data-t="${t}">${esc(f)}</div>`;
      })
      .join('');
    return { html: `<div class="mg mg-chat">${falas}</div>` };
  },
  alerta: (x, c) => {
    const t0 = c.t(x.titulo, 0.2, 0.2);
    return {
      html: `<div class="mg mg-esq mg-card mg-alerta" data-in="sobe" data-t="0.05"><div class="alerta-topo">${icone('alerta', 0.15, 0.5, 'ic alerta-ic')}<span class="mg-k">${esc(x.kicker ?? 'Atenção')}</span></div><div class="mg-t t-m" style="${c.corpo('t-m', x.titulo ?? '')}" data-in="sobe" data-t="${t0}">${c.marcar(x.titulo ?? '', x.enfase, t0)}</div>${detalhe(x.detalhe, c.t(x.detalhe, t0 + 0.5))}</div>`,
      script: `tl.fromTo('.alerta-ic', { rotation: 0 }, { rotation: 12, duration: 0.06, yoyo: true, repeat: 5, ease: 'none', transformOrigin: '50% 90%' }, 0.7);`,
    };
  },
  preco: (x, c) => {
    const ta = x.antes ? c.t(x.antes, 0.15, 0.1) : 0.1;
    const tn = c.t(x.numero, ta + 0.5, 0.6);
    return {
      html: `<div class="mg mg-esq${c.sobre ? ' mg-card' : ''} mg-preco">${kicker(x.kicker, 0.05)}<div class="mg-t t-s" style="${c.corpo('t-s', x.titulo ?? '')}" data-in="sobe" data-t="0.1">${esc(x.titulo ?? '')}</div>${x.antes ? `<div class="preco-antes" data-in="aparece" data-t="${ta}"><span>${esc(x.antes)}</span><i class="ad-risco" data-in="enche" data-t="${r2(tn - 0.3)}" data-d="0.3"></i></div>` : ''}<div class="mg-num preco-v" style="${corpoDoNumero(c, x)}" data-in="bate" data-t="${tn}">${x.prefixo ? `<span class="pre">${esc(x.prefixo)}</span>` : ''}${numero(x.numero, tn, 0.9)}${x.unidade ? `<span class="suf">${esc(x.unidade)}</span>` : ''}</div></div>`,
    };
  },
  ranking: (x, c) => {
    const itens = (x.itens ?? []).slice(0, 5);
    // Contagem regressiva: do último ao primeiro (o 1º é o ponto alto).
    let t = x.titulo ? 0.4 : 0.15;
    const ordem = itens.map((_, i) => itens.length - 1 - i);
    const tempos: number[] = new Array(itens.length).fill(0);
    for (const i of ordem) {
      t = c.t(itens[i], t, 0.5);
      tempos[i] = t;
      t += 0.3;
    }
    const linhasHtml = itens.map((it, i) => `<li class="${i === 0 ? 'topo' : ''}" data-in="${i === 0 ? 'bate' : 'dir'}" data-t="${tempos[i]}"><b>${i + 1}º</b>${(x.icones?.[i] ?? iconeDoTexto(it)) ? icone(x.icones?.[i] ?? iconeDoTexto(it), tempos[i]! + 0.1, 0.4, 'ic rk-ic') : ''}<span>${esc(it)}</span></li>`).join('');
    return { html: `<div class="mg mg-esq${c.sobre ? ' mg-card' : ''}">${x.titulo ? `<div class="mg-t t-s" style="${c.corpo('t-s', x.titulo)}" data-in="sobe" data-t="0.05">${esc(x.titulo)}</div>` : ''}<ol class="mg-rank">${linhasHtml}</ol></div>` };
  },
  rotulo: (x, c) => {
    const t0 = 0.1;
    return {
      html: `<div class="mg mg-rotulo"><div class="rot-caixa mg-card" data-in="esq" data-t="${t0}"><i class="rot-barra" data-in="cresce" data-t="${t0}" data-d="0.35"></i><div><div class="mg-t t-s" style="${c.corpo('t-s', x.titulo ?? '')}" data-in="mascara-solo" data-t="${r2(t0 + 0.15)}">${esc(x.titulo ?? '')}</div>${x.kicker ? `<div class="rot-k" data-in="sobe" data-t="${r2(t0 + 0.35)}">${esc(x.kicker)}</div>` : ''}</div></div></div>`,
    };
  },
  titulo: (x, c) => {
    // O menor número de linhas com a letra grande, acima da cabeça; cada linha entra na sua vez.
    const b = blocoAcimaDaCabeca(x.titulo ?? '', c.v, c.p, { fonteMax: 230, alvo: 130, maxLinhas: 4, acima: x.kicker ? 64 : 0, altura: 0.98 });
    const html = b.linhas
      .map((l, i) => {
        const t = r2(0.15 + i * 0.16);
        return `<span class="mg-m"><span class="mg-t t-xl mg-l" style="font-size:${b.fonte}px" data-in="mascara" data-t="${t}">${c.marcar(l, x.enfase, t + 0.1)}</span></span>`;
      })
      .join('');
    const topo = b.topo - (x.kicker ? 64 : 0);
    return { html: `<div class="mg mg-centro mg-solto mg-titulo" style="top:${topo}px;height:${b.base - topo}px">${kicker(x.kicker, 0.05)}<div class="mg-linhas">${html}</div></div>` };
  },
  chamada: (x, c) => {
    const t0 = 0.15;
    return {
      html: `<div class="mg mg-centro mg-solto mg-chamada">${kicker(x.kicker, t0 - 0.1)}<div class="mg-t t-l" style="${cabe(x.titulo ?? '', 11, 30, c.v)}" data-in="bate" data-t="${t0}">${c.marcar(x.titulo ?? '', x.enfase, t0 + 0.25)}</div><svg class="cta-seta" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" data-in="desenha" data-t="${r2(t0 + 0.35)}" data-d="0.4" d="M12 3v16m-6-6 6 6 6-6"/></svg></div>`,
      script: `tl.to('.cta-seta', { y: 16, duration: 0.32, yoyo: true, repeat: 5, ease: 'sine.inOut' }, ${r2(t0 + 0.8)});`,
    };
  },
  objeto: (x, c) => {
    const ti = c.t(x.titulo, 0.6, 0.5);
    return {
      html: `<div class="mg mg-icone${c.sobre ? ' mg-card' : ''}"><div class="obj-roda" data-in="escala" data-t="0.05">${c.asset(x.objeto ?? 'foguete', 0.1, 'ast obj-grande')}</div><div class="ico-txt"><div class="mg-t t-m" style="${c.corpo('t-m', x.titulo ?? '', c.alto ? 1 : 0.5)}" data-in="sobe" data-t="${ti}">${c.marcar(x.titulo ?? '', x.enfase, ti)}</div>${detalhe(x.detalhe, c.t(x.detalhe, ti + 0.5))}</div></div>`,
    };
  },
  anotacao: (x, c) => {
    const t0 = c.t(x.titulo, 0.15, 0.1);
    return {
      html: `<div class="mg mg-solto mg-anot"><div class="mg-t t-m" style="${c.corpo('t-m', x.titulo ?? '', 0.7)}" data-in="sobe" data-t="${t0}">${c.marcar(x.titulo ?? '', x.enfase, t0)}</div><div class="anot-ast">${c.asset(x.rabisco ?? 'seta_curva', t0 + 0.25, 'ast')}</div></div>`,
    };
  },
  icone: (x, c) => {
    const ti = c.t(x.titulo, 0.15, 0.1);
    return {
      html: `<div class="mg mg-icone${c.sobre ? ' mg-card' : ''}"><div class="ico-roda" data-in="escala" data-t="0.05"><svg class="ico-anel" viewBox="0 0 100 100" aria-hidden="true"><circle pathLength="1" cx="50" cy="50" r="46" data-in="desenha" data-t="0.05" data-d="0.7"/></svg>${x.objeto ? c.asset(x.objeto, 0.2, 'ast ico-grande') : icone(x.icone, 0.2, 0.9, 'ic ico-grande')}</div><div class="ico-txt"><div class="mg-t t-m" style="${c.corpo('t-m', x.titulo ?? '', c.alto ? 1 : 0.5)}" data-in="sobe" data-t="${ti}">${c.marcar(x.titulo ?? '', x.enfase, ti)}</div>${detalhe(x.detalhe, c.t(x.detalhe, ti + 0.5))}</div></div>`,
    };
  },

  // ---------- Em volta da pessoa (o quadro inteiro, px de 1080x1920) ----------
  // Fora das áreas do app (até y 192 e depois de 1600) e da faixa da legenda (1200-1440).

  cartaz: (x, c) => {
    const t0 = c.t(x.titulo, 0.1, 0.15);
    // Acima da cabeça: o menor número de linhas com a letra enorme; o pé do bloco no topo do cabelo.
    const b = blocoAcimaDaCabeca(x.titulo ?? '', c.v, c.p, { caixa: true, fonteMax: 420, alvo: 190, maxLinhas: 3, altura: 0.86 });
    const topo = b.topo;
    const bloco = b.base - b.topo;
    const linhasHtml = b.linhas
      .map((l, i) => `<span class="cz-m"><span class="cz-l" style="font-size:${b.fonte}px" data-in="mascara" data-t="${r2(t0 + i * 0.14)}">${esc(l)}</span></span>`)
      .join('');
    const tk = r2(t0 + 0.35);
    const td = c.t(x.detalhe, t0 + 0.6, 0.6);
    const etiqueta = (texto: string, classe: string, t: number) => `<div class="q-pilula cz-tag ${classe}" style="top:${classe === 'cz-a' ? Math.max(200, topo - 30) : topo + Math.round(bloco * 0.55)}px;font-size:${corpoPx(texto, 520, 56, c.v, 1, true)}px" data-in="balao" data-t="${t}">${esc(texto)}</div>`;
    return {
      html: `<div class="mg mg-quadro"><div class="cz" style="top:${topo}px;height:${bloco}px">${linhasHtml}</div>${x.kicker ? etiqueta(x.kicker, 'cz-a', tk) : ''}${x.detalhe ? etiqueta(x.detalhe, 'cz-b', td) : ''}</div>`,
      css: `.cz { left: 40px; right: 40px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; filter: drop-shadow(0 10px 30px rgba(0,0,0,.35)); }
.cz-m { display: block; overflow: hidden; padding: .02em .08em .05em; margin-bottom: -.1em; }
.cz-l { display: block; font-family: var(--fonte-titulo); text-transform: uppercase; line-height: .86; letter-spacing: -.015em; white-space: nowrap; background: linear-gradient(180deg, var(--solto) 38%, color-mix(in srgb, var(--cor-destaque) 70%, var(--solto)) 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.cz-tag { z-index: 3; } .cz-a { left: 64px; rotate: -6deg; } .cz-b { right: 64px; rotate: -4deg; }`,
    };
  },

  numero_gigante: (x, c) => {
    const tn = c.t(x.numero, 0.2, 0.2);
    const n = [...(x.numero ?? '')].length + ([...(x.prefixo ?? '')].length + [...(x.unidade ?? '')].length) * 0.42;
    // Acima da cabeça: o pé do número no topo do cabelo, do tamanho que o espaço livre deixa.
    const base = c.p ? Math.max(560, Math.min(1000, c.p.cabeca.topo + Math.round((c.p.cabeca.base - c.p.cabeca.topo) * 0.12))) : 760;
    const corpo = Math.round(Math.min(600, 920 / (Math.max(1.5, n) * Math.max(0.45, c.v.largura)), (base - 250) / 0.84));
    // Os medidores (como de áudio) nas laterais: o nível pula no ritmo, sem sorteio.
    const passo = 0.14;
    const inicio = r2(tn + 0.1);
    const nPassos = Math.max(0, Math.floor((c.D - 0.5 - inicio) / passo));
    const topoDoNumero = Math.max(250, Math.round(base - corpo * 0.84));
    return {
      html: `<div class="mg mg-quadro">${x.kicker ? `<div class="ng-k" style="top:${topoDoNumero - 36}px" data-in="sobe" data-t="${r2(Math.max(0, tn - 0.3))}">${esc(x.kicker)}</div>` : ''}<div class="mg-num ng-num" style="top:${topoDoNumero}px;font-size:${corpo}px" data-in="escala" data-t="${tn}">${x.prefixo ? `<span class="pre">${esc(x.prefixo)}</span>` : ''}${numero(x.numero, tn, 1.2)}${x.unidade ? `<span class="suf">${esc(x.unidade)}</span>` : ''}</div><div class="ng-mt ng-mt0" data-in="aparece" data-t="${inicio}"><i></i></div><div class="ng-mt ng-mt1" data-in="aparece" data-t="${inicio}"><i></i></div></div>`,
      css: `.ng-k { left: 0; right: 0; text-align: center; font-size: 40px; letter-spacing: .2em; text-transform: uppercase; color: var(--solto); text-shadow: 0 3px 14px rgba(0,0,0,.5); }
.ng-num { left: 0; right: 0; justify-content: center; line-height: .84; font-family: var(--fonte-titulo); filter: drop-shadow(0 10px 34px rgba(0,0,0,.35)); }
.ng-num .v, .ng-num .pre, .ng-num .suf { background: linear-gradient(180deg, var(--solto) 25%, color-mix(in srgb, var(--cor-destaque) 75%, transparent) 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.ng-mt { top: 560px; width: 46px; height: 600px; border-radius: 6px; background: color-mix(in srgb, var(--solto) 18%, transparent); -webkit-mask: repeating-linear-gradient(to top, #000 0 20px, transparent 20px 30px); mask: repeating-linear-gradient(to top, #000 0 20px, transparent 20px 30px); }
.ng-mt0 { left: 40px; } .ng-mt1 { right: 40px; }
.ng-mt i { position: absolute; inset: 0; background: linear-gradient(to top, var(--cor-destaque), var(--cor-destaque-2)); transform-origin: 50% 100%; transform: scaleY(.2); }`,
      script: `q('.ng-mt i').forEach(function (el, m) { for (var k = 0; k < ${nPassos}; k++) tl.to(el, { scaleY: 0.16 + 0.8 * Math.abs(Math.sin(k * 1.37 + m * 2.1) * Math.sin(k * 0.71 + m)), duration: ${passo}, ease: 'power1.out' }, ${inicio} + k * ${passo}); });`,
    };
  },

  placar: (x, c) => {
    const va = lerNumero(x.valores?.[0])?.valor ?? 0;
    const vb = lerNumero(x.valores?.[1])?.valor ?? 0;
    const teto = /%/.test(x.unidade ?? '') && Math.max(va, vb) <= 100 ? 100 : Math.max(1, va, vb);
    const altura = (v: number) => Math.max(5, Math.min(100, (v / teto) * 100));
    const ta = c.t(x.a ?? x.valores?.[0], 0.35, 0.2);
    const tb = c.t(x.b ?? x.valores?.[1], ta + 0.7, 0.9);
    // O tubo: de y 320 a 1066 (746 px), 8 px de folga dentro.
    const TOPO = 320;
    const TUBO = 746;
    const lado = (i: 'a' | 'b', nome: string, valor: string | undefined, v: number, t: number, ganha: boolean) => {
      const h = altura(v);
      return `<div class="pl-col pl-${i}${ganha ? ' topo' : ''}"><div class="pl-tubo mg-card" data-in="aparece" data-t="${r2(Math.max(0, t - 0.25))}"><i class="pl-enche" style="height:calc(${(h / 100).toFixed(3)} * (100% - 16px))" data-in="cresce" data-t="${t}" data-d="1.1"></i><div class="pl-v mg-num" style="bottom:calc(${(h / 100).toFixed(3)} * (100% - 16px) + 22px)" data-in="balao" data-t="${r2(t + 0.75)}">${numero(valor, t, 1.1)}${x.unidade ? `<span class="suf">${esc(x.unidade)}</span>` : ''}</div></div><div class="pl-nome mg-card" style="font-size:${corpoPx(nome, 136, 44, c.v, 2)}px" data-in="sobe" data-t="${t}">${esc(nome)}</div></div>`;
    };
    const menor = Math.min(altura(va), altura(vb));
    const yTracejado = Math.round(TOPO + TUBO - 8 - ((TUBO - 16) * menor) / 100);
    const cab = x.kicker || x.titulo ? `<div class="pl-cab" data-in="sobe" data-t="0.05"><b>●</b> ${x.kicker ? `<strong>${esc(x.kicker)}</strong>` : ''}${x.kicker && x.titulo ? ' · ' : ''}${x.titulo ? esc(x.titulo) : ''}</div>` : '';
    return {
      html: `<div class="mg mg-quadro">${cab}<i class="pl-grade" data-in="aparece" data-t="0.1"></i>${lado('a', x.a ?? '', x.valores?.[0], va, ta, va > vb)}${lado('b', x.b ?? '', x.valores?.[1], vb, tb, vb >= va)}<i class="pl-tracejado" style="top:${yTracejado}px" data-in="enche" data-t="${r2(Math.max(ta, tb) + 1)}" data-d="0.6"></i></div>`,
      css: `.pl-cab { left: 40px; right: 40px; top: 210px; text-align: center; font-size: 36px; letter-spacing: .12em; text-transform: uppercase; color: var(--solto); text-shadow: 0 3px 14px rgba(0,0,0,.55); white-space: nowrap; overflow: hidden; }
.pl-cab b { color: var(--cor-destaque); } .pl-cab strong { font-family: var(--fonte-titulo); }
.pl-grade { left: 0; right: 0; top: ${TOPO}px; height: ${TUBO}px; background: repeating-linear-gradient(to bottom, color-mix(in srgb, var(--solto) 22%, transparent) 0 2px, transparent 2px ${TUBO / 5}px); }
.pl-col { top: ${TOPO}px; width: 172px; height: 870px; display: flex; flex-direction: column; gap: 14px; }
.pl-a { left: 34px; } .pl-b { right: 34px; }
.mg-quadro .pl-tubo { position: relative; height: ${TUBO}px; flex: none; padding: 0; border-radius: 24px; }
.pl-enche { position: absolute; left: 8px; right: 8px; bottom: 8px; border-radius: 17px; background: color-mix(in srgb, var(--cor-texto) 26%, transparent); transform-origin: 50% 100%; }
.topo .pl-enche { background: linear-gradient(to top, color-mix(in srgb, var(--cor-destaque) 55%, transparent), var(--cor-destaque)); box-shadow: 0 0 44px color-mix(in srgb, var(--cor-destaque) 55%, transparent); }
.pl-v { position: absolute; left: -10px; right: -10px; justify-content: center; font-size: 72px; color: var(--cor-texto); background: color-mix(in srgb, var(--cor-fundo) 82%, transparent); border-radius: 20px; padding: 10px 0 6px; box-shadow: 0 12px 30px rgba(0,0,0,.35); }
.topo .pl-v { color: var(--cor-destaque); }
.mg-quadro .pl-nome { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; padding: 8px 10px; font-family: var(--fonte-titulo); line-height: 1.02; }
.topo .pl-nome { box-shadow: 0 0 0 3px var(--cor-destaque), 0 20px 50px rgba(0,0,0,.35); }
.pl-tracejado { left: 214px; right: 214px; height: 0; border-top: 4px dashed color-mix(in srgb, var(--solto) 70%, transparent); transform-origin: 0 50%; }`,
    };
  },

  mosaico: (x, c) => {
    const itens = (x.itens ?? []).slice(0, 4);
    const padrao = ['grafico', 'lampada', 'alvo', 'foguete'];
    // Na altura do rosto, uma coluna de cada lado; menores quando a cabeça ocupa o quadro.
    const y0 = c.p ? entre(c.p.cabeca.topo + 10, 390, 700) : 400;
    const escala = escalaAoLado(c.p, 320);
    const lugares = [
      [40, y0],
      [740, y0],
      [40, y0 + Math.round(240 * escala)],
      [740, y0 + Math.round(240 * escala)],
    ] as const;
    let t = x.titulo ? 0.45 : 0.15;
    const usados = new Set<string>();
    const cards = itens
      .map((it, i) => {
        t = c.t(it, i === 0 ? t : t + 0.3, i === 0 ? 0.1 : 0.45);
        const [l, tp] = lugares[i]!;
        // O item que tem objeto animado (gráfico, mapa, foto...) mostra o objeto se mexendo; o resto, o ícone.
        const obj = x.icones?.[i] ? undefined : objetoDoTexto(it, usados);
        if (obj) usados.add(obj);
        const figura = obj ? c.asset(obj, t + 0.15, 'ast mo-ast') : icone(x.icones?.[i] ?? iconeDoTexto(it) ?? padrao[i], t + 0.15, 0.6, 'ic mo-ic');
        return `<div class="mo-card mg-card" style="left:${l}px;top:${tp}px;scale:${escala};transform-origin:${i % 2 ? '100%' : '0'} 0" data-in="balao" data-t="${t}">${figura}<div class="mo-r" style="font-size:${corpoPx(it, 250, 46, c.v, 2, true)}px">${esc(it)}</div></div>`;
      })
      .join('');
    const tt = 0.1;
    const titulo = x.titulo ? `<div class="mo-tit mg-card" data-in="desce" data-t="${tt}"><div class="mg-t" style="font-size:${corpoPx(x.titulo, 880, 104, c.v, 1)}px">${c.marcar(x.titulo, x.enfase, tt + 0.3)}</div></div>` : '';
    return {
      html: `<div class="mg mg-quadro">${titulo}${cards}</div>`,
      css: `.mg-quadro .mo-tit { left: 60px; right: 60px; top: 218px; height: 150px; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 24px; }
.mo-tit .mg-t { white-space: nowrap; }
.mg-quadro .mo-card { width: 300px; height: 210px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 16px; }
.mo-ic { width: 96px; color: var(--cor-destaque); } .mo-ic.icd { color: var(--cor-texto); }
.mo-ast { width: 150px; height: 112px; color: var(--cor-texto); }
.mo-r { font-family: var(--fonte-titulo); text-transform: uppercase; text-align: center; line-height: 1; letter-spacing: .01em; }`,
      script: `q('.mo-card').forEach(function (el, i) { tl.to(el, { y: i % 2 ? 9 : -9, duration: 1.5, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 1.4 + i * 0.2); });`,
    };
  },

  ladeando: (x, c) => {
    const ta = c.t(x.a ?? '', 0.2, 0.15);
    const tb = c.t(x.b ?? '', ta + 0.35, 0.5);
    // Ao lado do rosto: na altura dele, do tamanho que o espaço livre deixa.
    const topo = c.p ? entre((c.p.cabeca.topo + c.p.cabeca.base) / 2 - 130, 230, 900) : 400;
    const escala = escalaAoLado(c.p, 250);
    const lado = (classe: string, nome: string | undefined, rotulo: string | undefined, t: number) =>
      `<div class="ld ${classe}" style="top:${topo}px;scale:${escala}" data-in="balao" data-t="${t}"><div class="ld-tile mg-card">${icone(nome, t + 0.1, 0.6, 'ic ld-ic')}</div>${rotulo ? `<div class="ld-r" style="font-size:${corpoPx(rotulo, 230, 46, c.v, 2)}px">${esc(rotulo)}</div>` : ''}</div>`;
    return {
      html: `<div class="mg mg-quadro">${x.kicker ? `<div class="ld-k" data-in="sobe" data-t="0.05">${esc(x.kicker)}</div>` : ''}${lado('ld-a', x.icones?.[0], x.a, ta)}${lado('ld-b', x.icones?.[1], x.b, tb)}</div>`,
      css: `.ld-k { left: 40px; right: 40px; top: 214px; text-align: center; font-size: 40px; letter-spacing: .16em; text-transform: uppercase; color: var(--solto); text-shadow: 0 3px 14px rgba(0,0,0,.55); }
.ld { width: 240px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.ld-a { left: 44px; rotate: -8deg; transform-origin: 0 0; } .ld-b { right: 44px; rotate: 8deg; transform-origin: 100% 0; }
.mg-quadro .ld-tile { width: 196px; height: 196px; padding: 0; display: grid; place-items: center; border-radius: 30%; }
.ld-ic { width: 60%; color: var(--cor-destaque); } .ld-ic.icd { color: var(--cor-texto); }
.ld-r { font-family: var(--fonte-titulo); color: var(--solto); text-align: center; line-height: 1.05; text-shadow: 0 3px 14px rgba(0,0,0,.55); }`,
      script: `q('.ld').forEach(function (el, i) { tl.to(el, { y: i ? 12 : -12, duration: 1.4, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 1 + i * 0.3); });`,
    };
  },

  selecao: (x, c) => {
    // Em volta da pessoa: da borda do corpo, de cima do cabelo até a faixa da legenda.
    const cx0 = c.p ? entre(c.p.corpo.esq - 40, 40, 300) : 90;
    const cx1 = c.p ? entre(c.p.corpo.dir + 40, 780, 1040) : 990;
    const cy0 = c.p ? entre(c.p.cabeca.topo - 70, 270, 700) : 330;
    const caixa = { x: cx0, y: cy0, w: cx1 - cx0, h: 1180 - cy0 };
    const t0 = 0.1;
    const tt = c.t(x.titulo, t0 + 0.35, 0.35);
    const alcas = [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [0, 0.5],
      [1, 0.5],
      [0, 1],
      [0.5, 1],
      [1, 1],
    ]
      .map(([a, b], i) => `<i class="sl-h" style="left:${caixa.x + a! * caixa.w - 12}px;top:${caixa.y + b! * caixa.h - 12}px" data-in="balao" data-t="${r2(t0 + 0.55 + i * 0.04)}"></i>`)
      .join('');
    return {
      html: `<div class="mg mg-quadro"><svg class="sl-caixa" viewBox="0 0 1080 1920" aria-hidden="true" data-in="mascara-solo" data-t="${t0}"><rect x="${caixa.x}" y="${caixa.y}" width="${caixa.w}" height="${caixa.h}"/></svg>${alcas}<div class="q-pilula sl-tag" style="font-size:${corpoPx(x.titulo ?? '', 700, 46, c.v)}px" data-in="balao" data-t="${tt}">${esc(x.titulo ?? '')}</div></div>`,
      css: `.sl-caixa { left: 0; top: 0; width: 1080px; height: 1920px; overflow: visible; }
.sl-caixa rect { fill: none; stroke: color-mix(in srgb, var(--cor-destaque) 55%, var(--solto)); stroke-width: 4; stroke-dasharray: 18 12; filter: drop-shadow(0 0 6px rgba(0,0,0,.4)); }
.sl-h { width: 24px; height: 24px; background: #ffffff; border: 3px solid #1d1d22; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
.sl-tag { left: ${caixa.x}px; top: ${caixa.y - 74}px; text-transform: none; font-family: var(--fonte-texto); font-weight: 700; }`,
    };
  },

  hud: (x, c) => {
    // O ponto de fuga logo abaixo do rosto de quem fala.
    const vp = (c.p ? [entre(c.p.cabeca.x, 300, 780), entre(c.p.cabeca.base + 140, 700, 1150)] : [540, 1090]) as readonly [number, number];
    const nos = [
      [95, 265],
      [985, 265],
      [95, 515],
      [985, 515],
      [95, 765],
      [985, 765],
    ] as const;
    const t0 = 0.1;
    let k = 0;
    const desenha = (d: string, dur = 0.5) => `<path pathLength="1" d="${d}" data-in="desenha" data-t="${r2(t0 + k++ * 0.06)}" data-d="${dur}"/>`;
    const moldura = [desenha('M95 225V1160', 0.8), desenha('M985 225V1160', 0.8), ...[265, 515, 765].map((y) => desenha(`M95 ${y}H985`, 0.6))].join('');
    const raios = [...nos, [0, 200] as const, [1080, 200] as const].map(([px, py]) => desenha(`M${px} ${py}L${vp[0]} ${vp[1]}`, 0.7)).join('');
    const cantos = (
      [
        [150, 300, 150],
        [800, 560, 140],
        [160, 820, 130],
        [790, 300, 120],
      ] as const
    )
      .map(([bx, by, s]) => desenha(`M${bx} ${by + 30}V${by}H${bx + 30}M${bx + s - 30} ${by}H${bx + s}V${by + 30}M${bx + s} ${by + s - 30}V${by + s}H${bx + s - 30}M${bx + 30} ${by + s}H${bx}V${by + s - 30}`, 0.4))
      .join('');
    const tn = r2(t0 + k * 0.06);
    const pontos = nos.map(([px, py], i) => `<circle class="hud-no" cx="${px}" cy="${py}" r="11" data-in="escala" data-t="${r2(tn + i * 0.05)}"/>`).join('');
    const tt = c.t(x.titulo, 0.5, 0.5);
    return {
      html: `<div class="mg mg-quadro"><svg class="hud" viewBox="0 0 1080 1920" aria-hidden="true">${moldura}${raios}${cantos}<path class="hud-horizonte" d="M0 ${vp[1]}H1080" data-in="aparece" data-t="${tn}"/>${pontos}<circle class="hud-vp" cx="${vp[0]}" cy="${vp[1]}" r="14" data-in="escala" data-t="${tn}"/></svg><div class="hud-w"><span class="hud-t" style="font-size:${corpoPx(x.titulo ?? '', 900, 118, c.v, 1, true)}px" data-in="mascara-solo" data-t="${tt}">${esc(x.titulo ?? '')}</span></div></div>`,
      css: `.hud { left: 0; top: 0; width: 1080px; height: 1920px; overflow: visible; filter: drop-shadow(0 0 8px color-mix(in srgb, var(--cor-destaque) 55%, transparent)); }
.hud path { fill: none; stroke: var(--cor-destaque); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
.hud .hud-horizonte { stroke-dasharray: 14 12; stroke-dashoffset: 0; stroke-width: 2.5; opacity: .8; }
.hud-no { fill: var(--cor-fundo); stroke: var(--cor-destaque); stroke-width: 4; transform-box: fill-box; transform-origin: center; }
.hud-vp { fill: var(--cor-destaque); transform-box: fill-box; transform-origin: center; }
.hud-w { left: 0; right: 0; top: 196px; text-align: center; transform: perspective(700px) rotateX(24deg); filter: drop-shadow(0 6px 22px rgba(0,0,0,.45)); }
.hud-t { display: inline-block; padding: 0 .1em; font-family: var(--fonte-titulo); text-transform: uppercase; line-height: 1.04; letter-spacing: .02em; white-space: nowrap; background: linear-gradient(180deg, var(--solto) 30%, var(--cor-destaque)); -webkit-background-clip: text; background-clip: text; color: transparent; }`,
      script: `tl.to('.hud-vp', { scale: 1.7, duration: 0.5, yoyo: true, repeat: 5, ease: 'sine.inOut' }, ${r2(tn + 0.4)});`,
    };
  },

  profundidade: (x, c) => {
    const tt = c.t(x.titulo, 0.15, 0.15);
    const texto = x.titulo ?? '';
    const letras = [...texto].map((ch, i) => (ch === ' ' ? ' ' : `<span class="pf-c" data-in="sobe" data-t="${r2(tt + i * 0.035)}">${esc(ch)}</span>`)).join('');
    const camadas = Array.from({ length: 16 }, (_, i) => `0 ${i + 1}px 0 var(--pf-lado)`).join(', ');
    // No peito: logo abaixo dos ombros, acima da faixa da legenda.
    const topo = c.p ? entre(c.p.ombros + 50, 720, 950) : 950;
    return {
      html: `<div class="mg mg-quadro">${x.kicker ? `<div class="q-pilula pf-k" style="top:${topo - 70}px" data-in="balao" data-t="${r2(Math.max(0, tt - 0.25))}">${esc(x.kicker)}</div>` : ''}<div class="pf" style="top:${topo}px"><div class="pf-w" style="font-size:${corpoPx(texto, 920, 230, c.v, 1, true)}px">${letras}</div></div></div>`,
      css: `.pf { left: 0; right: 0; height: 240px; display: flex; justify-content: center; align-items: center; transform: perspective(900px) rotateX(22deg); }
.pf-w { --pf-lado: color-mix(in srgb, var(--cor-destaque) 62%, #000000); font-family: var(--fonte-titulo); text-transform: uppercase; color: var(--solto); line-height: 1; white-space: nowrap; text-shadow: ${camadas}, 0 26px 36px rgba(0,0,0,.55); }
.pf-c { display: inline-block; white-space: pre; }
.pf-k { left: 0; right: 0; margin: 0 auto; width: fit-content; font-size: 34px; }`,
    };
  },

  janela: (x, c) => {
    const itens = (x.itens ?? []).slice(0, 3);
    const padrao = ['mensagem', 'raio', 'check'];
    const tt = c.t(x.titulo, 0.45, 0.35);
    let t = tt;
    const passos = itens
      .map((it, i) => {
        t = c.t(it, t + 0.4, 0.55);
        return `${i ? `<span class="jn-seta" data-in="aparece" data-t="${r2(t - 0.12)}">→</span>` : ''}<div class="jn-passo" data-in="sobe" data-t="${t}"><div class="jn-ic">${icone(x.icones?.[i] ?? iconeDoTexto(it) ?? padrao[i], t + 0.1, 0.5, 'ic jn-i')}</div><b style="font-size:${corpoPx(it, 200, 30, c.v, 2)}px">${esc(it)}</b></div>`;
      })
      .join('');
    return {
      html: `<div class="mg mg-quadro"><div class="jn mg-card"><div class="jn-barra"><svg class="jn-play" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12"/><path d="M9.5 7.5v9l7-4.5z"/></svg><b>${esc(x.kicker ?? '')}</b>${x.enfase ? `<span class="jn-selo">${esc(x.enfase)}</span>` : ''}</div><div class="jn-corpo"><div class="mg-t jn-tit" style="font-size:${corpoPx(x.titulo ?? '', 860, 70, c.v, 2)}px" data-in="mascara-solo" data-t="${tt}">${esc(x.titulo ?? '')}</div>${passos ? `<div class="jn-passos">${passos}</div>` : ''}</div><div class="jn-prog"><i data-in="enche" data-t="0.4" data-d="${r2(Math.max(0.6, c.D - 1))}"></i></div></div></div>`,
      css: `.mg-quadro .jn { left: 70px; top: 226px; width: 940px; height: 440px; padding: 0; overflow: hidden; display: flex; flex-direction: column; }
.jn-barra { display: flex; align-items: center; gap: 14px; padding: 18px 26px; font-size: 30px; border-bottom: 2px solid color-mix(in srgb, var(--cor-texto) 10%, transparent); white-space: nowrap; }
.jn-play { width: 40px; flex: none; } .jn-play circle { fill: var(--cor-destaque); } .jn-play path { fill: var(--cor-fundo); }
.jn-selo { margin-left: auto; font-size: 22px; letter-spacing: .14em; padding: 7px 16px; border-radius: 99px; background: var(--cor-destaque); color: var(--cor-fundo); text-transform: uppercase; font-weight: 700; }
.jn-corpo { flex: 1; padding: 22px 30px 10px; display: flex; flex-direction: column; justify-content: center; gap: 24px; min-height: 0; }
.jn-tit { line-height: 1.05; }
.jn-passos { display: flex; align-items: center; gap: 10px; }
.jn-passo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 18px; background: color-mix(in srgb, var(--cor-texto) 7%, transparent); }
.jn-passo b { font-family: var(--fonte-titulo); line-height: 1.1; }
.jn-ic { width: 62px; height: 62px; border-radius: 16px; background: var(--cor-destaque); display: grid; place-items: center; color: var(--cor-fundo); }
.jn-i { width: 60%; } .jn-i.icd { color: var(--cor-fundo); } .jn-i.icd .icd-f { fill: var(--cor-fundo); opacity: .35; }
.jn-seta { flex: none; font-size: 34px; color: var(--cor-apagado); }
.jn-prog { height: 8px; margin: 0 30px 22px; border-radius: 99px; background: color-mix(in srgb, var(--cor-texto) 12%, transparent); overflow: hidden; }
.jn-prog i { display: block; height: 100%; background: var(--cor-destaque); transform-origin: 0 50%; }`,
      script: `tl.fromTo('.jn', { rotationY: -36, rotationX: 14, scale: 0.8, autoAlpha: 0, transformPerspective: 1400 }, { rotationY: -11, rotationX: 7, scale: 1, autoAlpha: 1, duration: 0.8, ease: M.e }, 0.05);
tl.to('.jn', { rotationY: -5, rotationX: 4, duration: ${r2(Math.max(1, c.D - 1.2))}, ease: 'sine.inOut' }, 0.85);`,
    };
  },

  linha_do_tempo: (x, c) => {
    const itens = (x.itens ?? []).slice(0, 7);
    const total = itens.reduce((s, it) => s + Math.max(5, [...it].length), 0);
    const cores = ['var(--cor-destaque)', 'var(--cor-destaque-2)', 'var(--cor-destaque-3)'];
    let t = 0.35;
    const clipes = itens
      .map((it, i) => {
        t = c.t(it, i === 0 ? t : t + 0.22, i === 0 ? 0.1 : 0.35);
        const w = (Math.max(5, [...it].length) / total) * 100;
        return `<div class="tl-clip" style="flex:0 0 calc(${w.toFixed(2)}% - 6px);background:${cores[i % 3]}" data-in="escala" data-t="${t}"><span>${esc(it)}</span></div>`;
      })
      .join('');
    // A onda do áudio: barras com alturas de uma soma de senos (igual em todo quadro).
    const onda = Array.from({ length: 90 }, (_, i) => {
      const h = 8 + 40 * Math.abs(Math.sin(i * 0.53) * Math.cos(i * 0.21) + 0.3 * Math.sin(i * 1.7));
      return `<rect x="${i * 10}" y="${(56 - Math.min(52, h)) / 2}" width="5" height="${Math.min(52, h).toFixed(1)}" rx="2"/>`;
    }).join('');
    const D = c.D;
    return {
      html: `<div class="mg mg-quadro"><div class="tlp mg-card" data-in="sobe" data-t="0.05"><div class="tl-cab"><b>${esc(x.titulo ?? 'Timeline')}</b><span class="tl-reg"></span></div><div class="tl-faixas"><div class="tl-f" data-in="esq" data-t="0.2"><em>FX</em><div class="tl-clipes">${clipes}</div></div><div class="tl-f" data-in="esq" data-t="0.28"><em>V1</em><div class="tl-filme"></div></div><div class="tl-f tl-fina" data-in="esq" data-t="0.36"><em>LEG</em><div class="tl-leg"></div></div><div class="tl-f" data-in="esq" data-t="0.44"><em>A1</em><svg class="tl-onda" viewBox="0 0 900 56" preserveAspectRatio="none" aria-hidden="true">${onda}</svg></div><div class="tl-cursor"><span class="q-pilula tl-aqui">${esc(x.kicker ?? 'você está aqui')}</span></div></div></div></div>`,
      css: `.mg-quadro .tlp { left: 30px; right: 30px; top: 846px; height: 334px; padding: 18px 22px; display: flex; flex-direction: column; gap: 10px; }
.tl-cab { display: flex; align-items: center; gap: 16px; font-size: 30px; font-family: var(--fonte-titulo); }
.tl-reg { flex: 1; height: 18px; background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--cor-texto) 35%, transparent) 0 2px, transparent 2px 24px); align-self: flex-end; }
.tl-faixas { position: relative; flex: 1; display: flex; flex-direction: column; gap: 8px; }
.tl-f { display: flex; align-items: center; gap: 12px; height: 56px; }
.tl-f.tl-fina { height: 24px; }
.tl-f em { width: 56px; flex: none; font-style: normal; font-size: 20px; letter-spacing: .08em; color: var(--cor-apagado); }
.tl-clipes { flex: 1; display: flex; gap: 6px; height: 100%; min-width: 0; }
.tl-clip { height: 100%; border-radius: 10px; display: flex; align-items: center; padding: 0 10px; overflow: hidden; color: var(--cor-fundo); font-family: var(--fonte-titulo); font-size: 22px; white-space: nowrap; transform-origin: 0 50%; box-shadow: inset 0 0 0 2px rgba(255,255,255,.18); }
.tl-clip span { overflow: hidden; text-overflow: ellipsis; }
.tl-filme { flex: 1; height: 100%; border-radius: 8px; background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--cor-texto) 30%, var(--cor-fundo)) 0 52px, color-mix(in srgb, var(--cor-texto) 14%, var(--cor-fundo)) 52px 56px); }
.tl-leg { flex: 1; height: 100%; background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--cor-texto) 55%, transparent) 0 3px, transparent 3px 7px, color-mix(in srgb, var(--cor-texto) 55%, transparent) 7px 9px, transparent 9px 16px); border-radius: 4px; }
.tl-onda { flex: 1; height: 100%; } .tl-onda rect { fill: var(--cor-destaque); opacity: .85; }
.tl-cursor { position: absolute; top: -8px; bottom: -6px; width: 4px; margin-left: 66px; background: var(--cor-texto); border-radius: 2px; box-shadow: 0 0 12px rgba(0,0,0,.4); }
.tl-aqui { position: absolute; bottom: 100%; left: 50%; translate: -50% -6px; font-size: 20px; padding: .4em .8em; }`,
      script: `tl.fromTo('.tl-cursor', { left: '2%' }, { left: '82%', duration: ${r2(Math.max(1, D - 0.9))}, ease: 'none' }, 0.5);`,
    };
  },

  comentario: (x, c) => {
    const palavra = x.titulo ?? '';
    const t0 = c.t(palavra, 0.6, 0.5);
    const fim = r2(t0 + [...palavra].length * 0.045);
    const letras = [...palavra].map((ch) => `<i class="c">${esc(ch)}</i>`).join('');
    return {
      html: `<div class="mg mg-quadro">${x.detalhe ? `<div class="cm-chamada" style="font-size:${corpoPx(x.detalhe, 900, 84, c.v, 1)}px" data-in="sobe" data-t="0.1">${c.marcar(x.detalhe, x.enfase ?? palavra, 0.45)}</div>` : ''}<div class="cm mg-card" data-in="sobe" data-t="0.2"><div class="cm-av">${icone('pessoa', 0.35, 0.5, 'ic cm-ic')}</div><div class="cm-campo"><span class="cm-ph">${esc(x.kicker ?? 'Adicione um comentário…')}</span><span class="cm-q" data-digita="1" data-t="${t0}">${letras}<span class="cursor"></span></span></div><div class="cm-env" data-in="bate" data-t="${r2(fim + 0.2)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></div></div><div class="cm-coracao" data-in="balao" data-t="${r2(fim + 0.55)}">${icone('coracao', fim + 0.55, 0.4, 'ic cm-cor')}</div></div>`,
      css: `.cm-chamada { left: 60px; right: 60px; top: 892px; text-align: center; font-family: var(--fonte-titulo); color: var(--solto); line-height: 1.05; text-shadow: 0 4px 22px rgba(0,0,0,.55); }
.mg-quadro .cm { left: 50px; right: 50px; top: 1040px; height: 124px; padding: 0 18px; border-radius: 999px; display: flex; align-items: center; gap: 22px; }
.cm-av { width: 88px; height: 88px; border-radius: 50%; flex: none; display: grid; place-items: center; background: linear-gradient(135deg, var(--cor-destaque), var(--cor-destaque-2)); color: var(--cor-fundo); }
.cm-ic { width: 56%; }
.cm-campo { position: relative; flex: 1; min-width: 0; height: 64px; display: flex; align-items: center; font-size: 42px; }
.cm-ph { position: absolute; left: 0; right: 0; color: var(--cor-apagado); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-q { font-family: var(--fonte-titulo); white-space: nowrap; } .cm-q .c { font-style: normal; }
.cm-env { width: 88px; height: 88px; border-radius: 50%; flex: none; display: grid; place-items: center; background: var(--cor-destaque); }
.cm-env svg { width: 46%; fill: none; stroke: var(--cor-fundo); stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
.cm-coracao { right: 96px; top: 930px; width: 92px; color: #ff3b5c; filter: drop-shadow(0 4px 12px rgba(0,0,0,.4)); }
.cm-cor { width: 100%; fill: color-mix(in srgb, #ff3b5c 35%, transparent); }`,
      script: `tl.to('.cm-ph', { autoAlpha: 0, duration: 0.15 }, ${r2(Math.max(0, t0 - 0.05))});
tl.to('.cm-env', { scale: 1.12, duration: 0.3, yoyo: true, repeat: 3, ease: 'sine.inOut' }, ${r2(fim + 0.6)});
tl.to('.cm-coracao', { y: -150, autoAlpha: 0, duration: 1.1, ease: 'power1.in' }, ${r2(fim + 1.1)});`,
    };
  },

  mensagem: (x, c) => {
    const t0 = c.t(x.titulo ?? x.detalhe, 0.55, 0.5);
    const ts = r2(Math.max(0.05, t0 - 0.55));
    const app = iconeExiste('paper-plane-tilt') ? 'paper-plane-tilt' : 'mensagem';
    return {
      html: `<div class="mg mg-quadro"><svg class="dm-seta" viewBox="0 0 1080 1920" aria-hidden="true"><path pathLength="1" d="M236 1010C40 880 50 600 140 446" data-in="desenha" data-t="${ts}" data-d="0.55"/><path pathLength="1" d="M104 478L140 432L182 474" data-in="desenha" data-t="${r2(ts + 0.5)}" data-d="0.18"/></svg><div class="dm mg-card" data-in="desce" data-t="${t0}"><div class="dm-app">${icone(app, t0 + 0.15, 0.5, 'ic dm-ic')}<b class="dm-badge" data-in="balao" data-t="${r2(t0 + 0.45)}">1</b></div><div class="dm-txt"><div class="dm-topo"><span>${esc(x.kicker ?? 'Direct')}</span> agora</div><div class="dm-nome">${esc(x.titulo ?? '')}</div><div class="dm-msg">${c.marcar(x.detalhe ?? '', x.enfase, t0 + 0.35)}</div></div>${x.enfase ? `<div class="dm-doc" data-in="escala" data-t="${r2(t0 + 0.35)}"><b style="font-size:${corpoPx(x.enfase, 84, 36, c.v, 1, true)}px">${esc(x.enfase)}</b><i></i><i></i><i></i></div>` : ''}</div></div>`,
      css: `.dm-seta { left: 0; top: 0; width: 1080px; height: 1920px; overflow: visible; }
.dm-seta path { fill: none; stroke: var(--cor-destaque); stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; filter: drop-shadow(0 0 10px color-mix(in srgb, var(--cor-destaque) 60%, transparent)); }
.mg-quadro .dm { left: 40px; right: 40px; top: 236px; min-height: 170px; display: flex; align-items: center; gap: 24px; padding: 22px 26px; border-radius: 40px; }
.dm-app { position: relative; width: 112px; height: 112px; border-radius: 28px; flex: none; display: grid; place-items: center; background: linear-gradient(135deg, var(--cor-destaque), var(--cor-destaque-3)); color: var(--cor-fundo); }
.dm-ic { width: 58%; } .dm-ic.icd { color: var(--cor-fundo); } .dm-ic.icd .icd-f { fill: var(--cor-fundo); opacity: .35; }
.dm-badge { position: absolute; top: -12px; right: -12px; width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: #ff3b30; color: #ffffff; font-size: 26px; font-family: var(--fonte-texto); border: 3px solid var(--cor-fundo); }
.dm-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.dm-topo { font-size: 24px; letter-spacing: .12em; text-transform: uppercase; color: var(--cor-apagado); }
.dm-topo span { color: var(--cor-destaque); font-weight: 700; }
.dm-nome { font-family: var(--fonte-titulo); font-size: 42px; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dm-msg { font-size: 34px; line-height: 1.2; }
.dm-doc { width: 100px; height: 128px; flex: none; border-radius: 14px; display: flex; flex-direction: column; align-items: center; padding-top: 14px; gap: 8px; background: color-mix(in srgb, var(--cor-texto) 10%, var(--cor-fundo)); border: 2px solid color-mix(in srgb, var(--cor-texto) 20%, transparent); }
.dm-doc b { font-family: var(--fonte-titulo); color: var(--cor-destaque); text-transform: uppercase; line-height: 1; }
.dm-doc i { width: 64%; height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--cor-texto) 28%, transparent); }`,
    };
  },
};

// ---------- O CSS e o movimento comuns ----------

const RUIDO = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

function cssDaTextura(v: VisualDeMotion): string {
  switch (v.textura) {
    case 'grao':
      return `.mg-tex { background: ${RUIDO}; opacity: .16; mix-blend-mode: overlay; }`;
    case 'papel':
      return `.mg-tex { background: ${RUIDO}, radial-gradient(ellipse 80% 70% at 50% 40%, transparent 60%, rgba(80,50,20,.10)); opacity: .22; mix-blend-mode: multiply; }`;
    case 'grade':
      return `.mg-tex { background: linear-gradient(color-mix(in srgb, var(--cor-texto) 9%, transparent) 2px, transparent 2px) 0 0 / 90px 90px, linear-gradient(90deg, color-mix(in srgb, var(--cor-texto) 9%, transparent) 2px, transparent 2px) 0 0 / 90px 90px; }`;
    case 'pontos':
      return `.mg-tex { background: radial-gradient(color-mix(in srgb, var(--cor-texto) 22%, transparent) 2.5px, transparent 3px) 0 0 / 34px 34px; }`;
    case 'scanlines':
      return `.mg-tex { background: repeating-linear-gradient(0deg, color-mix(in srgb, var(--cor-texto) 7%, transparent) 0 2px, transparent 2px 6px); }`;
    default:
      return '';
  }
}

function cssDaSuperficie(v: VisualDeMotion, sobre: boolean): string {
  // Sobre o vídeo um cartão sem fundo não se lê: vira sólido.
  const s = sobre && (v.superficie === 'nenhuma' || v.superficie === 'contorno') ? 'solida' : v.superficie;
  const base = `.mg-card { border-radius: ${v.raio}px; padding: 4.5cqh 5.5cqw; }`;
  switch (s) {
    case 'solida':
      return `${base} .mg-card { background: color-mix(in srgb, var(--cor-texto) ${sobre ? 4 : 7}%, var(--cor-fundo)); box-shadow: 0 30px 70px rgba(0,0,0,.32), inset 0 0 0 2px color-mix(in srgb, var(--cor-texto) 8%, transparent); }`;
    case 'vidro':
      return `${base} .mg-card { background: color-mix(in srgb, var(--cor-texto) ${v.escuro ? 9 : 4}%, color-mix(in srgb, var(--cor-fundo) ${sobre ? 78 : 55}%, transparent)); backdrop-filter: blur(26px) saturate(170%); border: 2px solid color-mix(in srgb, ${v.escuro ? '#ffffff' : '#ffffff'} ${v.escuro ? 22 : 70}%, transparent); box-shadow: 0 30px 80px rgba(0,0,0,${v.escuro ? '.45' : '.14'}), inset 0 2px 0 rgba(255,255,255,${v.escuro ? '.18' : '.8'}); }`;
    case 'contorno':
      return `${base} .mg-card { background: color-mix(in srgb, var(--cor-fundo) 60%, transparent); border: 2px solid color-mix(in srgb, var(--cor-texto) 26%, transparent); }`;
    case 'brutal':
      return `${base} .mg-card { background: color-mix(in srgb, var(--cor-fundo) 55%, #ffffff); border: 5px solid var(--cor-texto); box-shadow: 12px 12px 0 var(--cor-texto); }`;
    case 'papel':
      return `${base} .mg-card { background: color-mix(in srgb, var(--cor-fundo) 70%, #ffffff); box-shadow: 0 2px 0 rgba(0,0,0,.06), 0 22px 44px rgba(60,40,10,.2); rotate: -1.2deg; }`;
    default:
      return `${base} .mg-card { background: transparent; padding: 0; }`;
  }
}

function cssDoMarcador(v: VisualDeMotion): string {
  const comum = `.mk { position: relative; display: inline-block; z-index: 0; } .mk-x { position: absolute; z-index: -1; display: block; transform-origin: 0 50%; } .mk-c { position: absolute; z-index: -1; left: -14%; top: -22%; width: 128%; height: 144%; overflow: visible; fill: none; stroke: var(--cor-destaque); stroke-width: 3.2; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; }`;
  switch (v.marcador) {
    case 'bloco':
      return `${comum} .mk-x { left: -.1em; right: -.1em; top: .06em; bottom: .02em; background: var(--cor-destaque); } .mk-p { color: var(--cor-fundo); } .mg-solto .mk-p { color: #111; }`;
    case 'sublinhado':
      return `${comum} .mk-x { left: 0; right: 0; bottom: -.04em; height: .11em; background: var(--cor-destaque); } .mk-p { color: var(--cor-destaque); }`;
    case 'marca-texto':
      return `${comum} .mk-x { left: -.08em; right: -.08em; top: .42em; bottom: .02em; background: color-mix(in srgb, var(--cor-destaque) 50%, transparent); }`;
    default:
      return comum;
  }
}

/** O CSS da cena: o fundo, a superfície, a tipografia (ajustada à área útil pelo container) e cada preset. */
function cssDaCena(v: VisualDeMotion, c: { sobre: boolean; layout: LayoutDoPreset }): string {
  const corSolta = v.escuro ? 'var(--cor-texto)' : 'var(--cor-fundo)';
  return `
.mg-fundo { position: absolute; inset: 0; background: var(--cor-fundo); overflow: hidden; }
.mg-tex { position: absolute; inset: 0; pointer-events: none; }
${cssDaTextura(v)}
.mg-brilho { position: absolute; width: 85%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--cor-destaque) 30%, transparent), transparent 66%); left: -25%; top: -30%; }
.mg-brilho.b2 { left: auto; top: auto; right: -30%; bottom: -35%; background: radial-gradient(circle, color-mix(in srgb, var(--cor-destaque-2) 24%, transparent), transparent 66%); }
${v.extra === 'cinema' && !c.sobre ? '.mg-faixa { position: absolute; left: 0; right: 0; height: 7%; background: #000; z-index: 3; } .mg-faixa.f1 { top: 0; } .mg-faixa.f2 { bottom: 0; }' : ''}
.mg { position: absolute; left: var(--util-x); top: var(--util-y); width: var(--util-w); height: var(--util-h); container-type: size; display: flex; flex-direction: column; justify-content: center; gap: 2.4cqh; color: var(--cor-texto); font-family: var(--fonte-texto); z-index: 2; }
.mg > * { flex: none; }
.mg-centro { align-items: center; text-align: center; }
.mg-esq { align-items: flex-start; text-align: left; }
.mg.mg-quadro { left: 0; top: 0; width: 1080px; height: 1920px; display: block; --solto: ${corSolta}; }
.mg-quadro > * { position: absolute; }
.mg-quadro .mg-card { padding: 22px 28px; }
.q-pilula { display: inline-flex; align-items: center; gap: .4em; padding: .3em .7em .26em; border-radius: 999px; background: var(--cor-destaque); color: var(--cor-fundo); font-family: var(--fonte-titulo); text-transform: uppercase; letter-spacing: .02em; line-height: 1; white-space: nowrap; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.q-fundo { position: absolute; inset: 0; z-index: 0; }
.q-fundo-escuro { background: radial-gradient(ellipse 75% 55% at 50% 42%, rgba(0,0,0,.4), rgba(0,0,0,.78)); }
.q-fundo-xadrez { background: repeating-conic-gradient(#2a2a31 0 25%, #3a3a42 0 50%) 0 0 / 64px 64px; }
.q-fundo-xadrez::after { content: ""; position: absolute; inset: 0; background: radial-gradient(ellipse 70% 50% at 50% 40%, color-mix(in srgb, var(--cor-destaque) 22%, transparent), transparent 70%); }
.q-fundo-grade { background: linear-gradient(color-mix(in srgb, var(--cor-destaque) 26%, transparent) 2px, transparent 2px) 0 0 / 72px 72px, linear-gradient(90deg, color-mix(in srgb, var(--cor-destaque) 26%, transparent) 2px, transparent 2px) 0 0 / 72px 72px, rgba(4,8,22,.8); }
${CSS_DOS_ASSETS}
.mg-enfeite { position: absolute; right: 0; top: 0; width: min(22cqw, 26cqh); translate: 18% -38%; pointer-events: none; z-index: 3; }
.mg-solto .mg-enfeite, .mg-solto .anot-ast { filter: drop-shadow(0 3px 8px rgba(0,0,0,.45)); }
.obj-roda { position: relative; width: min(46cqw, 82cqh); aspect-ratio: 1; flex: none; color: var(--cor-texto); }
.obj-roda .ast { width: 100%; height: 100%; }
.ico-roda .ast.ico-grande { width: 62%; color: var(--cor-texto); }
.mg.mg-anot { justify-content: center; align-items: flex-start; gap: 0; }
.anot-ast { width: min(34cqw, 70cqh); margin-left: 34cqw; margin-top: -1cqh; }
.anot-ast .ast { width: 100%; }
.mg.mg-titulo { top: 230px; height: 760px; gap: 1.6cqh; justify-content: flex-end; }
.mg-titulo .mg-l { white-space: nowrap; }
.mg.mg-chamada { top: 880px; height: 300px; gap: 1.4cqh; }
.mg-titulo .mg-linhas { align-items: center; }
.mg-titulo .t-xl { line-height: .96; }
.mg-titulo .mg-m { margin-bottom: -.02em; }
.cta-seta { width: min(12cqw, 26cqh); fill: none; stroke: var(--cor-destaque); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 3px 8px rgba(0,0,0,.45)); }
.cta-seta path { stroke-dasharray: 1; stroke-dashoffset: 1; }
.mg-caixa { position: relative; display: flex; flex-direction: column; justify-content: center; gap: 2.4cqh; width: 100%; max-height: 100%; }
.mg-t { font-family: var(--fonte-titulo); line-height: 1; letter-spacing: -.025em; text-wrap: balance; margin: 0; ${v.caixaAlta ? 'text-transform: uppercase;' : ''} ${v.extra === 'inclinado' ? 'font-style: italic; transform: skewX(-7deg);' : ''} ${v.extra === 'neon' ? 'text-shadow: 0 0 22px color-mix(in srgb, var(--cor-destaque) 55%, transparent);' : ''} }
.mg-t { overflow-wrap: break-word; }
.t-xl { font-size: min(21cqw, 34cqh); line-height: .92; }
.t-l { font-size: min(12.5cqw, 15cqh); }
.t-m { font-size: min(9.4cqw, 11cqh); line-height: 1.04; }
.t-s { font-size: min(7cqw, 8.5cqh); line-height: 1.08; }
.mg-k { font-family: var(--fonte-texto); font-size: max(24px, min(4.3cqw, 6cqh)); letter-spacing: .16em; text-transform: uppercase; color: var(--cor-destaque); }
.mg-d { margin: 0; font-size: max(28px, min(5.4cqw, 7cqh)); line-height: 1.25; color: var(--cor-apagado); text-wrap: balance; max-width: 92%; }
.mg-m { display: block; overflow: hidden; padding: .04em ${v.extra === 'inclinado' ? '.4em' : '.14em'} .16em ${v.extra === 'inclinado' ? '.08em' : '0'}; margin-bottom: -.12em; }
.mg-l { display: inline-block; }
.mg-linhas { display: flex; flex-direction: column; }
.mg-solto { color: ${corSolta}; }
.mg-solto .mg-t, .mg-solto .mg-d, .mg-solto .mg-k { text-shadow: 0 4px 22px rgba(0,0,0,.55), 0 2px 3px rgba(0,0,0,.45); }
.mg-solto .mg-d { color: ${corSolta}; }
${cssDaSuperficie(v, c.sobre)}
${cssDoMarcador(v)}
.ic { fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; overflow: visible; }
.ic * { stroke-dasharray: 1; stroke-dashoffset: 1; }
.icd { overflow: visible; display: block; }
.icd .icd-l { fill: currentColor; }
.icd .icd-f { fill: var(--cor-destaque); opacity: .9; }
.ico-roda .icd.ico-grande { width: 60%; color: var(--cor-texto); }
.li-ic.icd { width: 1.25em; flex: none; color: var(--cor-texto); }
.rk-ic { width: 1.1em; flex: none; }
.notif-ic.icd { width: 66%; color: var(--cor-fundo); }
.notif-ic.icd .icd-f { fill: var(--cor-fundo); opacity: .35; }
.mg-num { font-family: var(--fonte-titulo); color: var(--cor-destaque); line-height: .9; letter-spacing: -.035em; font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: .04em; ${v.extra === 'neon' ? 'text-shadow: 0 0 30px color-mix(in srgb, var(--cor-destaque) 60%, transparent);' : ''} }
.mg-num .pre, .mg-num .suf { font-size: .42em; letter-spacing: 0; }
.mg-esq > .mg-num { font-size: min(30cqw, 36cqh); }
.mg-trilho { width: 70%; height: max(10px, 1.4cqh); border-radius: 99px; background: color-mix(in srgb, var(--cor-texto) 12%, transparent); overflow: hidden; }
.mg-trilho i, .termo-fio, .ad-risco { display: block; height: 100%; background: var(--cor-destaque); transform-origin: 0 50%; }
.mg-anel { flex-direction: row; align-items: center; gap: 5cqw; }
.anel { position: relative; width: min(46cqw, 78cqh); aspect-ratio: 1; flex: none; }
.anel svg { width: 100%; height: 100%; rotate: -90deg; overflow: visible; }
.anel circle { fill: none; stroke-width: 15; stroke-linecap: round; }
.anel .trilho { stroke: color-mix(in srgb, var(--cor-texto) 12%, transparent); }
.anel .arco { stroke: var(--cor-destaque); stroke-dasharray: 1; stroke-dashoffset: 1; }
.anel { container-type: inline-size; }
.anel-num { position: absolute; inset: 0; justify-content: center; align-items: center; }
.anel-txt { display: flex; flex-direction: column; gap: 2cqh; flex: 1; min-width: 0; }
.mg-barras { display: flex; align-items: flex-end; gap: 4cqw; width: 100%; height: 62cqh; }
.barra { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; gap: 1.2cqh; min-width: 0; }
.barra-v { font-size: min(7.5cqw, 8cqh); color: var(--cor-texto); }
.barra.topo .barra-v { color: var(--cor-destaque); }
.barra-col { flex: 1; width: 100%; display: flex; align-items: flex-end; }
.barra-col i { display: block; width: 100%; border-radius: ${Math.min(14, v.raio)}px ${Math.min(14, v.raio)}px 0 0; background: color-mix(in srgb, var(--cor-texto) 26%, transparent); transform-origin: 50% 100%; }
.barra.topo .barra-col i { background: var(--cor-destaque); }
.barra-r { font-size: max(24px, min(4.2cqw, 5.4cqh)); color: var(--cor-apagado); text-align: center; line-height: 1.1; }
.mg-linha { position: relative; width: 100%; }
.mg-linha svg { display: block; width: 100%; height: auto; overflow: visible; }
.mg-linha .traco { fill: none; stroke: var(--cor-destaque); stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
.mg-linha .area { fill: color-mix(in srgb, var(--cor-destaque) 16%, transparent); }
.mg-linha .pt { fill: var(--cor-fundo); stroke: var(--cor-destaque); stroke-width: 5; transform-box: fill-box; transform-origin: center; }
.linha-fim { position: absolute; font-size: min(11cqw, 12cqh); white-space: nowrap; }
.linha-eixo { display: flex; justify-content: space-between; width: 100%; font-size: max(24px, min(4cqw, 5cqh)); color: var(--cor-apagado); }
.mg-vs { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 3cqw; align-content: center; }
.mg-vs > .vs-k, .mg-vs > .mg-d { grid-column: 1 / -1; text-align: center; justify-self: center; }
.vs-lado { display: flex; flex-direction: column; gap: 2cqh; align-items: flex-start; min-height: 40cqh; justify-content: center; }
.vs-a { opacity: .9; } .vs-a .mg-t { color: var(--cor-apagado); }
.vs-b { box-shadow: 0 0 0 3px var(--cor-destaque), 0 30px 70px rgba(0,0,0,.3); }
.vs-ic { width: min(14cqw, 14cqh); } .vs-a .vs-ic { color: var(--cor-destaque-3); } .vs-b .vs-ic { color: var(--cor-destaque); }
.vs-meio { font-family: var(--fonte-titulo); font-size: min(8cqw, 9cqh); color: var(--cor-fundo); background: var(--cor-destaque); border-radius: 99px; padding: .45em .55em; line-height: 1; }
.ad-antes { position: relative; display: inline-block; color: var(--cor-apagado); }
.ad-risco { position: absolute; left: -2%; right: -2%; top: 52%; height: max(6px, .9cqh); width: auto; background: var(--cor-destaque-3); }
.ad-seta { width: min(10cqw, 10cqh); fill: none; stroke: var(--cor-destaque); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.ad-seta path { stroke-dasharray: 1; stroke-dashoffset: 1; }
.mg-lista, .mg-passos, .mg-rank { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2.6cqh; width: 100%; }
.mg-lista li { display: flex; align-items: center; gap: 3cqw; font-size: min(7.4cqw, 8.6cqh); font-family: var(--fonte-titulo); line-height: 1.05; }
.li-ic { width: 1.2em; flex: none; color: var(--cor-destaque); }
.mg-passos { position: relative; padding-left: 0; }
.ps-linha { position: absolute; left: calc(min(10cqw, 10cqh) / 2 - 2px); top: 2cqh; bottom: 2cqh; width: 4px; background: color-mix(in srgb, var(--cor-destaque) 55%, transparent); transform-origin: 50% 0; }
.mg-passos li { position: relative; display: flex; align-items: center; gap: 4cqw; font-size: min(6.8cqw, 8cqh); font-family: var(--fonte-titulo); line-height: 1.08; }
.ps-n { flex: none; width: min(10cqw, 10cqh); aspect-ratio: 1; display: grid; place-items: center; border-radius: 50%; background: var(--cor-destaque); color: var(--cor-fundo); font-size: .8em; }
.cit-aspas { font-family: var(--fonte-titulo); font-size: min(40cqw, 40cqh); line-height: .6; height: .45em; color: var(--cor-destaque); }
.cit-autor { font-size: max(26px, min(5cqw, 6cqh)); color: var(--cor-apagado); }
.mg-termo { gap: 1.6cqh; }
.termo-classe { font-style: italic; font-size: max(26px, min(5cqw, 6.5cqh)); color: var(--cor-destaque); }
.termo-fio { width: 100%; height: 3px; opacity: .6; }
.perg-glifo { position: absolute; right: -2cqw; top: 50%; translate: 0 -50%; font-family: var(--fonte-titulo); font-size: min(80cqw, 95cqh); line-height: 1; color: color-mix(in srgb, var(--cor-destaque) 22%, transparent); z-index: -1; }
.perg-resp { color: var(--cor-texto); margin-top: 1.5cqh; }
.mg-notifs { gap: 2.4cqh; justify-content: flex-start; padding-top: 2cqh; }
.notif { display: flex; gap: 3.5cqw; align-items: flex-start; width: 100%; padding: 3.2cqh 4cqw; border-radius: ${Math.max(22, v.raio)}px; }
.notif-app { flex: none; width: min(14cqw, 20cqh); aspect-ratio: 1; border-radius: 26%; background: var(--cor-destaque); color: var(--cor-fundo); display: grid; place-items: center; }
.notif-ic { width: 62%; }
.notif-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .5cqh; }
.notif-topo { display: flex; justify-content: space-between; font-size: max(22px, min(3.6cqw, 6cqh)); color: var(--cor-apagado); text-transform: uppercase; letter-spacing: .06em; }
.notif-tit { font-family: var(--fonte-titulo); font-size: max(30px, min(6cqw, 10cqh)); line-height: 1.1; }
.notif-det { font-size: max(26px, min(4.6cqw, 8cqh)); color: var(--cor-apagado); line-height: 1.2; }
.selo { border: max(6px, 1.2cqw) solid var(--cor-destaque); outline: 3px solid var(--cor-destaque); outline-offset: max(6px, 1cqw); color: var(--cor-destaque); padding: 3cqh 6cqw; rotate: -8deg; font-family: var(--fonte-titulo); font-size: min(15cqw, 26cqh); line-height: .95; text-transform: uppercase; letter-spacing: .02em; text-align: center; border-radius: ${Math.min(18, v.raio)}px; background: color-mix(in srgb, var(--cor-fundo) ${c.sobre ? 82 : 0}%, transparent); }
.mg-busca { gap: 2.6cqh; }
.busca { display: flex; align-items: center; gap: 3cqw; width: 100%; border-radius: 44px; padding: 3cqh 5cqw; }
.busca-ic { width: min(9cqw, 13cqh); flex: none; color: var(--cor-destaque); }
.busca-q { font-family: var(--fonte-titulo); line-height: 1.15; flex: 1; min-width: 0; }
.busca-q .c { font-style: normal; }
.cursor { display: inline-block; width: 4px; height: 1.05em; margin-left: 4px; background: var(--cor-destaque); }
.busca-res { display: flex; align-items: center; gap: 3cqw; width: 92%; font-size: max(26px, min(5cqw, 8cqh)); color: ${c.sobre ? corSolta : 'var(--cor-texto)'}; ${c.sobre ? 'text-shadow: 0 2px 12px rgba(0,0,0,.6);' : ''} }
.busca-res b { width: 1.6em; height: .5em; border-radius: 99px; background: var(--cor-destaque); flex: none; }
.mg-chat { gap: 2cqh; justify-content: center; }
.bolha { max-width: 82%; padding: 2.4cqh 4.4cqw; font-size: max(28px, min(5.6cqw, 7.5cqh)); line-height: 1.22; border-radius: 34px; font-family: var(--fonte-texto); box-shadow: 0 16px 40px rgba(0,0,0,.22); }
.bolha.ele { align-self: flex-start; background: color-mix(in srgb, var(--cor-texto) 10%, var(--cor-fundo)); color: var(--cor-texto); border-bottom-left-radius: 8px; transform-origin: 0 100%; }
.bolha.eu { align-self: flex-end; background: var(--cor-destaque); color: var(--cor-fundo); border-bottom-right-radius: 8px; transform-origin: 100% 100%; }
.mg-alerta { box-shadow: inset 0 0 0 3px var(--cor-destaque-3), 0 30px 70px rgba(0,0,0,.3); }
.alerta-topo { display: flex; align-items: center; gap: 2.4cqw; }
.alerta-ic { width: min(10cqw, 12cqh); color: var(--cor-destaque-3); }
.mg-alerta .mg-k { color: var(--cor-destaque-3); }
.preco-antes { position: relative; display: inline-block; font-family: var(--fonte-titulo); font-size: min(8cqw, 9cqh); color: var(--cor-apagado); }
.preco-v { font-size: min(24cqw, 32cqh); }
.mg-rank li { display: flex; align-items: center; gap: 4cqw; font-size: min(6.8cqw, 8cqh); font-family: var(--fonte-titulo); padding: 1.6cqh 3cqw; border-radius: ${Math.min(16, v.raio)}px; background: color-mix(in srgb, var(--cor-texto) 7%, transparent); line-height: 1.05; }
.mg-rank li b { color: var(--cor-apagado); min-width: 1.6em; }
.mg-rank li.topo { background: var(--cor-destaque); color: var(--cor-fundo); font-size: min(8.4cqw, 10cqh); }
.mg-rank li.topo b { color: var(--cor-fundo); }
.mg-rotulo { justify-content: flex-end; align-items: flex-start; padding-bottom: 4cqh; }
.rot-caixa { display: flex; align-items: stretch; gap: 3cqw; padding: 2.6cqh 4.5cqw 2.6cqh 3cqw; max-width: 92%; }
.rot-barra { width: 8px; border-radius: 4px; background: var(--cor-destaque); transform-origin: 50% 100%; flex: none; }
.rot-k { font-size: max(24px, min(4.2cqw, 8cqh)); color: var(--cor-apagado); margin-top: .8cqh; }
.mg-icone { flex-direction: row; align-items: center; gap: 5cqw; }
.ico-roda { position: relative; width: min(40cqw, 70cqh); aspect-ratio: 1; flex: none; display: grid; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--cor-destaque) 14%, transparent); }
.ico-anel { position: absolute; inset: 0; width: 100%; height: 100%; rotate: -90deg; fill: none; stroke: var(--cor-destaque); stroke-width: 2.4; overflow: visible; }
.ico-anel circle { stroke-dasharray: 1; stroke-dashoffset: 1; }
.ico-grande { width: 54%; color: var(--cor-destaque); }
.ico-txt { display: flex; flex-direction: column; gap: 2cqh; flex: 1; min-width: 0; }
${c.layout === 'cartao' ? `.t-xl { font-size: min(17cqw, 40cqh); } .t-l { font-size: min(9.5cqw, 22cqh); } .t-m { font-size: min(7.6cqw, 19cqh); } .t-s { font-size: min(6.2cqw, 15cqh); }
.mg-d { font-size: max(30px, min(4.3cqw, 10cqh)); } .mg-k { font-size: max(24px, min(3.2cqw, 8cqh)); }
.notif-tit { font-size: min(5.8cqw, 12cqh); } .notif-det { font-size: max(28px, min(4.2cqw, 9cqh)); } .notif-topo { font-size: max(22px, min(2.8cqw, 6cqh)); } .notif-app { width: min(12cqw, 26cqh); }
.busca-res { font-size: max(30px, min(4.4cqw, 9cqh)); } .rot-k { font-size: max(28px, min(3.8cqw, 9cqh)); }
.mg-esq > .mg-num, .preco-v { font-size: min(20cqw, 42cqh); } .mg-lista li, .mg-passos li, .mg-rank li { font-size: min(6cqw, 13cqh); } .bolha { font-size: max(30px, min(4.6cqw, 10cqh)); }` : ''}
${c.layout === 'pip' || c.layout === 'tela_cheia' ? '.mg-anel, .mg-icone { flex-direction: column; align-items: flex-start; } .anel { width: min(64cqw, 34cqh); } .ico-roda, .obj-roda { width: min(52cqw, 30cqh); }' : ''}
${c.layout === 'pip' ? `.mg-vs { grid-template-columns: 1fr; } .vs-lado { min-height: 0; } .vs-meio { justify-self: center; } .vs-ic { width: min(16cqw, 8cqh); }
.mg-d { font-size: max(28px, min(8cqw, 4.4cqh)); } .mg-k { font-size: max(24px, min(6cqw, 3.4cqh)); } .mg-lista li, .mg-passos li, .mg-rank li { font-size: min(10cqw, 6cqh); }
.bolha { font-size: max(28px, min(8cqw, 4.6cqh)); max-width: 100%; } .busca-res { font-size: max(28px, min(7cqw, 4.4cqh)); } .barra-r { font-size: max(22px, min(6cqw, 3.4cqh)); } .barra-v { font-size: min(9cqw, 5cqh); }
.linha-eixo { font-size: max(22px, min(6cqw, 3cqh)); } .notif-tit { font-size: min(8cqw, 5cqh); }` : ''}
${c.layout === 'tela_cheia' ? '.t-m { font-size: min(11cqw, 12cqh); } .t-s { font-size: min(8.4cqw, 9cqh); } .mg-d { font-size: max(32px, min(6cqw, 6.5cqh)); }' : ''}
${v.extra === 'fita' ? '.mg-card::before { content: ""; position: absolute; top: -18px; left: 50%; width: 160px; height: 40px; margin-left: -80px; rotate: -4deg; background: color-mix(in srgb, var(--cor-destaque-3) 60%, #ffffff); opacity: .85; } .mg-card { position: relative; }' : ''}
`;
}

/** O que dá vida aos atributos data-in/data-t: cada elemento entra no seu segundo, com o movimento do visual. */
function scriptDaCena(v: VisualDeMotion, D: number, layout: LayoutDoPreset, lado: string | undefined, sobre: boolean, extra: string): string {
  const m = v.movimento;
  const M = JSON.stringify({ e: m.entrada, s: m.saida, i: m.impacto, d: m.duracao, D: r2(D) });
  const entradaDoFundo = sobre
    ? ''
    : layout === 'meio_a_meio'
      ? `tl.fromTo('.mg-fundo', { clipPath: '${lado === 'baixo' ? 'inset(100% 0 0 0)' : 'inset(0 0 100% 0)'}' }, { clipPath: 'inset(0% 0 0% 0)', duration: 0.42, ease: 'power3.out' }, 0);
  tl.to('.mg-fundo', { clipPath: '${lado === 'baixo' ? 'inset(100% 0 0 0)' : 'inset(0 0 100% 0)'}', duration: 0.3, ease: 'power2.in' }, M.D - 0.3);`
      : `tl.fromTo('.mg-fundo', { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)', duration: 0.5, ease: 'power3.inOut' }, 0);
  tl.to('.mg-fundo', { autoAlpha: 0, duration: 0.25, ease: 'power2.in' }, M.D - 0.25);`;
  return `var M = ${M};
var q = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
var num = function (el, nome, padrao) { var x = parseFloat(el.getAttribute(nome)); return isNaN(x) ? padrao : x; };
${entradaDoFundo}
q('.mg-brilho').forEach(function (el, i) { tl.fromTo(el, { x: i ? 40 : -60, y: 0 }, { x: i ? -50 : 60, y: i ? -40 : 50, duration: M.D, ease: 'sine.inOut' }, 0); });
tl.fromTo('.mg', { scale: 1 }, { scale: 1.035, duration: M.D, ease: 'none' }, 0);
q('[data-in]').forEach(function (el) {
  var t = num(el, 'data-t', 0), k = el.getAttribute('data-in'), d = num(el, 'data-d', M.d);
  if (k === 'sobe') tl.fromTo(el, { y: 50, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: M.d, ease: M.e }, t);
  else if (k === 'desce') tl.fromTo(el, { y: -90, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: M.d * 1.2, ease: 'back.out(1.5)' }, t);
  else if (k === 'mascara') tl.fromTo(el, { yPercent: 115 }, { yPercent: 0, duration: M.d * 1.15, ease: M.e }, t);
  else if (k === 'mascara-solo') tl.fromTo(el, { clipPath: 'inset(0 100% 0 0)', x: -20 }, { clipPath: 'inset(0 0% 0 0)', x: 0, duration: M.d * 1.4, ease: M.e }, t);
  else if (k === 'bate') tl.fromTo(el, { scale: 1.9, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.3, ease: M.i }, t);
  else if (k === 'carimbo') tl.fromTo(el, { scale: 3.2, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.26, ease: 'power4.in' }, t);
  else if (k === 'escala') tl.fromTo(el, { scale: 0.55, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: M.d * 1.2, ease: M.e }, t);
  else if (k === 'gira') tl.fromTo(el, { rotation: -25, scale: 0.6, autoAlpha: 0 }, { rotation: 0, scale: 1, autoAlpha: 1, duration: 0.7, ease: 'back.out(1.6)' }, t);
  else if (k === 'balao') tl.fromTo(el, { scale: 0.3, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.38, ease: 'back.out(1.8)' }, t);
  else if (k === 'esq') tl.fromTo(el, { x: -110, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: M.d, ease: M.e }, t);
  else if (k === 'dir') tl.fromTo(el, { x: 110, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: M.d, ease: M.e }, t);
  else if (k === 'aparece') tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: 'power1.out' }, t);
  else if (k === 'revela') { tl.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)', scale: 0.7 }, { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: d, ease: M.e }, t); tl.to(el, { scale: 1.06, duration: 0.5, yoyo: true, repeat: 1, ease: 'sine.inOut' }, t + d + 0.2); }
  else if (k === 'desenha') tl.fromTo(el, { strokeDashoffset: 1 }, { strokeDashoffset: num(el, 'data-ate', 0), duration: d, ease: 'power2.inOut' }, t);
  else if (k === 'enche') tl.fromTo(el, { scaleX: 0 }, { scaleX: 1, duration: d, ease: 'power3.out' }, t);
  else if (k === 'cresce') tl.fromTo(el, { scaleY: 0 }, { scaleY: 1, duration: d, ease: 'power3.out' }, t);
  else if (k === 'desce-linha') tl.fromTo(el, { scaleY: 0 }, { scaleY: 1, duration: d, ease: 'none' }, t);
});
q('[data-conta]').forEach(function (el) {
  var alvo = num(el, 'data-conta', 0), casas = num(el, 'data-casas', 0), t = num(el, 'data-t', 0), d = num(el, 'data-d', 1), o = { v: 0 };
  var f = function (v) { var s = Math.abs(v).toFixed(casas).split('.'), i = s[0], r = ''; while (i.length > 3) { r = '.' + i.slice(-3) + r; i = i.slice(0, -3); } return (v < 0 ? '-' : '') + i + r + (s[1] ? ',' + s[1] : ''); };
  el.textContent = f(0);
  tl.to(o, { v: alvo, duration: d, ease: 'power2.out', onUpdate: function () { el.textContent = f(o.v); } }, t);
  tl.fromTo(el, { scale: 1 }, { scale: 1.07, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.out' }, t + d);
});
q('[data-digita]').forEach(function (el) {
  var t = num(el, 'data-t', 0), cs = el.querySelectorAll('.c'), cur = el.querySelector('.cursor');
  for (var i = 0; i < cs.length; i++) tl.fromTo(cs[i], { display: 'none' }, { display: 'inline', duration: 0.01 }, t + i * 0.045);
  if (cur) for (var b = 0; b < Math.floor(M.D / 0.5); b++) tl.to(cur, { autoAlpha: b % 2 ? 1 : 0, duration: 0.01 }, 0.5 * (b + 1));
});
${extra}
tl.to('.mg', { autoAlpha: 0, y: -26, duration: 0.3, ease: M.s }, M.D - 0.34);`;
}

export interface CenaDeMotion {
  preset: string;
  textos: TextosDaCena;
  layout: LayoutDoPreset;
  lado?: 'cima' | 'baixo';
  canto?: 'sup-esq' | 'sup-dir' | 'inf-esq' | 'inf-dir';
  /** Só no cartão: a cena passa atrás da pessoa (recortada por cima no render). */
  atras?: boolean;
  /** O ajuste feito à mão no editor: deslocamento (px no quadro de 1080x1920) e tamanho. */
  ajuste?: AjusteDaCena;
}

/** Mover e redimensionar a cena inteira (o painel da animação no editor). */
export interface AjusteDaCena {
  x: number;
  y: number;
  escala: number;
  /** Cada elemento movido ou redimensionado no palco (a chave é o data-ed dele). */
  elementos?: Record<string, { x: number; y: number; escala: number }>;
}

/** O ajuste lido e preso a limites que nunca tiram a cena do quadro; `undefined` quando é o neutro. */
export function lerAjuste(bruto: unknown): AjusteDaCena | undefined {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const n = (v: unknown, min: number, max: number, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : padrao);
  const a: AjusteDaCena = { x: Math.round(n(b.x, -500, 500, 0)), y: Math.round(n(b.y, -900, 900, 0)), escala: Math.round(n(b.escala, 0.4, 2, 1) * 100) / 100 };
  const els = b.elementos && typeof b.elementos === 'object' ? Object.entries(b.elementos as Record<string, unknown>) : [];
  const elementos: Record<string, { x: number; y: number; escala: number }> = {};
  for (const [chave, v] of els.slice(0, 40)) {
    if (!/^[a-z0-9-]{1,24}\.\d{1,2}$/.test(chave) || !v || typeof v !== 'object') continue;
    const e = v as Record<string, unknown>;
    const el = { x: Math.round(n(e.x, -1080, 1080, 0)), y: Math.round(n(e.y, -1920, 1920, 0)), escala: Math.round(n(e.escala, 0.2, 4, 1) * 100) / 100 };
    if (el.x || el.y || el.escala !== 1) elementos[chave] = el;
  }
  if (Object.keys(elementos).length) a.elementos = elementos;
  return a.x || a.y || a.escala !== 1 || a.elementos ? a : undefined;
}

const MARCA_DO_AJUSTE = '/*ajuste-da-cena*/';

/** O CSS do ajuste: a cena inteira (não o fundo) deslocada e em outro tamanho. */
export function cssDoAjuste(a: AjusteDaCena | undefined): string {
  if (!a) return '';
  const cena = a.x || a.y || a.escala !== 1 ? `.mg { translate: ${a.x}px ${a.y}px; scale: ${a.escala}; }` : '';
  const els = Object.entries(a.elementos ?? {})
    .map(([k, e]) => `[data-ed="${k}"] { translate: ${e.x}px ${e.y}px; scale: ${e.escala}; }`)
    .join(' ');
  return `\n${MARCA_DO_AJUSTE}${cena}${els ? ` ${els}` : ''}`;
}

/**
 * A animação com outro ajuste, na hora e sem remontar: troca só a linha do
 * ajuste no CSS e guarda o ajuste na cena (remontar depois mantém).
 */
export function comAjuste(c: ComposicaoHtml, a: AjusteDaCena | undefined): ComposicaoHtml {
  const i = c.css.indexOf(`\n${MARCA_DO_AJUSTE}`);
  const css = (i >= 0 ? c.css.slice(0, i) : c.css) + cssDoAjuste(a);
  let briefing = c.briefing;
  try {
    const b = JSON.parse(c.briefing ?? '{}') as { motion?: Record<string, unknown> };
    if (b.motion) {
      if (a) b.motion.ajuste = a;
      else delete b.motion.ajuste;
      briefing = JSON.stringify(b);
    }
  } catch {
    // briefing que não é JSON: o ajuste vale só no CSS.
  }
  return { ...c, css, ...(briefing !== undefined ? { briefing } : {}) };
}

/** As cenas de destaque, que levam o enfeite do visual. */
const CENAS_COM_ENFEITE = new Set(['impacto', 'contador', 'anel', 'preco', 'selo', 'pergunta', 'citacao', 'titulo', 'chamada', 'frase', 'termo', 'alerta', 'objeto']);

/** Um número estável de um texto (a mesma cena escolhe sempre o mesmo enfeite). */
function semente(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A cena com cartão: o cartão vai DENTRO de .mg (o contêiner do tamanho da
 * área útil, que mede as fontes) -- um .mg de altura automática mediria zero.
 */
function emCaixa(html: string): string {
  const m = /^<div class="mg ([^"]*)"([^>]*)>/.exec(html);
  if (!m || !/\bmg-card\b/.test(m[1]!)) return html;
  const alinhamento = m[1]!
    .split(' ')
    .filter((k) => k === 'mg-esq' || k === 'mg-centro')
    .join(' ');
  return `<div class="mg ${alinhamento}"><div class="mg-caixa ${m[1]}"${m[2]}>${html.slice(m[0].length)}</div>`;
}

/**
 * O cartão sobre o vídeo vai para onde o rosto NÃO está: a faixa acima da
 * cabeça, se couber; senão a faixa entre o rosto e a legenda. Sem medida
 * (ou sem lugar), fica na área útil padrão do layout.
 */
function cssForaDoRosto(p: PessoaNoQuadro | null | undefined): string {
  if (!p) return '';
  const alvo = '.mg:not(.mg-quadro):not(.mg-titulo):not(.mg-chamada)';
  const lugar = lugarDoCartao(p);
  return lugar ? `\n${alvo} { top: ${lugar.topo}px; height: ${lugar.altura}px; }` : '';
}

/**
 * As peças da cena que o editor deixa selecionar, mover e redimensionar, na
 * ordem de preferência (a mais específica primeiro), com o campo de texto
 * que cada uma mostra ('' = sem texto editável direto).
 */
const EDITAVEIS: ReadonlyArray<readonly [string, string]> = [
  ['cz-a', 'kicker'], ['cz-b', 'detalhe'], ['cz', 'titulo'], ['hud-w', 'titulo'], ['pf-k', 'kicker'], ['pf', 'titulo'],
  ['ng-k', 'kicker'], ['ng-num', 'numero'], ['pl-cab', 'titulo'], ['pl-a', 'a'], ['pl-b', 'b'], ['mo-tit', 'titulo'], ['mo-card', ''],
  ['ld-k', 'kicker'], ['ld-a', 'a'], ['ld-b', 'b'], ['sl-tag', 'titulo'], ['jn', ''], ['tlp', ''], ['cm-chamada', 'detalhe'], ['cm', ''], ['dm', ''],
  ['ad-antes', 'antes'], ['ad-depois', 'depois'], ['perg-resp', 'detalhe'], ['termo-classe', 'kicker'], ['cit-autor', 'kicker'],
  ['vs-a', 'a'], ['vs-b', 'b'], ['vs-meio', ''], ['selo', 'titulo'], ['busca', 'titulo'], ['notif', ''], ['bolha', ''], ['rot-caixa', ''],
  ['mg-lista', ''], ['mg-passos', ''], ['mg-rank', ''], ['mg-barras', ''], ['mg-linha', ''], ['anel', ''], ['ico-roda', ''], ['obj-roda', ''],
  ['anot-ast', ''], ['cit-aspas', ''], ['mg-linhas', 'titulo'], ['mg-k', 'kicker'], ['mg-d', 'detalhe'], ['mg-num', 'numero'], ['mg-t', 'titulo'],
];

/** O html com `data-ed` (a chave da peça: classe.ordem) e `data-campo` nas peças editáveis. */
function marcarEditaveis(html: string): string {
  const contagem = new Map<string, number>();
  return html.replace(/<([a-z][a-z0-9]*)(\s[^>]*?)?\sclass="([^"]*)"/gi, (todo, tag: string, antes: string | undefined, classes: string) => {
    const lista = classes.split(/\s+/);
    // A raiz da cena (.mg) e as linhas soltas de um título (.mg-l) não são peças.
    if (lista.includes('mg') || lista.includes('mg-l') || /\bdata-ed=/.test(todo)) return todo;
    const achado = EDITAVEIS.find(([classe]) => lista.includes(classe));
    if (!achado) return todo;
    const n = contagem.get(achado[0]) ?? 0;
    contagem.set(achado[0], n + 1);
    return `<${tag} data-ed="${achado[0]}.${n}"${achado[1] ? ` data-campo="${achado[1]}"` : ''}${antes ?? ''} class="${classes}"`;
  });
}

/**
 * A animação com as peças marcadas (data-ed): as feitas antes da edição no
 * palco não tinham. Só acrescenta atributos -- o desenho e o tempo ficam.
 */
export function comPecasEditaveis(c: ComposicaoHtml): ComposicaoHtml {
  return c.html.includes('data-ed=') ? c : { ...c, html: marcarEditaveis(c.html) };
}

/** O layout que o preset aceita (o pedido, se servir; senão o preferido dele). */
export function layoutDoPreset(preset: string, pedido: string | undefined): LayoutDoPreset {
  const p = presetDeMotion(preset);
  if (!p) return 'meio_a_meio';
  return (p.layouts as readonly string[]).includes(pedido ?? '') ? (pedido as LayoutDoPreset) : p.layouts[0]!;
}

/**
 * A animação pronta de uma cena: o preset montado no visual, com cada
 * elemento no segundo da sua palavra. Determinística e sem IA -- a mesma
 * entrada dá sempre o mesmo vídeo (e a mesma chave de render).
 */
export function composicaoDoPreset(
  cena: CenaDeMotion,
  visualChave: string,
  duracaoS: number,
  /** As palavras da fala com o segundo DENTRO da cena. */
  palavras: ReadonlyArray<{ s: number; texto: string }>,
  /** `pessoa`: quem fala, medida no trecho (pessoa-no-quadro.ts) -- as cenas se ajustam a ela. */
  extra: { paleta?: string; ideia?: string; pessoa?: PessoaNoQuadro | null } = {},
): ComposicaoHtml {
  const v = visualDeMotion(visualChave) ?? VISUAIS_DE_MOTION[0]!;
  const preset = presetDeMotion(cena.preset) ?? PRESETS_DE_MOTION[0]!;
  const layout = layoutDoPreset(preset.chave, cena.layout);
  const sobre = layout === 'cartao';
  const D = Math.max(1.5, duracaoS);
  const scriptsDosAssets: string[] = [];
  let assets = 0;
  const c: Ctx = {
    asset: (chave, t, classe = 'ast') => {
      assets += 1;
      const a = assetAnimado(chave, `as${assets}`, t, classe);
      if (a.script) scriptsDosAssets.push(a.script);
      return a.html;
    },
    v,
    D,
    layout,
    sobre,
    t: relogio(palavras, D),
    marcar: marcador(v),
    corpo: (classe, texto, fracao = 1) => {
      const [w, h] = ESCALA_DO_LAYOUT[layout][classe];
      return cabe(texto, w, h, v, fracao);
    },
    alto: layout === 'pip' || layout === 'tela_cheia',
    ...(extra.pessoa ? { p: extra.pessoa } : {}),
  };
  const montado = MONTADORES[preset.chave]!(cena.textos, c);
  // O enfeite do visual (ou o rabisco pedido) nas cenas de destaque, logo
  // depois da batida principal; "nenhum" tira.
  const pedido = cena.textos.rabisco;
  const doVisual = v.enfeites.length && CENAS_COM_ENFEITE.has(preset.chave) ? v.enfeites[semente(JSON.stringify(cena.textos)) % v.enfeites.length] : undefined;
  const enfeite = pedido === 'nenhum' || preset.chave === 'anotacao' ? undefined : (pedido ?? doVisual);
  if (enfeite) {
    const batida = Number(/data-in="(?:bate|escala|carimbo|mascara)" data-t="([\d.]+)"/.exec(montado.html)?.[1] ?? 0.3);
    const html = `<div class="mg-enfeite">${c.asset(enfeite, Math.min(D - 1, batida + 0.3))}</div>`;
    montado.html = montado.html.replace(/<\/div>$/, `${html}</div>`);
  }
  // Atrás da pessoa: o pedido da cena; sem pedido, o padrão do preset (só no cartão).
  const atras = layout === 'cartao' && (cena.atras ?? preset.atras ?? false);
  // O fundo pintado atrás da pessoa (escuro, xadrez, grade): só faz sentido com ela por cima.
  const pano = atras && cena.textos.fundo ? `<div class="q-fundo q-fundo-${cena.textos.fundo}" data-in="aparece" data-t="0"></div>` : '';
  if (pano) montado.script = `${montado.script ?? ''}\ntl.to('.q-fundo', { autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, ${r2(D - 0.34)});`;
  const fundo = sobre
    ? pano
    : `<div class="mg-fundo">${v.brilho ? '<i class="mg-brilho"></i><i class="mg-brilho b2"></i>' : ''}<div class="mg-tex"></div>${v.extra === 'cinema' ? '<i class="mg-faixa f1"></i><i class="mg-faixa f2"></i>' : ''}</div>`;
  const lado = layout === 'meio_a_meio' ? (cena.lado === 'baixo' ? 'baixo' : 'cima') : undefined;
  const briefing = JSON.stringify({
    tipo: preset.chave,
    ideia: (extra.ideia ?? preset.nome).slice(0, 300),
    conteudo: JSON.stringify(cena.textos).slice(0, 900),
    motion: { preset: preset.chave, textos: cena.textos, ...(lerAjuste(cena.ajuste) ? { ajuste: lerAjuste(cena.ajuste) } : {}) },
  });
  return {
    html: marcarEditaveis(`${fundo}${emCaixa(montado.html)}`),
    css: `${cssDaCena(v, { sobre, layout })}${montado.css ?? ''}${sobre ? cssForaDoRosto(extra.pessoa) : ''}${cssDoAjuste(lerAjuste(cena.ajuste))}`,
    script: scriptDaCena(v, D, layout, lado, sobre, [montado.script ?? '', ...scriptsDosAssets].filter(Boolean).join('\n')),
    layout,
    ...(lado ? { lado } : {}),
    // Meio a meio: a metade do vídeo enquadra o rosto de quem fala.
    ...(lado && extra.pessoa ? { foco: r2(Math.max(0.1, Math.min(0.9, (extra.pessoa.cabeca.topo + extra.pessoa.cabeca.base) / 2 / 1920))) } : {}),
    ...(layout === 'pip' ? { canto: cena.canto ?? 'inf-dir' } : {}),
    // `false` também fica guardado: remontar não religa o padrão que a pessoa desligou.
    ...(atras ? { atras: true } : layout === 'cartao' && preset.atras ? { atras: false } : {}),
    semFundo: true,
    titulo: `${preset.nome}: ${cena.textos.titulo ?? cena.textos.numero ?? cena.textos.a ?? cena.textos.antes ?? cena.textos.itens?.[0] ?? ''}`.slice(0, 60),
    estilo: v.chave,
    ...(extra.paleta ? { paleta: extra.paleta } : {}),
    ...(briefing.length <= 2000 ? { briefing } : { briefing: JSON.stringify({ tipo: preset.chave, ideia: preset.nome, conteudo: '', motion: { preset: preset.chave, textos: { titulo: cena.textos.titulo } } }) }),
  };
}

/** A cena de motion guardada numa animação (para remontar em outro visual, paleta ou lugar sem IA). */
export function cenaDaComposicao(c: Pick<ComposicaoHtml, 'briefing' | 'layout' | 'lado' | 'canto' | 'atras'>): CenaDeMotion | null {
  try {
    const b = JSON.parse(c.briefing ?? '') as { motion?: { preset?: unknown; textos?: unknown; ajuste?: unknown } };
    const preset = presetDeMotion(String(b.motion?.preset ?? ''));
    if (!preset) return null;
    return { preset: preset.chave, textos: lerTextosDaCena(b.motion?.textos), layout: c.layout as LayoutDoPreset, ...(c.lado ? { lado: c.lado } : {}), ...(c.canto ? { canto: c.canto } : {}), ...(typeof c.atras === 'boolean' ? { atras: c.atras } : {}), ...(lerAjuste(b.motion?.ajuste) ? { ajuste: lerAjuste(b.motion?.ajuste) } : {}) };
  } catch {
    return null;
  }
}

/** O que falta para o preset ter o que mostrar (os campos com * em `campos`); null = completa. */
export function cenaIncompleta(preset: string, t: TextosDaCena): string | null {
  const p = presetDeMotion(preset);
  if (!p) return `o preset "${preset}" não existe`;
  const faltam = [...p.campos.matchAll(/([a-z]+)\*/g)]
    .map((m) => m[1] as keyof TextosDaCena)
    .filter((k) => {
      const v = t[k];
      return Array.isArray(v) ? v.length < 2 : !v;
    });
  return faltam.length ? `${p.nome} sem ${faltam.join(', ')}` : null;
}

/** Todo o texto que a cena mostra (a conferência de números ditos usa). */
export function textoDaCena(t: TextosDaCena): string {
  return [t.kicker, t.titulo, t.detalhe, t.prefixo, t.numero, t.unidade, t.antes, t.depois, t.a, t.b, ...(t.itens ?? []), ...(t.valores ?? [])].filter(Boolean).join(' ');
}

/** Os campos que o preset usa, na ordem da descrição (os obrigatórios marcados). */
export function camposDoPreset(chave: string): Array<{ campo: keyof TextosDaCena; obrigatorio: boolean }> {
  const p = presetDeMotion(chave);
  if (!p) return [];
  const validos = new Set(['kicker', 'titulo', 'detalhe', 'numero', 'prefixo', 'unidade', 'antes', 'depois', 'a', 'b', 'itens', 'valores', 'enfase', 'icone', 'icones', 'objeto', 'rabisco', 'fundo']);
  const saida: Array<{ campo: keyof TextosDaCena; obrigatorio: boolean }> = [];
  for (const m of p.campos.matchAll(/(?:^|,\s*)([a-z]+)(\*)?/g)) {
    if (validos.has(m[1]!) && !saida.some((x) => x.campo === m[1])) saida.push({ campo: m[1] as keyof TextosDaCena, obrigatorio: !!m[2] });
  }
  return saida;
}

/** A cena editada à mão: o modelo, os textos, o elemento e atrás/na frente (o resto da cena fica). */
export interface EdicaoDaCena {
  preset?: string;
  textos?: Record<string, unknown>;
  atras?: boolean;
  ajuste?: AjusteDaCena;
}

/**
 * A cena atual com a edição aplicada. Trocar o modelo mantém os textos que
 * o novo também usa. `erro` quando falta um campo obrigatório do modelo.
 */
export function aplicarEdicaoDaCena(atual: CenaDeMotion, e: EdicaoDaCena): { cena: CenaDeMotion } | { erro: string } {
  const preset = e.preset ? presetDeMotion(e.preset) : presetDeMotion(atual.preset);
  if (!preset) return { erro: `a cena "${e.preset}" não existe` };
  const textos = lerTextosDaCena({ ...atual.textos, ...(e.textos ?? {}) });
  // Do modelo antigo, só o que o novo usa (um "antes" esquecido não aparece em outra cena).
  const usados = new Set(camposDoPreset(preset.chave).map((c) => c.campo));
  const doNovo = Object.fromEntries(Object.entries(textos).filter(([k]) => usados.has(k as keyof TextosDaCena) || k === 'rabisco')) as TextosDaCena;
  const falta = cenaIncompleta(preset.chave, doNovo);
  if (falta) return { erro: `${falta}: preencha antes de salvar` };
  const layout = layoutDoPreset(preset.chave, atual.layout);
  const ajuste = e.ajuste !== undefined ? lerAjuste(e.ajuste) : atual.ajuste;
  return {
    cena: {
      preset: preset.chave,
      textos: doNovo,
      layout,
      ...(layout === 'meio_a_meio' ? { lado: atual.lado ?? 'cima' } : {}),
      ...(layout === 'pip' ? { canto: atual.canto ?? 'inf-dir' } : {}),
      ...(typeof e.atras === 'boolean' ? { atras: e.atras } : typeof atual.atras === 'boolean' ? { atras: atual.atras } : {}),
      ...(ajuste ? { ajuste } : {}),
    },
  };
}

/** Textos de exemplo de cada modelo: as miniaturas do editor mostram a cena com eles quando a atual não serve. */
export const EXEMPLOS_DOS_PRESETS: Readonly<Record<string, TextosDaCena>> = {
  impacto: { titulo: 'Consistência', kicker: 'o segredo' },
  frase: { titulo: 'Quem posta todo dia cresce mais rápido', enfase: 'todo dia' },
  contador: { numero: '1.500', prefixo: 'R$', titulo: 'de renda extra' },
  anel: { numero: '87', titulo: 'desistem' },
  barras: { itens: ['Jan', 'Fev', 'Mar'], valores: ['12', '30', '75'], titulo: 'Vendas' },
  linha: { valores: ['200', '900', '4.000'], titulo: 'Seguidores' },
  versus: { a: 'Sem plano', b: 'Com plano' },
  antes_depois: { antes: 'Editar na mão', depois: 'A IA edita' },
  lista: { itens: ['Gancho', 'Legenda', 'Corte'], titulo: 'Três regras' },
  passos: { itens: ['Abra', 'Envie', 'Monte'], titulo: 'Como fazer' },
  citacao: { titulo: 'Feito é melhor que perfeito', kicker: 'autor' },
  termo: { titulo: 'Retenção', detalhe: 'quanto do vídeo as pessoas assistem' },
  pergunta: { titulo: 'Por que não viraliza?' },
  notificacao: { titulo: 'Nova venda', detalhe: 'R$ 97 via Pix', kicker: 'Loja' },
  selo: { titulo: 'Mito' },
  busca: { titulo: 'como editar vídeos' },
  chat: { itens: ['Quanto custa?', 'Menos que um café'] },
  alerta: { titulo: 'Não faça isso', kicker: 'Erro comum' },
  preco: { numero: '97', prefixo: 'R$', titulo: 'Curso completo' },
  ranking: { itens: ['Reels', 'TikTok', 'Shorts'] },
  rotulo: { titulo: 'Ana Souza', kicker: 'editora' },
  titulo: { titulo: 'O erro que trava você' },
  chamada: { titulo: 'Siga para a parte 2' },
  objeto: { objeto: 'foguete', titulo: 'Crescimento' },
  anotacao: { rabisco: 'seta_curva', titulo: 'olha isso' },
  icone: { icone: 'raio', titulo: 'Rápido' },
  cartaz: { titulo: 'Editor', kicker: 'O melhor' },
  numero_gigante: { numero: '66', unidade: '%' },
  placar: { a: 'Antes', b: 'Depois', valores: ['27', '66'], unidade: '%' },
  mosaico: { itens: ['Gráfico', 'Imagem', 'Mapa'], titulo: 'Recursos' },
  ladeando: { icones: ['raio', 'alvo'], a: 'Isto', b: 'Aquilo' },
  selecao: { titulo: 'RAW · sem edição' },
  hud: { titulo: 'Perspectiva' },
  profundidade: { titulo: 'Profundidade' },
  janela: { titulo: 'Abre espaço para explicar', kicker: 'App', itens: ['Pede', 'Monta', 'Revisa'] },
  linha_do_tempo: { itens: ['Abertura', 'Meio', 'Fim'], titulo: 'Timeline' },
  comentario: { titulo: 'GUIA', detalhe: 'Comenta GUIA' },
  mensagem: { titulo: 'você', detalhe: 'Aqui está o seu guia.', kicker: 'Direct' },
};

/**
 * A cena de amostra de um modelo (a miniatura do editor): a cena atual no
 * modelo, se ela tem o que ele pede; senão o exemplo dele com o título
 * atual. `faltam` diz o que a pessoa precisa preencher para usar.
 */
export function amostraDoModelo(atual: CenaDeMotion, preset: string): { cena: CenaDeMotion; faltam: string | null } {
  const r = aplicarEdicaoDaCena(atual, { preset });
  if ('cena' in r) return { cena: r.cena, faltam: null };
  const exemplo = EXEMPLOS_DOS_PRESETS[preset] ?? {};
  const titulo = atual.textos.titulo && exemplo.titulo !== undefined ? { titulo: atual.textos.titulo } : {};
  const layout = layoutDoPreset(preset, atual.layout);
  return { cena: { preset, textos: { ...exemplo, ...titulo }, layout, ...(layout === 'meio_a_meio' ? { lado: atual.lado ?? 'cima' } : {}) }, faltam: r.erro.replace(/: preencha antes de salvar$/, '') };
}
