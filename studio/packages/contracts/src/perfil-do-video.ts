// ============================================================
// MAKUCHO STUDIO - O perfil do vídeo: a análise do que foi ENVIADO.
//
// Antes de a IA dirigir, o Studio mede o vídeo -- sem gastar token:
//   - como a pessoa fala (palavras por minuto, pausas);
//   - o que a fala TEM e em que segundo (número dito, lista, passo a
//     passo, comparação, pergunta, termo, frase de peso);
//   - que tipo de conteúdo é (dica, tutorial, história, oferta...);
//   - o que a imagem mostra (onde está o rosto, luz, cores) -- esta
//     parte vem de uma olhada da IA com visão nos quadros.
// Do perfil sai a RECEITA: quantas cenas o vídeo comporta, que técnicas
// de motion graphics têm evidência na fala (com os instantes), que
// estilos combinam e onde a cena cabe no quadro.
//
// É o que alinha as etapas: a direção das animações, o diretor do vídeo
// e o relatório no editor leem o MESMO perfil. E é o que separa uma
// direção específica de uma vaga -- a IA recebe "há um número dito aos
// 12,4 s e uma lista de três itens aos 22 s", não "seja criativo".
//
// As contas de ritmo seguem a skill talking-head-recut do HyperFrames
// (segundos por cena pela duração, vezes a densidade).
// ============================================================

import { numerosDoTexto, type PalavraNoTempo } from './direcao-visual';

export const TIPOS_DE_SINAL = ['numero', 'lista', 'passos', 'comparacao', 'pergunta', 'termo', 'enfase'] as const;
export type TipoDeSinal = (typeof TIPOS_DE_SINAL)[number];

/** Algo que a fala tem e que pede imagem, com o instante em que é dito. */
export interface SinalDaFala {
  tipo: TipoDeSinal;
  /** Segundo do vídeo em que começa. */
  s: number;
  /** As palavras da fala (literais). */
  trecho: string;
}

export const FORMATOS_DE_CONTEUDO = ['dica_rapida', 'tutorial', 'explicacao', 'historia', 'opiniao', 'oferta', 'depoimento'] as const;
export type FormatoDeConteudo = (typeof FORMATOS_DE_CONTEUDO)[number];

export const NOME_DO_FORMATO: Record<FormatoDeConteudo, string> = {
  dica_rapida: 'dica rápida',
  tutorial: 'tutorial',
  explicacao: 'explicação',
  historia: 'história',
  opiniao: 'opinião',
  oferta: 'oferta',
  depoimento: 'depoimento',
};

/** O que a IA com visão viu nos quadros do vídeo enviado. */
export interface OlharDoVideo {
  rosto: 'em_cima' | 'no_centro' | 'embaixo' | 'sem_rosto';
  luz: 'clara' | 'media' | 'escura';
  /** Até três cores que dominam a imagem (hex). */
  cores: string[];
  /** O ambiente, em poucas palavras ("escritório", "cozinha", "loja de roupas"). */
  ambiente: string;
}

export interface TecnicaSugerida {
  /** Chave de TECNICAS_DE_CENA. */
  tecnica: string;
  /** A evidência na fala. */
  porque: string;
  /** Os segundos do vídeo em que a evidência aparece. */
  momentos: number[];
}

export interface PerfilDoVideo {
  duracaoS: number;
  palavrasPorMinuto: number;
  ritmo: 'calmo' | 'medio' | 'acelerado';
  /** Quanta coisa "mostrável" a fala tem por minuto. */
  densidade: 'baixa' | 'media' | 'alta';
  formato: FormatoDeConteudo;
  energia: 'baixa' | 'media' | 'alta';
  sinais: SinalDaFala[];
  olhar?: OlharDoVideo;
  receita: {
    /** Um ponto de partida, não uma cota. */
    segundosPorCena: number;
    cenasSugeridas: number;
    tecnicas: TecnicaSugerida[];
    /** Chaves do catálogo de estilos que combinam com o tom (referências). */
    estilos: string[];
    fundo: 'claro' | 'escuro';
    /** No meio a meio, onde a cena cabe sem brigar com o rosto. */
    ladoDaCena?: 'cima' | 'baixo';
  };
}

