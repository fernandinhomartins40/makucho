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
    extra: 'fita',
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
}

const LIMITES: Record<string, number> = { kicker: 32, titulo: 96, detalhe: 140, numero: 16, prefixo: 6, unidade: 14, antes: 80, depois: 80, a: 60, b: 60, enfase: 40, icone: 20 };

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
  { chave: 'lista', nome: 'Lista com checks', quando: 'três ou mais itens enumerados', campos: 'itens* (2-5, curtos), titulo', layouts: ['meio_a_meio', 'pip', 'tela_cheia'] },
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
  { chave: 'ranking', nome: 'Ranking', quando: 'um top 3, top 5, os melhores ou piores em ordem', campos: 'itens* (do 1º ao último, 2-5), titulo', layouts: ['meio_a_meio', 'pip', 'tela_cheia'] },
  { chave: 'rotulo', nome: 'Rótulo (lower third)', quando: 'apresentar quem fala, um lugar, uma marca ou o tema do trecho', campos: 'titulo*, kicker', layouts: ['cartao'] },
  { chave: 'icone', nome: 'Ícone grande', quando: 'um conceito simples que um ícone resume', campos: `icone* (${'dinheiro|tempo|alvo|raio|cadeado|grafico|pessoa|check|x|lampada|estrela|fogo|alerta|coracao|mensagem|celular|calendario|foguete|seta|escudo'}), titulo*, detalhe`, layouts: ['meio_a_meio', 'cartao', 'pip', 'tela_cheia'] },
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
  return PRESETS_DE_MOTION.map((p) => `- ${p.chave} [${p.layouts.join('|')}]: ${p.quando}. Campos: ${p.campos}.`).join('\n');
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

