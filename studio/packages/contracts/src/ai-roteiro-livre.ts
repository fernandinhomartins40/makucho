// ============================================================
// MAKUCHO STUDIO - Roteiro com IA por pedido livre.
//
// Antes: a pessoa escolhia tema, objetivo, público, plataforma, duração
// e tom em listas fechadas -- e só o tema chegava à IA. Agora ela
// escreve do jeito dela o que quer ("um vídeo de 30s pro Instagram
// vendendo minha mentoria pra dentistas, tom descontraído"), a IA
// entende o contexto e aplica as técnicas de retenção sozinha, e
// devolve quais técnicas usou e onde.
//
// Duas chamadas, o mesmo formato de saída:
//   gerar  pedido livre -> roteiro inteiro;
//   editar roteiro atual + pedido livre ("gancho mais forte", "encurta
//          pra 30s", "mais informal", só o bloco 2...) -> roteiro revisto
//          e uma frase do que mudou.
//
// A leitura é TOLERANTE: um papel em português ou com outro nome é
// traduzido para o código (irreconhecível: hook no 1º, cta no último,
// insight no meio), um campo a
// mais é ignorado, um texto longo é cortado. Recusar o roteiro inteiro
// por um detalhe gastaria outra chamada para receber o mesmo conteúdo.
// ============================================================

import { z } from 'zod';
import { CLIP_ROLES, FRAMEWORKS } from './vocabulary';
import type { ClipRole, Framework } from './vocabulary';

export const pedidoDeRoteiroLivreSchema = z
  .object({
    pedido: z.string().trim().min(3).max(3000),
    /** Duração alvo em segundos; ausente, a IA decide pelo pedido. */
    duracaoS: z.number().int().min(10).max(180).nullable().optional(),
  })
  .strict();

export type PedidoDeRoteiroLivre = z.infer<typeof pedidoDeRoteiroLivreSchema>;

const blocoAtualSchema = z
  .object({
    role: z.string().max(40),
    goal: z.string().max(200).optional(),
    text: z.string().max(2000),
  })
  .strict();

export const pedidoDeEdicaoDeRoteiroSchema = z
  .object({
    pedido: z.string().trim().min(2).max(2000),
    roteiro: z
      .object({
        title: z.string().max(160),
        framework: z.string().max(40).optional(),
        targetDurationMs: z.number().int().min(5_000).max(600_000).optional(),
        blocks: z.array(blocoAtualSchema).min(1).max(30),
      })
      .strict(),
    /** Índice do bloco selecionado: "isso", "esse trecho" = ele. */
    blocoSelecionado: z.number().int().min(0).max(29).nullable().optional(),
    /** A troca anterior, para "sim", "mais", "volta como estava". */
    anterior: z.object({ pedido: z.string().max(2000), resposta: z.string().max(600) }).strict().optional(),
  })
  .strict();

export type PedidoDeEdicaoDeRoteiro = z.infer<typeof pedidoDeEdicaoDeRoteiroSchema>;

export interface TecnicaAplicada {
  nome: string;
  onde: string;
}

export interface RoteiroDaIa {
  title: string;
  framework: Framework;
  duracaoAlvoS: number;
  blocks: Array<{ role: ClipRole; goal: string; text: string }>;
  tecnicas: TecnicaAplicada[];
  /** Na edição: o que mudou, em uma ou duas frases. */
  resposta: string;
  /** Na edição: cada mudança numa linha curta, para a pessoa aprovar. */
  mudancas: string[];
}

const cortar = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Minúsculas, sem acento; espaços e hífens viram "_". */
const chave = (v: unknown) =>
  typeof v === 'string'
    ? v
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[\s-]+/g, '_')
    : '';

/**
 * Nomes que o modelo usa para os papéis no lugar do código: em português,
 * com espaço, pelo passo da estrutura ("dor", "agitação", "virada"...).
 * Sem isto, tudo que não fosse o código exato virava `insight`.
 */