// ---------- Leitura da fala ----------

const limpa = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%$?]+/g, '');

const UNIDADES_DE_MEDIDA = new Set(['porcento', 'reais', 'real', 'mil', 'milhao', 'milhoes', 'bilhao', 'bilhoes', 'anos', 'ano', 'meses', 'mes', 'dias', 'dia', 'horas', 'hora', 'minutos', 'segundos', 'vezes', 'x', 'clientes', 'pessoas', 'vendas', 'quilos', 'kg', 'km', 'metros']);
const COLA_DE_NUMERO = new Set(['e', 'mil', 'milhao', 'milhoes', 'bilhao', 'bilhoes', 'virgula', 'ponto', 'por', 'cento']);
const ORDINAIS = new Set(['primeiro', 'primeira', 'segundo', 'segunda', 'terceiro', 'terceira', 'quarto', 'quarta', 'quinto', 'quinta']);
const COISAS_CONTAVEIS = new Set(['dicas', 'coisas', 'erros', 'passos', 'motivos', 'pontos', 'formas', 'maneiras', 'tipos', 'razoes', 'segredos', 'sinais', 'regras', 'etapas', 'ideias', 'licoes', 'habitos', 'ferramentas', 'estrategias']);
const DE_PASSO = new Set(['passo', 'etapa', 'depois', 'seguida', 'entao', 'clica', 'clique', 'abre', 'abra', 'selecione', 'seleciona', 'digite', 'digita', 'ultimo', 'fim']);
const DE_PESO = new Set(['segredo', 'verdade', 'problema', 'erro', 'ninguem', 'nunca', 'sempre', 'atencao', 'cuidado', 'importante', 'principal', 'unico', 'unica', 'maior', 'pior', 'melhor', 'jamais', 'tudo', 'nada']);
const DE_OFERTA = new Set(['promocao', 'desconto', 'oferta', 'reais', 'preco', 'frete', 'gratis', 'compre', 'garanta', 'aproveite', 'parcelado', 'estoque', 'cupom']);
const DE_HISTORIA = new Set(['eu', 'minha', 'meu', 'quando', 'ai', 'fui', 'estava', 'era', 'tinha', 'foi', 'lembro', 'dia', 'aconteceu', 'senti', 'descobri', 'comecei']);

const ehNumero = (limpaDaPalavra: string) => /\d/.test(limpaDaPalavra) || numerosDoTexto(limpaDaPalavra).length > 0;

/**
 * Os sinais da fala: o que ela tem de "mostrável" e em que segundo. Regras
 * simples e conservadoras -- um sinal a menos custa pouco (a IA lê a fala
 * inteira e pode achar outros); um sinal falso mandaria a IA animar o que
 * não existe.
 */