/** Um ícone de traço que se desenha a partir de `t` (cada traço com pathLength 1). */
function icone(nome: string | undefined, t: number, d = 0.9, classe = 'ic'): string {
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
        return `<li data-in="esq" data-t="${t}">${icone('check', t + 0.12, 0.45, 'ic li-ic')}<span>${esc(it)}</span></li>`;
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
    const linhasHtml = itens.map((it, i) => `<li class="${i === 0 ? 'topo' : ''}" data-in="${i === 0 ? 'bate' : 'dir'}" data-t="${tempos[i]}"><b>${i + 1}º</b><span>${esc(it)}</span></li>`).join('');
    return { html: `<div class="mg mg-esq${c.sobre ? ' mg-card' : ''}">${x.titulo ? `<div class="mg-t t-s" style="${c.corpo('t-s', x.titulo)}" data-in="sobe" data-t="0.05">${esc(x.titulo)}</div>` : ''}<ol class="mg-rank">${linhasHtml}</ol></div>` };
  },
  rotulo: (x, c) => {
    const t0 = 0.1;
    return {
      html: `<div class="mg mg-rotulo"><div class="rot-caixa mg-card" data-in="esq" data-t="${t0}"><i class="rot-barra" data-in="cresce" data-t="${t0}" data-d="0.35"></i><div><div class="mg-t t-s" style="${c.corpo('t-s', x.titulo ?? '')}" data-in="mascara-solo" data-t="${r2(t0 + 0.15)}">${esc(x.titulo ?? '')}</div>${x.kicker ? `<div class="rot-k" data-in="sobe" data-t="${r2(t0 + 0.35)}">${esc(x.kicker)}</div>` : ''}</div></div></div>`,
    };
  },
  icone: (x, c) => {
    const ti = c.t(x.titulo, 0.15, 0.1);
    return {
      html: `<div class="mg mg-icone${c.sobre ? ' mg-card' : ''}"><div class="ico-roda" data-in="escala" data-t="0.05"><svg class="ico-anel" viewBox="0 0 100 100" aria-hidden="true"><circle pathLength="1" cx="50" cy="50" r="46" data-in="desenha" data-t="0.05" data-d="0.7"/></svg>${icone(x.icone, 0.2, 0.9, 'ic ico-grande')}</div><div class="ico-txt"><div class="mg-t t-m" style="${c.corpo('t-m', x.titulo ?? '', c.alto ? 1 : 0.5)}" data-in="sobe" data-t="${ti}">${c.marcar(x.titulo ?? '', x.enfase, ti)}</div>${detalhe(x.detalhe, c.t(x.detalhe, ti + 0.5))}</div></div>`,
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
${c.layout === 'pip' || c.layout === 'tela_cheia' ? '.mg-anel, .mg-icone { flex-direction: column; align-items: flex-start; } .anel { width: min(64cqw, 34cqh); } .ico-roda { width: min(52cqw, 30cqh); }' : ''}
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
  extra: { paleta?: string; ideia?: string } = {},
): ComposicaoHtml {
  const v = visualDeMotion(visualChave) ?? VISUAIS_DE_MOTION[0]!;
  const preset = presetDeMotion(cena.preset) ?? PRESETS_DE_MOTION[0]!;
  const layout = layoutDoPreset(preset.chave, cena.layout);
  const sobre = layout === 'cartao';
  const D = Math.max(1.5, duracaoS);
  const c: Ctx = {
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
  };
  const montado = MONTADORES[preset.chave]!(cena.textos, c);
  const fundo = sobre
    ? ''
    : `<div class="mg-fundo">${v.brilho ? '<i class="mg-brilho"></i><i class="mg-brilho b2"></i>' : ''}<div class="mg-tex"></div>${v.extra === 'cinema' ? '<i class="mg-faixa f1"></i><i class="mg-faixa f2"></i>' : ''}</div>`;
  const lado = layout === 'meio_a_meio' ? (cena.lado === 'baixo' ? 'baixo' : 'cima') : undefined;
  const briefing = JSON.stringify({
    tipo: preset.chave,
    ideia: (extra.ideia ?? preset.nome).slice(0, 300),
    conteudo: JSON.stringify(cena.textos).slice(0, 900),
    motion: { preset: preset.chave, textos: cena.textos },
  });
  return {
    html: `${fundo}${emCaixa(montado.html)}`,
    css: `${cssDaCena(v, { sobre, layout })}${montado.css ?? ''}`,
    script: scriptDaCena(v, D, layout, lado, sobre, montado.script ?? ''),
    layout,
    ...(lado ? { lado } : {}),
    ...(layout === 'pip' ? { canto: cena.canto ?? 'inf-dir' } : {}),
    semFundo: true,
    titulo: `${preset.nome}: ${cena.textos.titulo ?? cena.textos.numero ?? cena.textos.a ?? cena.textos.antes ?? cena.textos.itens?.[0] ?? ''}`.slice(0, 60),
    estilo: v.chave,
    ...(extra.paleta ? { paleta: extra.paleta } : {}),
    ...(briefing.length <= 2000 ? { briefing } : { briefing: JSON.stringify({ tipo: preset.chave, ideia: preset.nome, conteudo: '', motion: { preset: preset.chave, textos: { titulo: cena.textos.titulo } } }) }),
  };
}

/** A cena de motion guardada numa animação (para remontar em outro visual, paleta ou lugar sem IA). */
export function cenaDaComposicao(c: Pick<ComposicaoHtml, 'briefing' | 'layout' | 'lado' | 'canto'>): CenaDeMotion | null {
  try {
    const b = JSON.parse(c.briefing ?? '') as { motion?: { preset?: unknown; textos?: unknown } };
    const preset = presetDeMotion(String(b.motion?.preset ?? ''));
    if (!preset) return null;
    return { preset: preset.chave, textos: lerTextosDaCena(b.motion?.textos), layout: c.layout as LayoutDoPreset, ...(c.lado ? { lado: c.lado } : {}), ...(c.canto ? { canto: c.canto } : {}) };
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
