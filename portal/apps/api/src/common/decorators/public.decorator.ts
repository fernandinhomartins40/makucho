import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Libera a rota do JwtAuthGuard, que e global.
 *
 * A protecao e o padrao: esquecer o decorator deixa a rota fechada,
 * nunca aberta por acidente.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
