// ============================================================
// ZodError -> 400 com mensagem util.
//
// Sem este filtro, toda validacao que falha vira 500 "Internal server
// error": o Nest nao conhece ZodError, e trata como falha inesperada.
//
// O efeito pratico e pior do que parece. A tela recebe "o servidor
// falhou. Tente de novo em instantes." para um erro que NAO se
// resolve tentando de novo -- a senha continua curta, o e-mail
// continua invalido. A pessoa repete a acao ate desistir.
//
// Medido: `POST /auth/setup` com senha de 5 caracteres devolvia 500.
// Vale para toda rota que valida com Zod -- login, projetos,
// roteiros, assets, planos de edicao.
// ============================================================

import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';

@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(erro: ZodError, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse<Response>();

    // Uma frase por problema, com o caminho do campo. O cliente ja
    // sabe juntar um array de `message` -- e o formato que o
    // ValidationPipe do Nest usa, entao a tela nao precisa aprender
    // outro.
    const message = erro.issues.map((issue) => {
      const campo = issue.path.join('.');
      return campo ? `${campo}: ${issue.message}` : issue.message;
    });

    resposta.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message,
    });
  }
}
