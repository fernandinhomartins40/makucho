// ============================================================
// Pacotes de estilo: um clique que aplica legenda, transições, zoom, cor,
// efeitos de tela e sons -- cada um como item SEPARADO no plano, que se
// desfaz, troca ou apaga como qualquer outro.
//
// "Salvar como meu estilo" guarda os ingredientes do vídeo atual no Kit de
// marca (`preferenciasDeVideoSchema.estilosSalvos`). A recomendação usa o
// tipo de vídeo que a IA já classificou (`framework` e o entendimento).
// ============================================================

import { z } from 'zod';
import type { EditPlanV1 } from './edit-plan';
import type { TimelineOperation } from './timeline';
import { agendaDoPlano } from './agenda';
import { corDoTrechoSchema, corEhNeutra } from './cor';
import { tipoDeTransicaoSchema } from './edit-plan';
import { DURACAO_PADRAO_DA_TRANSICAO, aplicarOperacoes } from './timeline';
import { sugerirSons, type IntervaloDeFala } from './protecao-da-fala';
import type { TipoDeEfeitoDeTela } from './efeitos-de-tela';

export const ingredientesDoPacoteSchema = z
  .object({
    legenda: z
      .object({
        styleId: z.string().max(40),
        blockEntrance: z.enum(['nenhuma', 'surgir', 'pop', 'subir', 'zoom', 'desfocar']).optional(),
      })
      .strict()
      .optional(),
    transicao: z.object({ tipo: tipoDeTransicaoSchema, alternar: z.boolean().optional() }).strict().optional(),
    zoom: z.enum(['nenhum', 'alternado', 'lento']).optional(),
    cor: corDoTrechoSchema.nullable().optional(),
    abertura: z.enum(['nenhuma', 'flash', 'iris_abrir']).optional(),
    fechamento: z.enum(['nenhum', 'iris_fechar']).optional(),
    vinheta: z.boolean().optional(),
    sons: z.boolean().optional(),
  })
  .strict();

export type IngredientesDoPacote = z.infer<typeof ingredientesDoPacoteSchema>;

export const pacoteSalvoSchema = z
  .object({
    id: z.string().min(1).max(64),
    rotulo: z.string().trim().min(1).max(40),
    ingredientes: ingredientesDoPacoteSchema,
  })
  .strict();

export type PacoteSalvo = z.infer<typeof pacoteSalvoSchema>;

export interface PacoteDeEstilo extends PacoteSalvo {
  descricao: string;
}

export const PACOTES_DE_ESTILO: readonly PacoteDeEstilo[] = [
  {
    id: 'podcast_limpo',
    rotulo: 'Podcast limpo',
    descricao: 'Legenda discreta, corte seco, cor suave. Deixa a conversa em primeiro plano.',
    ingredientes: { legenda: { styleId: 'podcast', blockEntrance: 'surgir' }, transicao: { tipo: 'cut' }, zoom: 'nenhum', cor: { look: 'suave', intensity: 0.5 }, abertura: 'nenhuma', fechamento: 'nenhum', sons: false },
  },
  {
    id: 'energia_tiktok',
    rotulo: 'Energia TikTok',
    descricao: 'Legenda de impacto com pop, zoom alternado, cor viva, flash na abertura e sons nos elementos.',
    ingredientes: { legenda: { styleId: 'impacto', blockEntrance: 'pop' }, transicao: { tipo: 'zoom_desfoque', alternar: true }, zoom: 'alternado', cor: { look: 'vivido', intensity: 0.7 }, abertura: 'flash', fechamento: 'nenhum', sons: true },
  },
  {
    id: 'tutorial',
    rotulo: 'Tutorial',
    descricao: 'Legenda em caixa, esmaecer entre trechos, imagem nítida e sons nos textos.',
    ingredientes: { legenda: { styleId: 'caixa', blockEntrance: 'subir' }, transicao: { tipo: 'fade' }, zoom: 'nenhum', cor: { look: 'nitido', intensity: 0.6 }, abertura: 'nenhuma', fechamento: 'nenhum', sons: true },
  },
  {
    id: 'cinema',
    rotulo: 'Cinema',
    descricao: 'Cor de cinema, vinheta, zoom lento, íris na abertura e no fim, passagens pelo preto.',
    ingredientes: { legenda: { styleId: 'cinema', blockEntrance: 'desfocar' }, transicao: { tipo: 'fadeblack' }, zoom: 'lento', cor: { look: 'cinema', intensity: 0.9 }, abertura: 'iris_abrir', fechamento: 'iris_fechar', vinheta: true, sons: false },
  },
  {
    id: 'vendas',
    rotulo: 'Vendas',
    descricao: 'Legenda em destaque com zoom, cortes deslizando, zoom alternado, flash e sons de chamada.',
    ingredientes: { legenda: { styleId: 'destaque', blockEntrance: 'zoom' }, transicao: { tipo: 'slide', alternar: true }, zoom: 'alternado', cor: { look: 'nitido', intensity: 0.8 }, abertura: 'flash', fechamento: 'nenhum', sons: true },
  },
];

/**
 * As operações do pacote, na ordem: legenda, transições, zoom, cor,
 * efeitos de tela e, por último, os sons (sugeridos sobre o plano já com
 * o resto, com a fala protegida). Efeito que já existe no mesmo lugar não
 * é repetido -- aplicar duas vezes não duplica.
 */