const SINONIMOS_DE_PAPEL: Record<string, ClipRole> = {
  gancho: 'hook', abertura: 'hook', atencao: 'hook', attention: 'hook',
  problema: 'problem', dor: 'problem', pain: 'problem', agitacao: 'problem', agitation: 'problem', agitate: 'problem', conflito: 'problem', conflict: 'problem', erro: 'problem',
  contexto: 'context', situacao: 'context', situation: 'context', historia: 'context', story: 'context', setup: 'context', cenario: 'context',
  curiosidade: 'curiosity_gap', curiosity: 'curiosity_gap', loop: 'curiosity_gap', loop_aberto: 'curiosity_gap', open_loop: 'curiosity_gap', promessa: 'curiosity_gap', promise: 'curiosity_gap',
  autoridade: 'authority', credibilidade: 'authority', credibility: 'authority',
  apresentacao: 'introduction', intro: 'introduction',
  prova: 'proof', evidencia: 'proof', evidence: 'proof', exemplo: 'proof', example: 'proof', depoimento: 'proof', testimonial: 'proof', caso: 'proof',
  ponto: 'insight', dica: 'insight', tip: 'insight', ensinamento: 'insight', argumento: 'insight', por_que: 'insight', why: 'insight', afirmacao: 'insight', claim: 'insight', point: 'insight',
  solucao: 'solution', metodo: 'solution', method: 'solution',
  virada: 'pattern_interrupt', re_gancho: 'pattern_interrupt', regancho: 'pattern_interrupt', rehook: 'pattern_interrupt', re_hook: 'pattern_interrupt', twist: 'pattern_interrupt', quebra: 'pattern_interrupt', quebra_de_padrao: 'pattern_interrupt',
  recompensa: 'payoff', entrega: 'payoff', resultado: 'payoff', result: 'payoff', licao: 'payoff', lesson: 'payoff', conclusao: 'payoff', conclusion: 'payoff', reward: 'payoff', transformacao: 'payoff',
  oferta: 'offer', venda: 'offer', produto: 'offer',
  chamada: 'cta', chamada_para_acao: 'cta', call_to_action: 'cta', acao: 'cta', fechamento: 'cta', encerramento: 'cta',
};

const ehPapel = (v: string): v is ClipRole => (CLIP_ROLES as readonly string[]).includes(v);

/** O papel pelo código, por um sinônimo ou por uma parte reconhecível ("Gancho (dor)"). */
export function normalizarPapel(v: unknown): ClipRole | null {
  const k = chave(v);
  if (!k) return null;
  if (ehPapel(k)) return k;
  if (SINONIMOS_DE_PAPEL[k]) return SINONIMOS_DE_PAPEL[k];
  for (const parte of k.split(/[^a-z]+/).filter(Boolean)) {
    if (ehPapel(parte)) return parte;
    if (SINONIMOS_DE_PAPEL[parte]) return SINONIMOS_DE_PAPEL[parte];
  }
  return null;
}

const SINONIMOS_DE_ESTRUTURA: Record<string, Framework> = {
  ensinar: 'authority_education', educacao: 'authority_education', education: 'authority_education',
  vender: 'sales', venda: 'sales', vendas: 'sales',
  historia: 'storytelling', story: 'storytelling',
  opiniao: 'viral_education', viral: 'viral_education',
  problem_agitate_solve: 'pas', dor_agitacao_solucao: 'pas',
};

export function normalizarEstrutura(v: unknown): Framework | null {
  const k = chave(v);
  if ((FRAMEWORKS as readonly string[]).includes(k)) return k as Framework;
  return SINONIMOS_DE_ESTRUTURA[k] ?? null;
}

const primeiro = (x: Record<string, unknown>, ...campos: string[]) => campos.map((c) => x[c]).find((v) => typeof v === 'string' && v.trim());

