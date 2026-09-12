import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { ZodSchema } from 'zod';

/**
 * Valida o corpo/query da requisicao com um schema do @makucho/validation.
 *
 * O ZodError sobe cru: o HttpExceptionFilter ja sabe transforma-lo no
 * formato de erro por campo que o formulario do admin consome.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    return this.schema.parse(value);
  }
}

/** Acucar sintatico: @Body(zodPipe(criarPostSchema)) */
export const zodPipe = (schema: ZodSchema): ZodValidationPipe =>
  new ZodValidationPipe(schema);
