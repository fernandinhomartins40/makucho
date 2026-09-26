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
// A leitura é TOLERANTE: um papel desconhecido vira `insight`, um campo a
// mais é ignorado, um texto longo é cortado. Recusar o roteiro inteiro
// por um detalhe gastaria outra chamada para receber o mesmo conteúdo.
// ============================================================

import { z } from 'zod';
import { CLIP_ROLES, FRAMEWORKS, clipRoleSchema, frameworkSchema } from './vocabulary';
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
}

const cortar = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Lê a resposta do modelo, consertando o que dá. */
export function lerRoteiroDaIa(bruto: string): { ok: true; roteiro: RoteiroDaIa } | { ok: false; erro: string } {
  let json: unknown;
  try {
    json = JSON.parse(bruto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
  } catch (e) {
    return { ok: false, erro: `JSON inválido: ${e instanceof Error ? e.message : ''}` };
  }
  if (!json || typeof json !== 'object') return { ok: false, erro: 'resposta vazia' };
  const o = json as Record<string, unknown>;
  const blocosBrutos = Array.isArray(o.blocks) ? o.blocks : [];
  const blocks = blocosBrutos
    .map((b) => {
      const x = (b ?? {}) as Record<string, unknown>;
      const role = clipRoleSchema.safeParse(x.role);
      // O texto é fala: quebras de linha viram espaço, e nada de
      // didascália entre parênteses ou colchetes.
      const text = typeof x.text === 'string' ? x.text.replace(/\s+/g, ' ').replace(/\s*[[(][^\])]{0,60}[\])]\s*$/, '').trim().slice(0, 2000) : '';
      return { role: role.success ? role.data : ('insight' as ClipRole), goal: cortar(x.goal, 120), text };
    })
    .filter((b) => b.text.length > 0)
    .slice(0, 12);
  if (!blocks.length) return { ok: false, erro: 'o roteiro veio sem blocos' };

  const framework = frameworkSchema.safeParse(o.framework);
  const duracao = Number(o.duracaoAlvoS);
  const tecnicas = (Array.isArray(o.tecnicas) ? o.tecnicas : [])
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
      framework: framework.success ? framework.data : 'authority_education',
      duracaoAlvoS: Number.isFinite(duracao) ? Math.min(180, Math.max(10, Math.round(duracao))) : 45,
      blocks,
      tecnicas,
      resposta: cortar(o.resposta, 600),
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
  return [`Papéis de bloco (role): ${CLIP_ROLES.join(', ')}`, `Estruturas (framework): ${FRAMEWORKS.join(', ')}`].join('\n');
}

/** O roteiro atual em poucas linhas, numerado, para o pedido de edição. */
export function roteiroAtualParaIa(p: PedidoDeEdicaoDeRoteiro): string {
  const linhas = [
    `TÍTULO: ${p.roteiro.title}`,
    p.roteiro.targetDurationMs ? `DURAÇÃO ALVO: ${Math.round(p.roteiro.targetDurationMs / 1000)} s` : '',
    'BLOCOS (índice | papel | intenção | texto):',
    ...p.roteiro.blocks.map((b, i) => `[${i}] ${b.role}${b.goal ? ` | ${b.goal}` : ''} | ${b.text}`),
  ].filter(Boolean);
  if (p.blocoSelecionado !== null && p.blocoSelecionado !== undefined && p.roteiro.blocks[p.blocoSelecionado]) {
    linhas.push('', `BLOCO SELECIONADO: [${p.blocoSelecionado}] ("isso", "esse trecho", "este bloco" = ele)`);
  }
  if (p.anterior) linhas.push('', `CONVERSA ANTERIOR: pedido "${p.anterior.pedido.slice(0, 300)}" -> você respondeu "${p.anterior.resposta.slice(0, 300)}"`);
  linhas.push('', `PEDIDO: ${p.pedido}`);
  return linhas.join('\n');
}