/** Lê a resposta do modelo, consertando o que dá. */
export function lerRoteiroDaIa(bruto: string): { ok: true; roteiro: RoteiroDaIa } | { ok: false; erro: string } {
  let json: unknown;
  try {
    const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    // Texto antes ou depois do objeto: fica só o objeto.
    const ini = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    json = JSON.parse(ini >= 0 && fim > ini ? limpo.slice(ini, fim + 1) : limpo);
  } catch (e) {
    return { ok: false, erro: `JSON inválido: ${e instanceof Error ? e.message : ''}` };
  }
  if (!json || typeof json !== 'object') return { ok: false, erro: 'resposta vazia' };
  let o = json as Record<string, unknown>;
  // O roteiro embrulhado ({"roteiro": {...}}).
  for (const k of ['roteiro', 'script']) {
    const dentro = o[k];
    if (dentro && typeof dentro === 'object' && !Array.isArray(dentro)) o = { ...o, ...(dentro as Record<string, unknown>) };
  }
  const blocosBrutos = ([o.blocks, o.blocos, o.trechos].find(Array.isArray) ?? []) as unknown[];
  const lidos = blocosBrutos
    .map((b) => {
      const x = (b ?? {}) as Record<string, unknown>;
      // O texto é fala: quebras de linha viram espaço, e nada de
      // didascália entre parênteses ou colchetes.
      const fala = primeiro(x, 'text', 'texto', 'fala', 'content');
      const text = typeof fala === 'string' ? fala.replace(/\s+/g, ' ').replace(/\s*[[(][^\])]{0,60}[\])]\s*$/, '').trim().slice(0, 2000) : '';
      return { papel: normalizarPapel(primeiro(x, 'role', 'papel', 'tipo', 'etapa', 'type')), goal: cortar(primeiro(x, 'goal', 'intencao', 'objetivo'), 120), text };
    })
    .filter((b) => b.text.length > 0)
    .slice(0, 12);
  if (!lidos.length) return { ok: false, erro: 'o roteiro veio sem blocos' };
  // Papel irreconhecível: o primeiro bloco abre (hook), o último fecha
  // (cta), o do meio é conteúdo.
  const blocks = lidos.map((b, i): { role: ClipRole; goal: string; text: string } => ({
    role: b.papel ?? (i === 0 ? 'hook' : i === lidos.length - 1 && lidos.length > 2 ? 'cta' : 'insight'),
    goal: b.goal,
    text: b.text,
  }));
  // Todo roteiro salvo precisa de um hook (scriptInputSchema): sem ele, o
  // roteiro da IA aparecia na tela e falhava ao salvar.
  if (!blocks.some((b) => b.role === 'hook')) blocks[0]!.role = 'hook';

  const framework = normalizarEstrutura(o.framework ?? o.estrutura);
  const duracao = Number(o.duracaoAlvoS);
  const tecnicas = (([o.tecnicas, o.techniques].find(Array.isArray) ?? []) as unknown[])
    .map((t) => {
      const x = (t ?? {}) as Record<string, unknown>;
      return { nome: cortar(x.nome, 60), onde: cortar(x.onde, 160) };
    })
    .filter((t) => t.nome)
    .slice(0, 8);

  return {
    ok: true,
    roteiro: {
      title: cortar(o.title, 160) || 'Roteiro',
      framework: framework ?? 'authority_education',
      duracaoAlvoS: Number.isFinite(duracao) ? Math.min(180, Math.max(10, Math.round(duracao))) : 45,
      blocks,
      tecnicas,
      resposta: cortar(o.resposta, 600),
      mudancas: ((Array.isArray(o.mudancas) ? o.mudancas : []) as unknown[]).map((m) => cortar(m, 200)).filter(Boolean).slice(0, 8),
    },
  };
}

/** No formato que o `scriptInputSchema` aceita (a tela salva pela rota de sempre). */
export function roteiroDaIaParaEntrada(r: RoteiroDaIa) {
  return {
    title: r.title,
    mode: 'FULL' as const,
    framework: r.framework,
    targetDurationMs: Math.min(180_000, Math.max(15_000, r.duracaoAlvoS * 1000)),
    blocks: r.blocks.map((b, i) => ({ role: b.role, goal: b.goal || undefined, text: b.text, position: i })),
  };
}

