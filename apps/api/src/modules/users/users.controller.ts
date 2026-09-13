import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import {
  atualizarUsuarioSchema,
  criarUsuarioSchema,
  paginacaoSchema,
  papelSchema,
  senhaSchema,
} from '@makucho/validation';
import type { UserRole } from '@makucho/types';
import { UsersService } from './users.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Roles, type RequestUser } from '../../common/decorators';

const redefinirSenhaSchema = z.object({ password: senhaSchema });

@ApiTags('Usuários')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar usuários' })
  async listar(
    @Query(zodPipe(paginacaoSchema)) paginacao: { page: number; perPage: number; search?: string },
    @Query('role') papel?: string,
  ) {
    return this.users.listar({
      ...paginacao,
      role: papel ? papelSchema.parse(papel) : undefined,
    });
  }

  /** Papéis que o usuário logado pode atribuir. */
  @Get('assignable-roles')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Papéis disponíveis para atribuição' })
  async papeis(@CurrentUser() user: RequestUser) {
    return this.users.papeisDisponiveis(user.role as UserRole);
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Buscar usuário por id' })
  async porId(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.buscarPorId(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar usuário' })
  async criar(
    @Body(zodPipe(criarUsuarioSchema))
    dados: { email: string; name: string; password: string; role: UserRole; avatarMediaId?: string | null },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.users.criar(dados, { id: user.id, role: user.role as UserRole }, req);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar usuário' })
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(atualizarUsuarioSchema)) dados: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.users.atualizar(id, dados, { id: user.id, role: user.role as UserRole }, req);
  }

  @Post(':id/reset-password')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Redefinir a senha de um usuário' })
  async redefinir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(redefinirSenhaSchema)) corpo: { password: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.users.redefinirSenha(
      id,
      corpo.password,
      { id: user.id, role: user.role as UserRole },
      req,
    );
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir usuário' })
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.users.excluir(id, { id: user.id, role: user.role as UserRole }, req);
  }
}
