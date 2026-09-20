import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@makucho/types';

export const ROLES_KEY = 'roles';

/** Restringe a rota aos papeis informados (secao 31). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