export function sinaisDaFala(palavras: readonly PalavraNoTempo[]): SinalDaFala[] {
  const p = palavras.map((x) => ({ s: x.s, bruto: x.texto, l: limpa(x.texto) }));
  const saida: SinalDaFala[] = [];
  const trecho = (de: number, ate: number) => p.slice(Math.max(0, de), Math.min(p.length, ate)).map((x) => x.bruto).join(' ');
  const pondo = (tipo: TipoDeSinal, i: number, de: number, ate: number, respiroS: number) => {
    const s = p[i]!.s;
    if (saida.some((x) => x.tipo === tipo && Math.abs(x.s - s) < respiroS)) return;
    saida.push({ tipo, s: Math.round(s * 100) / 100, trecho: trecho(de, ate).slice(0, 90) });
  };

  for (let i = 0; i < p.length; i += 1) {
    const w = p[i]!.l;
    if (!w) continue;
    const proxima = p[i + 1]?.l ?? '';
    const depois = p[i + 2]?.l ?? '';

    // Número dito: dígito, por extenso acima de dez, ou seguido de unidade
    // ("três vezes", "dois anos"). "um"/"uma" soltos são artigo, não dado.
    if (ehNumero(w)) {
      let fim = i + 1;
      while (fim < p.length && (ehNumero(p[fim]!.l) || COLA_DE_NUMERO.has(p[fim]!.l)) && fim - i < 7) fim += 1;
      const grupo = trecho(i, fim);
      const valores = numerosDoTexto(grupo);
      const unidade = p[fim]?.l ?? '';
      const contavel = COISAS_CONTAVEIS.has(unidade);
      const ehDado = /\d|%/.test(grupo) || valores.some((v) => v > 10) || UNIDADES_DE_MEDIDA.has(unidade) || /cento/.test(limpa(grupo));
      if (contavel) pondo('lista', i, i, fim + 1, 8);
      else if (ehDado) pondo('numero', i, Math.max(0, i - 2), fim + 2, 2.5);
      i = fim - 1;
      continue;
    }

    // Enumeração: dois ordinais perto um do outro ("primeiro... segundo...").
    if (ORDINAIS.has(w)) {
      const outro = p.findIndex((x, k) => k > i && x.s - p[i]!.s < 40 && ORDINAIS.has(x.l) && x.l !== w);
      if (outro > 0) pondo(proxima === 'passo' || p[outro + 1]?.l === 'passo' ? 'passos' : 'lista', i, i, i + 6, 25);
    }

    // Sequência de ações: "passo", ou três marcas de procedimento em 20 s.
    if (w === 'passo' || (DE_PASSO.has(w) && p.filter((x) => x.s >= p[i]!.s && x.s - p[i]!.s < 20 && DE_PASSO.has(x.l)).length >= 3)) pondo('passos', i, i, i + 6, 25);

    // Dois lados.
    const antesEDepois = w === 'antes' && p.some((x, k) => k > i && x.s - p[i]!.s < 12 && x.l === 'depois');
    const erradoECerto = (w === 'errado' || w === 'errada') && p.some((x, k) => k > i && x.s - p[i]!.s < 15 && (x.l === 'certo' || x.l === 'certa'));
    const emVezDe = (w === 'em' && proxima === 'vez' && depois === 'de') || (w === 'ao' && proxima === 'inves') || w === 'versus' || (w === 'diferenca' && proxima === 'entre');
    const maisQue = (w === 'melhor' || w === 'pior' || w === 'maior' || w === 'menor') && (proxima === 'que' || proxima === 'do');
    if (antesEDepois || erradoECerto || emVezDe || maisQue) pondo('comparacao', i, Math.max(0, i - 2), i + 7, 12);

    // Pergunta (o Whisper pontua).
    if (p[i]!.bruto.trim().endsWith('?')) {
      let de = i;
      while (de > 0 && i - de < 16 && !/[.!?]$/.test(p[de - 1]!.bruto.trim())) de -= 1;
      pondo('pergunta', de, de, i + 1, 6);
    }

    // Termo: sigla em maiúsculas ou "chama", "significa", "conhecido como".
    const sigla = /^[A-Z0-9]{2,6}$/.test(p[i]!.bruto.replace(/[^A-Za-z0-9]/g, '')) && /[A-Z]/.test(p[i]!.bruto) && !ehNumero(w);
    if (sigla || w === 'significa' || ((w === 'chama' || w === 'chamado' || w === 'chamada') && proxima !== '') || (w === 'conhecido' && proxima === 'como')) pondo('termo', i, Math.max(0, i - 3), i + 4, 10);

    // Frase de peso.
    if (DE_PESO.has(w) && (p[i - 1]?.l === 'o' || p[i - 1]?.l === 'a' || p[i - 1]?.l === 'mais' || w === 'nunca' || w === 'ninguem' || w === 'jamais')) pondo('enfase', i, Math.max(0, i - 2), i + 5, 8);
  }
  return saida.sort((a, b) => a.s - b.s);
}

// ---------- O perfil ----------

const FORMATO_DA_ESTRUTURA: Record<string, FormatoDeConteudo> = {
  tutorial: 'tutorial',
  historia: 'historia',
  opiniao_polemica: 'opiniao',
  topicos_numerados: 'dica_rapida',
  antes_depois: 'explicacao',
  problema_solucao: 'explicacao',
  gancho_promessa_entrega: 'dica_rapida',
  loop: 'dica_rapida',
};
const FORMATO_DO_TIPO: Record<string, FormatoDeConteudo> = { produto: 'oferta', promocao: 'oferta', tutorial: 'tutorial', depoimento: 'depoimento', bastidores: 'historia' };