export function operacoesDoPacote(plan: EditPlanV1, ing: IngredientesDoPacote, fala: readonly IntervaloDeFala[] = []): TimelineOperation[] {
  const ops: TimelineOperation[] = [];
  const agenda = agendaDoPlano(plan);
  if (ing.legenda) {
    ops.push({ op: 'trocar_estilo_legenda', styleId: ing.legenda.styleId });
    ops.push({ op: 'configurar_legenda', blockEntrance: ing.legenda.blockEntrance && ing.legenda.blockEntrance !== 'nenhuma' ? ing.legenda.blockEntrance : null });
  }
  if (ing.transicao) {
    const tipo = ing.transicao.tipo;
    agenda.trechos.slice(1).forEach((t, i) => {
      const deste = ing.transicao!.alternar && i % 2 === 1 ? 'cut' : tipo;
      ops.push({
        op: 'definir_transicao',
        clipId: t.clip.id,
        type: deste,
        ...(deste !== 'cut' ? { durationMs: DURACAO_PADRAO_DA_TRANSICAO[deste as keyof typeof DURACAO_PADRAO_DA_TRANSICAO] } : {}),
      });
    });
  }
  if (ing.zoom) {
    agenda.trechos.forEach((t, i) => {
      const effect = ing.zoom === 'lento' ? 'zoom_lento' : ing.zoom === 'alternado' && i % 2 === 1 ? 'punch_in' : 'nenhum';
      ops.push({ op: 'definir_efeito', clipId: t.clip.id, effect });
    });
  }
  if (ing.cor !== undefined) ops.push({ op: 'cor_em_todos', color: ing.cor && !corEhNeutra(ing.cor) ? ing.cor : null });

  const efeitos = plan.screenEffects ?? [];
  const jaTem = (type: string, ms: number) => efeitos.some((e) => e.type === type && Math.abs(e.timelineStartMs - ms) < 100);
  const efeito = (type: TipoDeEfeitoDeTela, timelineStartMs: number, durationMs: number, intensity: number) => {
    if (!jaTem(type, timelineStartMs)) ops.push({ op: 'adicionar_efeito_de_tela', type, timelineStartMs: Math.max(0, Math.round(timelineStartMs)), durationMs, intensity });
  };
  const total = agenda.duracaoMs;
  if (ing.abertura === 'flash') efeito('flash', 0, 500, 0.8);
  if (ing.abertura === 'iris_abrir') efeito('iris_abrir', 0, 700, 1);
  if (ing.fechamento === 'iris_fechar' && total > 1500) efeito('iris_fechar', total - 700, 700, 1);
  if (ing.vinheta) efeito('vinheta', 0, Math.max(100, total), 0.5);

  if (ing.sons) {
    const simulado = aplicarOperacoes(plan, ops as never);
    const base = simulado.ok && simulado.plan ? simulado.plan : plan;
    for (const s of sugerirSons(base, fala)) ops.push({ op: 'adicionar_efeito_sonoro', assetId: s.assetId, timelineStartMs: s.timelineStartMs, gainDb: s.gainDb });
  }
  return ops;
}

/** Os ingredientes do vídeo como está (para "salvar como meu estilo"). */
export function ingredientesDoPlano(plan: EditPlanV1): IngredientesDoPacote {
  const agenda = agendaDoPlano(plan);
  const tipos = plan.transitions.map((t) => t.type).filter((t) => t !== 'cut');
  const tipo = tipos.length ? [...tipos].sort((a, b) => tipos.filter((x) => x === b).length - tipos.filter((x) => x === a).length)[0]! : 'cut';
  const cortes = Math.max(0, agenda.trechos.length - 1);
  const zooms = agenda.trechos.map((t) => t.clip.effect ?? 'nenhum');
  const zoom = zooms.every((z) => z === 'zoom_lento') && zooms.length ? 'lento' : zooms.some((z) => z === 'punch_in') ? 'alternado' : 'nenhum';
  const efeitos = plan.screenEffects ?? [];
  return {
    legenda: { styleId: plan.captions.styleId, ...(plan.captions.blockEntrance ? { blockEntrance: plan.captions.blockEntrance } : {}) },
    transicao: { tipo, ...(tipos.length && tipos.length < cortes ? { alternar: true } : {}) },
    zoom,
    cor: agenda.trechos[0]?.clip.color ?? null,
    abertura: efeitos.some((e) => e.type === 'flash' && e.timelineStartMs < 200) ? 'flash' : efeitos.some((e) => e.type === 'iris_abrir' && e.timelineStartMs < 200) ? 'iris_abrir' : 'nenhuma',
    fechamento: efeitos.some((e) => e.type === 'iris_fechar') ? 'iris_fechar' : 'nenhum',
    vinheta: efeitos.some((e) => e.type === 'vinheta'),
    sons: plan.soundEffects.length > 0,
  };
}

/**
 * O pacote que combina com o vídeo, pelo que a IA já entendeu dele: o
 * framework (educação, história, venda...) e, se falar em conversa ou
 * entrevista, o podcast.
 */
export function pacoteRecomendado(framework?: string | null, entendimento?: string | null): string {
  if (entendimento && /podcast|entrevista|conversa|bate-papo|papo/i.test(entendimento)) return 'podcast_limpo';
  switch (framework) {
    case 'authority_education':
      return 'tutorial';
    case 'viral_education':
      return 'energia_tiktok';
    case 'storytelling':
      return 'cinema';
    case 'pas':
    case 'sales':
      return 'vendas';
    default:
      return 'energia_tiktok';
  }
}