/** Os papéis e as estruturas, para o prompt (gerado do código: igual em toda chamada). */
export function vocabularioDeRoteiroParaIa(): string {
  return [
    '## Vocabulário (use EXATAMENTE estes códigos, em inglês, em `role` e `framework`)',
    '',
    'Papéis de bloco (role) -- cada bloco tem o papel do momento dele no vídeo:',
    ...CLIP_ROLES.map((r) => `- ${r}: ${SIGNIFICADO_DO_PAPEL[r]}`),
    '',
    'Estruturas (framework) e a sequência de papéis de cada uma:',
    ...FRAMEWORKS.map((f) => `- ${f}: ${SEQUENCIA_DA_ESTRUTURA[f]}`),
    '',
    'Um roteiro com todos os blocos em `insight` está ERRADO: use a sequência da estrutura escolhida.',
  ].join('\n');
}

const SIGNIFICADO_DO_PAPEL: Record<ClipRole, string> = {
  hook: 'gancho dos 3 primeiros segundos (sempre o primeiro)',
  problem: 'a dor, o erro ou o conflito; também a agitação da dor',
  context: 'situação, cenário, começo da história',
  curiosity_gap: 'loop aberto: promete algo que vem depois',
  authority: 'por que ouvir quem fala (sem inventar credencial)',
  introduction: 'apresentação curta de quem fala (raramente; nunca no começo)',
  proof: 'prova, exemplo real, caso (só o que a pessoa deu)',
  insight: 'um ponto, uma dica, um argumento, o "por quê"',
  solution: 'a solução, o método, o como fazer',
  pattern_interrupt: 're-gancho / virada no meio ("mas tem um detalhe")',
  payoff: 'a recompensa: o loop fechado, o resultado, a lição',
  offer: 'a oferta: o que a pessoa ganha e como ter',
  cta: 'chamada para ação única (sempre o último, quando houver)',
};

const SEQUENCIA_DA_ESTRUTURA: Record<Framework, string> = {
  authority_education: 'ensinar -> hook, problem, curiosity_gap, insight (1 a 3), pattern_interrupt (se > 30 s), payoff, cta',
  viral_education: 'opinião/viral -> hook (afirmação forte), insight (por quê), proof (exemplo), pattern_interrupt, payoff (conclusão), cta',
  storytelling: 'história -> hook, context (situação), problem (conflito), pattern_interrupt (virada), payoff (lição), cta',
  pas: 'dor-agitação-solução -> hook, problem (dor), problem (agitação), solution, proof, cta',
  sales: 'vender -> hook, problem (dor), problem (agitação), solution, proof, offer, cta',
};

/** O roteiro atual em poucas linhas, numerado, para o pedido de edição. */
export function roteiroAtualParaIa(p: PedidoDeEdicaoDeRoteiro): string {
  const linhas = [
    `TÍTULO: ${p.roteiro.title}`,
    p.roteiro.framework ? `ESTRUTURA ATUAL: ${p.roteiro.framework}` : '',
    `TAMANHO ATUAL: ${p.roteiro.blocks.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0)} palavras`,
    p.roteiro.targetDurationMs ? `DURAÇÃO ALVO: ${Math.round(p.roteiro.targetDurationMs / 1000)} s` : '',
    'BLOCOS (índice | papel | intenção | texto):',
    ...p.roteiro.blocks.map((b, i) => `[${i}] ${b.role}${b.goal ? ` | ${b.goal}` : ''} | ${b.text}`),
  ].filter(Boolean);
  if (p.blocoSelecionado !== null && p.blocoSelecionado !== undefined && p.roteiro.blocks[p.blocoSelecionado]) {
    linhas.push('', `BLOCO EM FOCO: [${p.blocoSelecionado}] ("isso", "esse trecho" = ele; ajuste também o que depende dele)`);
  }
  if (p.anterior) linhas.push('', `CONVERSA ANTERIOR: pedido "${p.anterior.pedido.slice(0, 300)}" -> você respondeu "${p.anterior.resposta.slice(0, 300)}"`);
  linhas.push('', `PEDIDO: ${p.pedido}`);
  return linhas.join('\n');
}
