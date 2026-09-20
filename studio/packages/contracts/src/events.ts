// ============================================================
// MAKUCHO STUDIO - Eventos internos e contrato de job
//
// Plano, secoes 7.3 e 6.3. Todo evento carrega versao, origem e
// correlation ID: sem eles, rastrear um render que falhou exige ler
// log de tres containers em paralelo.
// ============================================================

import { z } from 'zod';
import { jobStateSchema, jobTypeSchema } from './vocabulary';

export const EVENT_NAMES = [
  'project.created',
  'upload.completed',
  'media.validated',
  'proxy.created',
  'audio.extracted',
  'transcription.completed',
  'analysis.completed',
  'edit_plan.created',
  'edit_plan.updated',
  'render.requested',
  'render.progressed',
  'render.completed',
  'render.failed',
  'project.cancelled',
] as const;

export const eventNameSchema = z.enum(EVENT_NAMES);
export type EventName = z.infer<typeof eventNameSchema>;

export const eventEnvelopeSchema = z.object({
  name: eventNameSchema,
  version: z.literal(1),
  occurredAt: z.string().datetime(),
  // Atravessa API, fila e worker. E o que liga as linhas de log de
  // servicos diferentes a uma unica acao do usuario.
  correlationId: z.string().min(1).max(64),
  workspaceId: z.string().min(1).max(64),
  projectId: z.string().min(1).max(64).optional(),
  source: z.enum(['api', 'worker-media', 'worker-transcription', 'worker-render']),
  payload: z.record(z.unknown()),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

// ---------- Job ----------
export const jobDescriptorSchema = z.object({
  jobId: z.string().min(1).max(64),
  correlationId: z.string().min(1).max(64),
  workspaceId: z.string().min(1).max(64),
  projectId: z.string().min(1).max(64),
  type: jobTypeSchema,
  schemaVersion: z.literal(1),
  // Mesma chave = mesmo efeito. Um retry de rede depois de o worker ter
  // concluido nao pode gerar um segundo render cobrado duas vezes
  // (plano, secao 6.3).
  idempotencyKey: z.string().min(1).max(128),
  attempt: z.number().int().min(1),
  maxAttempts: z.number().int().min(1).max(10),
});

export type JobDescriptor = z.infer<typeof jobDescriptorSchema>;

export const jobProgressSchema = z.object({
  jobId: z.string().min(1).max(64),
  state: jobStateSchema,
  // Progresso real. Quando nao houver percentual confiavel, o worker
  // envia apenas `step` — a UX nao exibe barra falsa (plano, secao 14).
  percent: z.number().int().min(0).max(100).nullable(),
  // Texto mostrado ao usuario: "analisando fala...".
  step: z.string().min(1).max(120),
  updatedAt: z.string().datetime(),
});

export type JobProgress = z.infer<typeof jobProgressSchema>;

// ---------- Erros ----------
//
// Separar mensagem interna de mensagem publica evita vazar caminho de
// arquivo, nome de bucket ou stack trace para o navegador
// (plano, secao 15).
export const jobErrorSchema = z.object({
  code: z.string().min(1).max(64),
  internalMessage: z.string().max(2000),
  publicMessage: z.string().max(300),
  retryable: z.boolean(),
});

export type JobError = z.infer<typeof jobErrorSchema>;
