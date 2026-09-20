import { SetMetadata } from '@nestjs/common';

/**
 * Marca uma rota como acessivel sem autenticacao.
 *
 * O guard e global: sem este decorator explicito, toda rota exige
 * token. Esquecer de proteger uma rota deixa de ser possivel -- o
 * padrao e fechado.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