/** Estilos do catálogo (ESTILOS_DE_ANIMACAO) que combinam com cada formato, do mais sóbrio ao mais enérgico. */
const ESTILOS_DO_FORMATO: Record<FormatoDeConteudo, { claro: string[]; escuro: string[] }> = {
  dica_rapida: { claro: ['xhs', 'geom', 'blockframe'], escuro: ['maximalist-type', 'swiss-pulse', 'deconstructed'] },
  tutorial: { claro: ['whiteboard', 'liquid-glass', 'cobalt-grid'], escuro: ['tecnologia', 'swiss-pulse', 'terminal'] },
  explicacao: { claro: ['swiss', 'academic', 'audit'], escuro: ['swiss-pulse', 'data-drift', 'liquid-glass-noite'] },
  historia: { claro: ['soft-signal', 'minimal', 'cartesian'], escuro: ['spotlight', 'shadow-cut', 'editorial-forest'] },
  opiniao: { claro: ['editorial', 'bold-poster', 'biennale-yellow'], escuro: ['broadside', 'shadow-cut', 'deconstructed'] },
  oferta: { claro: ['folk-frequency', 'blockframe', 'geom'], escuro: ['maximalist-type', 'velvet-standard', 'liquid-glass-noite'] },
  depoimento: { claro: ['soft-signal', 'capsule', 'minimal'], escuro: ['velvet-standard', 'spotlight', 'editorial-forest'] },
};

/** Segundos por cena pela duração (talking-head-recut): vídeo curto aguenta ritmo mais cerrado. */
function paceBase(duracaoS: number): number {
  if (duracaoS <= 30) return 6;
  if (duracaoS <= 60) return 8;
  if (duracaoS <= 120) return 11;
  return 14;
}

export interface EntradaDoPerfil {
  palavras: readonly PalavraNoTempo[];
  duracaoS: number;
  /** A estrutura que a seleção de trechos entendeu (analysis.structure). */
  estrutura?: string | null;
  /** O tipo de vídeo do projeto (adaptativo.ts). */
  tipoDeVideo?: string | null;
  olhar?: OlharDoVideo | null;
}

