// ============================================================
// Projeto — a unidade de trabalho.
//
// Um projeto amarra roteiro, gravacao, transcricao, EditPlan e
// render. Sem ele nao ha onde pendurar nada, e e por isso que o CRUD
// vem antes de qualquer outra coisa da Fase 4a (ADR 0010).
//
// O estado NAO entra na entrada: quem muda estado e o servico de
// dominio, consultando PROJECT_TRANSITIONS. Aceitar estado do cliente
// deixaria a interface pular direto para COMPLETED.
// ============================================================

import { z } from 'zod';
import { frameworkSchema, projectStateSchema } from './vocabulary';

const idSchema = z.string().min(1).max(64);

/** Duracao alvo: de 5s a 3 min, a faixa do formato vertical curto. */
const DURACAO_MINIMA_MS = 5_000;
const DURACAO_MAXIMA_MS = 180_000;

export const projectInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  // O roteiro e opcional: gravar antes de roteirizar e um fluxo
  // legitimo, e exigir roteiro bloquearia quem ja tem o video pronto.
  scriptId: idSchema.nullable().optional(),
  objective: z.string().trim().max(500).nullable().optional(),
  framework: frameworkSchema.nullable().optional(),
  targetDurationMs: z
    .number()
    .int()
    .min(DURACAO_MINIMA_MS)
    .max(DURACAO_MAXIMA_MS)
    .nullable()
    .optional(),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

/** Na atualizacao todo campo e opcional, mas o corpo nao pode ser vazio. */
export const projectPatchSchema = projectInputSchema
  .partial()
  .refine((dados) => Object.keys(dados).length > 0, {
    message: 'informe ao menos um campo para atualizar',
  });

export type ProjectPatch = z.infer<typeof projectPatchSchema>;

// ---------- Saida ----------

export const projectSummarySchema = z.object({
  id: idSchema,
  title: z.string(),
  state: projectStateSchema,
  objective: z.string().nullable(),
  framework: z.string().nullable(),
  targetDurationMs: z.number().int().nullable(),
  // Mensagem segura para o usuario quando o estado e de falha. Nunca
  // carrega stack, caminho de arquivo nem nome de container.
  publicError: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  thumbnailUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;

// ---------- Estado para a interface ----------

/**
 * O que a tela mostra em cada estado.
 *
 * A interface nao decide isso: se cada tela traduzir estado por conta
 * propria, dois lugares discordam sobre o que "INGESTING" significa.
 * Aqui e uma tabela, e a tela so consulta.
 */
export const ROTULO_DE_ESTADO: Readonly<
  Record<z.infer<typeof projectStateSchema>, { texto: string; tom: 'neutro' | 'info' | 'sucesso' | 'aviso' }>
> = {
  DRAFT: { texto: 'Rascunho', tom: 'neutro' },
  // Vídeos na lista, esperando a pessoa decidir ir para a edição.
  UPLOADING: { texto: 'Aguardando edição', tom: 'neutro' },
  INGESTING: { texto: 'Preparando vídeo', tom: 'info' },
  TRANSCRIBING: { texto: 'Transcrevendo', tom: 'info' },
  ANALYZING: { texto: 'A IA está analisando', tom: 'info' },
  PROPOSAL_READY: { texto: 'Proposta pronta', tom: 'sucesso' },
  USER_EDITING: { texto: 'Em edição', tom: 'info' },
  READY_TO_RENDER: { texto: 'Pronto para gerar', tom: 'sucesso' },
  RENDERING: { texto: 'Gerando vídeo', tom: 'info' },
  QUALITY_CHECK: { texto: 'Conferindo', tom: 'info' },
  COMPLETED: { texto: 'Concluído', tom: 'sucesso' },
  FAILED_RETRYABLE: { texto: 'Falhou — dá para tentar de novo', tom: 'aviso' },
  FAILED_FINAL: { texto: 'Falhou', tom: 'aviso' },
  CANCEL_REQUESTED: { texto: 'Cancelando', tom: 'aviso' },
  CANCELLED: { texto: 'Cancelado', tom: 'neutro' },
  ARCHIVED: { texto: 'Arquivado', tom: 'neutro' },
};

/** Estados em que o projeto está sendo processado e nada pode ser editado. */
//
// UPLOADING não entra: com vários vídeos, ele é o projeto com a lista
// montada esperando "Ir para a edição" -- é a pessoa que decide, e
// tratar como processamento prenderia o editor numa espera sem fim.
export const ESTADOS_EM_PROCESSAMENTO = [
  'INGESTING',
  'TRANSCRIBING',
  'ANALYZING',
  'RENDERING',
  'QUALITY_CHECK',
] as const;

export function estaProcessando(estado: z.infer<typeof projectStateSchema>): boolean {
  return (ESTADOS_EM_PROCESSAMENTO as readonly string[]).includes(estado);
}

/** O editor só abre depois que existe uma proposta para editar. */
export function podeEditar(estado: z.infer<typeof projectStateSchema>): boolean {
  return ['PROPOSAL_READY', 'USER_EDITING', 'READY_TO_RENDER', 'COMPLETED'].includes(estado);
}
