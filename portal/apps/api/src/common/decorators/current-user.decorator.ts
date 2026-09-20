import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@makucho/types';

export interface RequestUser extends JwtPayload {
  id: string;
}

/** Injeta o usuario autenticado: metodo(@CurrentUser() user: RequestUser) */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