export function perfilDoVideo(e: EntradaDoPerfil): PerfilDoVideo {
  const duracaoS = Math.max(1, e.duracaoS);
  const sinais = sinaisDaFala(e.palavras);
  const limpas = e.palavras.map((x) => limpa(x.texto)).filter(Boolean);
  const palavrasPorMinuto = Math.round((limpas.length / duracaoS) * 60);
  const ritmo: PerfilDoVideo['ritmo'] = palavrasPorMinuto < 130 ? 'calmo' : palavrasPorMinuto <= 170 ? 'medio' : 'acelerado';

  const fortes = sinais.filter((s) => s.tipo !== 'enfase' && s.tipo !== 'pergunta');
  const porMinuto = (fortes.length / duracaoS) * 60;
  const densidade: PerfilDoVideo['densidade'] = porMinuto < 1.5 ? 'baixa' : porMinuto < 4 ? 'media' : 'alta';

  const conta = (conjunto: ReadonlySet<string>) => limpas.filter((w) => conjunto.has(w)).length / Math.max(1, limpas.length);
  const tem = (t: TipoDeSinal) => sinais.some((s) => s.tipo === t);
  const formato: FormatoDeConteudo =
    FORMATO_DO_TIPO[e.tipoDeVideo ?? ''] ??
    (conta(DE_OFERTA) > 0.02
      ? 'oferta'
      : tem('passos')
        ? 'tutorial'
        : FORMATO_DA_ESTRUTURA[e.estrutura ?? ''] ?? (conta(DE_HISTORIA) > 0.11 && densidade === 'baixa' ? 'historia' : tem('lista') ? 'dica_rapida' : 'explicacao'));

  const energia: PerfilDoVideo['energia'] =
    formato === 'historia' || formato === 'depoimento' ? (ritmo === 'acelerado' ? 'media' : 'baixa') : ritmo === 'acelerado' || formato === 'oferta' || formato === 'dica_rapida' ? 'alta' : ritmo === 'calmo' ? 'baixa' : 'media';

  // Quantas cenas o vídeo comporta: ritmo pela duração, vezes a densidade.
  const segundosPorCena = Math.round(paceBase(duracaoS) * (densidade === 'alta' ? 0.7 : densidade === 'baixa' ? 1.5 : 1) * 10) / 10;
  const piso = formato === 'historia' || formato === 'depoimento' ? 1 : 2;
  const cenasSugeridas = Math.max(piso, Math.min(14, Math.round(duracaoS / segundosPorCena)));

  // As técnicas com evidência na fala, na ordem em que aparecem.
  const momentos = (t: TipoDeSinal) => sinais.filter((s) => s.tipo === t).map((s) => s.s);
  const tecnicas: TecnicaSugerida[] = [];
  const sugerir = (tecnica: string, porque: string, ms: number[]) => {
    if (ms.length) tecnicas.push({ tecnica, porque, momentos: ms.slice(0, 6) });
  };
  const numeros = momentos('numero');
  // Dois números ditos perto um do outro são um gráfico; um só é um dado.
  const emPar = numeros.filter((s, i) => numeros.some((o, k) => k !== i && Math.abs(o - s) < 12));
  sugerir('grafico', 'dois ou mais números ditos em sequência', emPar.filter((s, i) => i === 0 || s - emPar[i - 1]! > 12));
  sugerir('dado_em_destaque', 'número dito na fala', numeros.filter((s) => !emPar.includes(s)));
  sugerir('lista_viva', 'itens enumerados na fala', momentos('lista'));
  sugerir('passo_a_passo', 'sequência de ações na fala', momentos('passos'));
  sugerir('comparacao', 'dois lados ditos na fala', momentos('comparacao'));
  sugerir('definicao', 'termo ou sigla que pede explicação', momentos('termo'));
  sugerir('pergunta', 'pergunta dita na fala', momentos('pergunta'));
  sugerir('tipografia_cinetica', 'frase de peso na fala', momentos('enfase'));
  if (formato === 'tutorial' && !tecnicas.some((t) => t.tecnica === 'interface_simulada')) tecnicas.push({ tecnica: 'interface_simulada', porque: 'tutorial: mostrar a tela ou o gesto de que a fala trata', momentos: momentos('passos').slice(0, 2) });
  if ((formato === 'opiniao' || formato === 'historia') && !momentos('enfase').length) tecnicas.push({ tecnica: 'citacao', porque: `${NOME_DO_FORMATO[formato]}: a frase que resume a ideia, uma vez`, momentos: [] });

  const fundo: 'claro' | 'escuro' = e.olhar ? (e.olhar.luz === 'clara' ? 'claro' : 'escuro') : formato === 'historia' || formato === 'depoimento' ? 'claro' : 'escuro';
  const doFormato = ESTILOS_DO_FORMATO[formato][fundo];
  // Energia alta: do mais enérgico para o mais sóbrio.
  const estilos = energia === 'alta' ? [...doFormato].reverse() : doFormato;
  const ladoDaCena = e.olhar?.rosto === 'em_cima' ? ('baixo' as const) : e.olhar?.rosto === 'embaixo' ? ('cima' as const) : undefined;

  return {
    duracaoS: Math.round(duracaoS * 10) / 10,
    palavrasPorMinuto,
    ritmo,
    densidade,
    formato,
    energia,
    sinais,
    ...(e.olhar ? { olhar: e.olhar } : {}),
    receita: { segundosPorCena, cenasSugeridas, tecnicas, estilos, fundo, ...(ladoDaCena ? { ladoDaCena } : {}) },
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Lê o que a IA com visão respondeu sobre os quadros (JSON); o que vier torto cai no neutro. */
export function lerOlhar(texto: string): OlharDoVideo | null {
  const limpo = texto.replace(/```(?:json)?/g, '');
  const i = limpo.indexOf('{');
  const f = limpo.lastIndexOf('}');
  if (i < 0 || f <= i) return null;
  try {
    const j = JSON.parse(limpo.slice(i, f + 1)) as Record<string, unknown>;
    const um = <T extends string>(v: unknown, aceitos: readonly T[], padrao: T): T => (aceitos.includes(v as T) ? (v as T) : padrao);
    return {
      rosto: um(j.rosto, ['em_cima', 'no_centro', 'embaixo', 'sem_rosto'] as const, 'no_centro'),
      luz: um(j.luz, ['clara', 'media', 'escura'] as const, 'media'),
      cores: (Array.isArray(j.cores) ? j.cores : []).filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, 3),
      ambiente: typeof j.ambiente === 'string' ? j.ambiente.trim().slice(0, 80) : '',
    };
  } catch {
    return null;
  }
}

const s1 = (n: number) => n.toFixed(1);

/** O perfil em texto, para a IA (direção das animações e diretor do vídeo). */
export function textoDoPerfil(p: PerfilDoVideo): string {
  const NOME_DO_SINAL: Record<TipoDeSinal, string> = { numero: 'número dito', lista: 'enumeração', passos: 'sequência de ações', comparacao: 'dois lados', pergunta: 'pergunta', termo: 'termo', enfase: 'frase de peso' };
  const linhas = [
    `ANÁLISE DO VÍDEO ENVIADO (medida pelo Studio; os instantes são do vídeo final):`,
    `- ${s1(p.duracaoS)} s; fala ${p.ritmo} (${p.palavrasPorMinuto} palavras por minuto); conteúdo: ${NOME_DO_FORMATO[p.formato]}; energia ${p.energia}; densidade de informação ${p.densidade}.`,
  ];
  if (p.olhar) {
    const rosto = { em_cima: 'rosto na parte de cima do quadro', no_centro: 'rosto no centro do quadro', embaixo: 'rosto na parte de baixo do quadro', sem_rosto: 'sem rosto em quadro' }[p.olhar.rosto];
    linhas.push(`- Imagem: ${rosto}; luz ${p.olhar.luz}${p.olhar.ambiente ? `; ambiente: ${p.olhar.ambiente}` : ''}${p.olhar.cores.length ? `; cores que dominam: ${p.olhar.cores.join(' ')}` : ''}.`);
  }
  linhas.push(
    p.sinais.length
      ? `- O que a fala tem de mostrável:\n${p.sinais
          .slice(0, 24)
          .map((s) => `  ${s1(s.s)} s  ${NOME_DO_SINAL[s.tipo]}: "${s.trecho}"`)
          .join('\n')}`
      : '- A fala não tem número, enumeração, passo a passo nem comparação: é um vídeo de fala corrida (poucas cenas, tipografia e ênfase, ou nenhuma).',
  );
  const r = p.receita;
  linhas.push(`RECEITA (ponto de partida; você decide):`);
  linhas.push(`- Ritmo: cerca de uma cena a cada ${s1(r.segundosPorCena)} s -- por volta de ${r.cenasSugeridas} ${r.cenasSugeridas === 1 ? 'cena' : 'cenas'}.`);
  if (r.tecnicas.length) linhas.push(`- Técnicas com evidência na fala:\n${r.tecnicas.map((t) => `  ${t.tecnica}: ${t.porque}${t.momentos.length ? ` (aos ${t.momentos.map(s1).join(', ')} s)` : ''}`).join('\n')}`);
  linhas.push(`- Fundo ${r.fundo} combina com a imagem${r.ladoDaCena ? `; no meio_a_meio, a cena fica ${r.ladoDaCena === 'baixo' ? 'embaixo (o rosto está em cima)' : 'em cima (o rosto está embaixo)'}` : ''}.`);
  return linhas.join('\n');
}

/** O perfil em uma linha, para a pessoa (o relatório no editor). */
export function resumoDoPerfil(p: PerfilDoVideo): string {
  const conta = (t: TipoDeSinal) => p.sinais.filter((s) => s.tipo === t).length;
  const achados = [
    [conta('numero'), 'número', 'números'],
    [conta('lista'), 'lista', 'listas'],
    [conta('passos'), 'passo a passo', 'passos a passo'],
    [conta('comparacao'), 'comparação', 'comparações'],
    [conta('pergunta'), 'pergunta', 'perguntas'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`);
  return `${NOME_DO_FORMATO[p.formato]}, fala ${p.ritmo} (${p.palavrasPorMinuto} palavras/min), energia ${p.energia}${achados.length ? `; a fala tem ${achados.join(', ')}` : '; fala corrida, sem dados para mostrar'}`;
}
