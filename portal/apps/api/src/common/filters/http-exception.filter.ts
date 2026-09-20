import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@makucho/database';
import { ZodError } from 'zod';

/**
 * Traduz qualquer excecao para o formato unico de erro da API (secao 5).
 *
 * Alem de padronizar, ele impede vazamento: erros inesperados chegam ao
 * cliente como mensagem generica, enquanto o detalhe fica so no log.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message, errors } = this.traduzir(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status !== HttpStatus.NOT_FOUND) {
      this.logger.warn(`${request.method} ${request.url} -> ${status} ${code}: ${message}`);
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private traduzir(exception: unknown): {
    status: number;
    code: string;
    message: string;
    errors?: Record<string, string[]>;
  } {
    // ---- Erros de validacao ----
    if (exception instanceof ZodError) {
      const errors: Record<string, string[]> = {};
      for (const issue of exception.issues) {
        const campo = issue.path.join('.') || '_';
        (errors[campo] ??= []).push(issue.message);
      }
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'VALIDATION_ERROR',
        message: 'Os dados enviados são inválidos',
        errors,
      };
    }

    // ---- Excecoes do proprio Nest ----
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resposta = exception.getResponse();

      if (typeof resposta === 'object' && resposta !== null) {
        const obj = resposta as Record<string, unknown>;
        const mensagem = obj.message;
        return {
          status,
          code: typeof obj.code === 'string' ? obj.code : this.codigoPadrao(status),
          message: Array.isArray(mensagem)
            ? mensagem.join('; ')
            : typeof mensagem === 'string'
              ? mensagem
              : exception.message,
          errors: (obj.errors as Record<string, string[]> | undefined) ?? undefined,
        };
      }

      return { status, code: this.codigoPadrao(status), message: exception.message };
    }

    // ---- Erros conhecidos do Prisma ----
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.traduzirPrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'DATABASE_VALIDATION_ERROR',
        message: 'Requisição inválida para o banco de dados',
      };
    }

    // ---- Qualquer outra coisa ----
    // Nao repassamos exception.message: pode conter caminho de arquivo,
    // string de conexao ou trecho de SQL.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro interno do servidor',
    };
  }

  private traduzirPrisma(e: Prisma.PrismaClientKnownRequestError): {
    status: number;
    code: string;
    message: string;
    errors?: Record<string, string[]>;
  } {
    switch (e.code) {
      case 'P2002': {
        // Violacao de unicidade
        const alvo = (e.meta?.target as string[] | undefined) ?? [];
        const campo = alvo[0] ?? 'registro';
        const legivel: Record<string, string> = {
          email: 'Este e-mail já está cadastrado',
          slug: 'Este endereço de página já está em uso',
          symbol: 'Este indicador já existe',
        };
        return {
          status: HttpStatus.CONFLICT,
          code: 'DUPLICATE_ENTRY',
          message: legivel[campo] ?? 'Já existe um registro com estes dados',
          errors: alvo.length ? { [campo]: [legivel[campo] ?? 'Valor já utilizado'] } : undefined,
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'Registro não encontrado',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'FOREIGN_KEY_ERROR',
          message: 'Referência inválida: o item relacionado não existe',
        };
      case 'P2014':
        return {
          status: HttpStatus.CONFLICT,
          code: 'RELATION_CONFLICT',
          message: 'Não é possível excluir: existem itens vinculados',
        };
      default:
        this.logger.error(`Prisma ${e.code}: ${e.message}`);
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'DATABASE_ERROR',
          message: 'Erro ao acessar os dados',
        };
    }
  }

  private codigoPadrao(status: number): string {
    const mapa: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      415: 'UNSUPPORTED_MEDIA_TYPE',
      422: 'VALIDATION_ERROR',
      429: 'TOO_MANY_REQUESTS',
    };
    return mapa[status] ?? 'ERROR';
  }
}
