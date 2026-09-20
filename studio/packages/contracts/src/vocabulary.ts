// ============================================================
// MAKUCHO STUDIO - Vocabulario do dominio editorial
//
// Os valores aqui sao fechados de proposito. A IA escolhe DENTRE
// eles; nunca inventa um novo. E o primeiro anel de contencao da
// secao 22 do contexto mestre: uma funcao comunicacional que o
// compilador nao conhece nao vira instrucao de render.
// ============================================================

import { z } from 'zod';

// ---------- Funcoes comunicacionais (plano, secao 9.1) ----------
export const CLIP_ROLES = [
  'hook',
  'problem',
  'context',
  'curiosity_gap',
  'authority',
  'introduction',
  'proof',
  'insight',
  'solution',
  'pattern_interrupt',
  'payoff',
  'offer',
  'cta',
] as const;

export const clipRoleSchema = z.enum(CLIP_ROLES);
export type ClipRole = z.infer<typeof clipRoleSchema>;

// ---------- Frameworks editoriais (contexto mestre, secao 11) ----------
export const FRAMEWORKS = [
  'authority_education',
  'viral_education',
  'storytelling',
  'pas',
  'sales',
] as const;

export const frameworkSchema = z.enum(FRAMEWORKS);
export type Framework = z.infer<typeof frameworkSchema>;

// ---------- Risco semantico ----------
// "high" nunca entra na edicao automaticamente (plano, secao 9.3).
export const semanticRiskSchema = z.enum(['low', 'medium', 'high']);
export type SemanticRisk = z.infer<typeof semanticRiskSchema>;

// ---------- Estados de projeto (plano, secao 6.2) ----------
export const PROJECT_STATES = [
  'DRAFT',
  'UPLOADING',
  'INGESTING',
  'TRANSCRIBING',
  'ANALYZING',
  'PROPOSAL_READY',
  'USER_EDITING',
  'READY_TO_RENDER',
  'RENDERING',
  'QUALITY_CHECK',
  'COMPLETED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'ARCHIVED',
] as const;

export const projectStateSchema = z.enum(PROJECT_STATES);
export type ProjectState = z.infer<typeof projectStateSchema>;

// ---------- Transicoes permitidas ----------
//
// A interface nunca grava estado direto (plano, secao 6.2): toda
// mudanca passa por um servico de dominio que consulta este mapa.
// Declarar as transicoes como dado, e nao como sequencia de "if",
// permite testar a maquina inteira sem instanciar a aplicacao.
export const PROJECT_TRANSITIONS: Readonly<Record<ProjectState, readonly ProjectState[]>> = {
  DRAFT: ['UPLOADING', 'ARCHIVED'],
  UPLOADING: ['INGESTING', 'FAILED_RETRYABLE', 'CANCEL_REQUESTED'],
  INGESTING: ['TRANSCRIBING', 'FAILED_RETRYABLE', 'CANCEL_REQUESTED'],
  TRANSCRIBING: ['ANALYZING', 'FAILED_RETRYABLE', 'CANCEL_REQUESTED'],
  ANALYZING: ['PROPOSAL_READY', 'FAILED_RETRYABLE', 'CANCEL_REQUESTED'],
  PROPOSAL_READY: ['USER_EDITING', 'READY_TO_RENDER', 'ARCHIVED'],
  USER_EDITING: ['READY_TO_RENDER', 'ARCHIVED'],
  READY_TO_RENDER: ['RENDERING', 'USER_EDITING', 'ARCHIVED'],
  RENDERING: ['QUALITY_CHECK', 'FAILED_RETRYABLE', 'CANCEL_REQUESTED'],
  QUALITY_CHECK: ['COMPLETED', 'FAILED_RETRYABLE'],
  COMPLETED: ['USER_EDITING', 'ARCHIVED'],
  // Retry volta para o inicio da etapa que falhou; quem decide qual e o
  // servico de dominio, que guarda a etapa de origem no job.
  FAILED_RETRYABLE: ['INGESTING', 'TRANSCRIBING', 'ANALYZING', 'RENDERING', 'FAILED_FINAL', 'ARCHIVED'],
  FAILED_FINAL: ['ARCHIVED'],
  CANCEL_REQUESTED: ['CANCELLED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransition(from: ProjectState, to: ProjectState): boolean {
  return PROJECT_TRANSITIONS[from].includes(to);
}

// ---------- Estados de job (plano, secao 6.3) ----------
export const jobStateSchema = z.enum([
  'WAITING',
  'ACTIVE',
  'RETRY_DELAY',
  'COMPLETED',
  'FAILED',
  'CANCEL_REQUESTED',
  'CANCELLED',
]);
export type JobState = z.infer<typeof jobStateSchema>;

export const jobTypeSchema = z.enum([
  'media.ingest',
  'media.proxy',
  'transcription.run',
  'analysis.run',
  'render.run',
]);
export type JobType = z.infer<typeof jobTypeSchema>;
