import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@makucho/types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { RequestUser } from '../decorators/current-user.decorator';

/**
 * Hierarquia de permissoes (secao 31).
 *
 * Cada papel herda o que os de baixo podem fazer. O numero e so a ordem
 * relativa; comparamos por nivel para nao precisar listar todos os papeis
 * em cada rota.
 */
export const NIVEL_PAPEL: Record<UserRole, number> = {
  SUPER_ADMIN: 40,
  ADMIN: 30,
  EDITOR: 20,
  AUTHOR: 10,
};

/**
 * Verifica o papel do usuario. A validacao acontece no servidor porque o
 * frontend so esconde botoes: quem chama a API direto ignora a interface.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const papeisExigidos = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Rota sem @Roles: basta estar autenticado (o JwtAuthGuard ja garantiu).
    if (!papeisExigidos || papeisExigidos.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Acesso negado',
      });
    }

    const nivelUsuario = NIVEL_PAPEL[user.role] ?? 0;
    const nivelMinimo = Math.min(...papeisExigidos.map((p) => NIVEL_PAPEL[p] ?? 99));

    if (nivelUsuario < nivelMinimo) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Seu perfil não tem permissão para esta ação',
      });
    }

    return true;
  }
}

/** Compara papeis fora do contexto de um guard (ex.: dentro de um service). */
export function papelAtende(papel: UserRole, minimo: UserRole): boolean {
  return (NIVEL_PAPEL[papel] ?? 0) >= (NIVEL_PAPEL[minimo] ?? 99);
}
