// ============================================================
// MAKUCHO STUDIO - Isolamento multi-tenant
//
// Criterio de aceite da Fase 1 (plano, secao 19):
//
//     dois usuarios de workspaces distintos nao acessam dados ou
//     arquivos um do outro.
//
// A regra deste arquivo: NENHUMA consulta a dado de cliente sai sem
// workspaceId no filtro. O tipo e as funcoes abaixo existem para que
// esquecer o filtro seja um erro de compilacao, nao um vazamento
// descoberto em producao.
// ============================================================

import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Identidade do requisitante, extraida do token e anexada a requisicao.
 * Nunca vem do corpo ou da query: um `workspaceId` enviado pelo cliente
 * e exatamente o vetor que este modulo existe para bloquear.
 */
export interface TenantContext {
  userId: string;
  workspaceId: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
}

/**
 * Filtro obrigatorio das consultas Prisma.
 *
 * Usar `scopedWhere` em vez de escrever `{ workspaceId }` a mao deixa
 * o ponto de decisao em um lugar so: se o modelo de isolamento mudar,
 * muda aqui e o typecheck aponta todos os chamadores.
 */
export function scopedWhere<T extends Record<string, unknown>>(
  tenant: TenantContext,
  where: T = {} as T,
): T & { workspaceId: string } {
  return { ...where, workspaceId: tenant.workspaceId };
}

/**
 * Confirma que um registro ja carregado pertence ao workspace do
 * requisitante.
 *
 * Responde 404, nao 403, quando pertence a outro: dizer "existe, mas
 * voce nao pode ver" confirma a existencia do recurso e permite mapear
 * IDs de outros clientes por tentativa e erro.
 */
export function assertOwnership(
  tenant: TenantContext,
  entity: { workspaceId: string } | null | undefined,
  recurso = 'recurso',
): asserts entity is { workspaceId: string } {
  if (!entity || entity.workspaceId !== tenant.workspaceId) {
    throw new NotFoundException(`${recurso} nao encontrado`);
  }
}

/** Papeis que podem modificar dados. VIEWER apenas le. */
const PAPEIS_DE_ESCRITA: ReadonlySet<TenantContext['role']> = new Set(['OWNER', 'EDITOR']);

export function assertCanWrite(tenant: TenantContext): void {
  if (!PAPEIS_DE_ESCRITA.has(tenant.role)) {
    throw new ForbiddenException('seu papel neste workspace permite apenas leitura');
  }
}

export function assertIsOwner(tenant: TenantContext): void {
  if (tenant.role !== 'OWNER') {
    throw new ForbiddenException('apenas o dono do workspace pode executar esta acao');
  }
}
