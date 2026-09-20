import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '@makucho/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { papelAtende, NIVEL_PAPEL } from '../../common/guards/roles.guard';

/**
 * Contas de acesso ao CMS (secao 31).
 *
 * Regra central: ninguem cria, promove ou edita alguem de nivel igual ou
 * superior ao seu. Sem isso um ADMIN poderia se promover a SUPER_ADMIN ou
 * alterar a conta de quem esta acima dele.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  private readonly campos = {
    id: true,
    email: true,
    name: true,
    role: true,
    status: true,
    lastLoginAt: true,
    mustChangePassword: true,
    createdAt: true,
    avatarMedia: { select: { id: true, storageKey: true, alt: true } },
  };

  async listar(filtro: { page: number; perPage: number; role?: UserRole; search?: string }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (filtro.role) where.role = filtro.role;
    if (filtro.search) {
      where.OR = [
        { name: { contains: filtro.search, mode: 'insensitive' } },
        { email: { contains: filtro.search, mode: 'insensitive' } },
      ];
    }

    const [usuarios, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: this.campos,
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        skip: (filtro.page - 1) * filtro.perPage,
        take: filtro.perPage,
      }),
      this.prisma.user.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / filtro.perPage));

    return {
      data: usuarios,
      meta: {
        page: filtro.page,
        perPage: filtro.perPage,
        total,
        totalPages,
        hasNextPage: filtro.page < totalPages,
        hasPreviousPage: filtro.page > 1,
      },
    };
  }

  async buscarPorId(id: string) {
    const usuario = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: this.campos,
    });
    if (!usuario) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Usuário não encontrado' });
    }
    return usuario;
  }

  async criar(
    dados: { email: string; name: string; password: string; role: UserRole; avatarMediaId?: string | null },
    autor: { id: string; role: UserRole },
    request: Request,
  ) {
    this.exigirNivelSuperior(autor.role, dados.role);

    const existente = await this.prisma.user.findUnique({
      where: { email: dados.email },
      select: { id: true, deletedAt: true },
    });

    if (existente) {
      // Reativar uma conta excluida preserva o historico de autoria dos
      // artigos, que aponta para o id antigo.
      if (existente.deletedAt) {
        const reativado = await this.prisma.user.update({
          where: { id: existente.id },
          data: {
            deletedAt: null,
            name: dados.name,
            role: dados.role,
            status: 'ACTIVE',
            passwordHash: await this.auth.gerarHashSenha(dados.password),
            mustChangePassword: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
          select: this.campos,
        });

        await this.audit.registrar({
          userId: autor.id,
          action: 'create',
          resource: 'user',
          resourceId: reativado.id,
          summary: `Conta reativada: ${dados.email}`,
          request,
        });

        return reativado;
      }

      throw new ConflictException({
        code: 'EMAIL_IN_USE',
        message: 'Já existe uma conta com este e-mail',
      });
    }

    const usuario = await this.prisma.user.create({
      data: {
        email: dados.email,
        name: dados.name,
        role: dados.role,
        avatarMediaId: dados.avatarMediaId ?? null,
        passwordHash: await this.auth.gerarHashSenha(dados.password),
        // A senha inicial e conhecida por quem criou a conta; o dono troca
        // no primeiro acesso.
        mustChangePassword: true,
      },
      select: this.campos,
    });

    await this.audit.registrar({
      userId: autor.id,
      action: 'create',
      resource: 'user',
      resourceId: usuario.id,
      summary: `Usuário criado: ${dados.email} (${dados.role})`,
      request,
    });

    return usuario;
  }

  async atualizar(
    id: string,
    dados: Record<string, unknown>,
    autor: { id: string; role: UserRole },
    request: Request,
  ) {
    const alvo = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true, role: true },
    });
    if (!alvo) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Usuário não encontrado' });
    }

    // Editar o proprio perfil e sempre permitido; mexer em outra conta exige
    // estar acima dela.
    if (alvo.id !== autor.id) {
      this.exigirNivelSuperior(autor.role, alvo.role as UserRole);
    }

    if (dados.role && dados.role !== alvo.role) {
      if (alvo.id === autor.id) {
        throw new ForbiddenException({
          code: 'CANNOT_CHANGE_OWN_ROLE',
          message: 'Você não pode alterar o seu próprio nível de acesso',
        });
      }
      this.exigirNivelSuperior(autor.role, dados.role as UserRole);
    }

    if (dados.status === 'SUSPENDED' && alvo.id === autor.id) {
      throw new BadRequestException({
        code: 'CANNOT_SUSPEND_SELF',
        message: 'Você não pode suspender a própria conta',
      });
    }

    const usuario = await this.prisma.user.update({
      where: { id },
      data: dados as never,
      select: this.campos,
    });

    // Suspender precisa cortar o acesso agora, nao quando o token expirar.
    if (dados.status === 'SUSPENDED') {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.registrar({
      userId: autor.id,
      action: 'update',
      resource: 'user',
      resourceId: id,
      summary: `Usuário atualizado: ${alvo.email}`,
      metadata: { fields: Object.keys(dados) },
      request,
    });

    return usuario;
  }

  /** Redefinição de senha pelo administrador. */
  async redefinirSenha(
    id: string,
    novaSenha: string,
    autor: { id: string; role: UserRole },
    request: Request,
  ): Promise<void> {
    const alvo = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true, role: true },
    });
    if (!alvo) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Usuário não encontrado' });
    }

    this.exigirNivelSuperior(autor.role, alvo.role as UserRole);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          passwordHash: await this.auth.gerarHashSenha(novaSenha),
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      // Toda sessao aberta cai: se a senha foi trocada por suspeita de
      // invasao, manter as sessoes anularia a medida.
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.registrar({
      userId: autor.id,
      action: 'reset_password',
      resource: 'user',
      resourceId: id,
      summary: `Senha redefinida para ${alvo.email}`,
      request,
    });
  }

  async excluir(
    id: string,
    autor: { id: string; role: UserRole },
    request: Request,
  ): Promise<void> {
    if (id === autor.id) {
      throw new BadRequestException({
        code: 'CANNOT_DELETE_SELF',
        message: 'Você não pode excluir a própria conta',
      });
    }

    const alvo = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true, role: true },
    });
    if (!alvo) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Usuário não encontrado' });
    }

    this.exigirNivelSuperior(autor.role, alvo.role as UserRole);

    // O ultimo SUPER_ADMIN nao pode sair: sem ele ninguem consegue gerir
    // os demais administradores.
    if (alvo.role === 'SUPER_ADMIN') {
      const restantes = await this.prisma.user.count({
        where: { role: 'SUPER_ADMIN', deletedAt: null, status: 'ACTIVE', id: { not: id } },
      });
      if (restantes === 0) {
        throw new BadRequestException({
          code: 'LAST_SUPER_ADMIN',
          message: 'É necessário manter ao menos um super administrador ativo',
        });
      }
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'SUSPENDED' },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.registrar({
      userId: autor.id,
      action: 'delete',
      resource: 'user',
      resourceId: id,
      summary: `Usuário excluído: ${alvo.email}`,
      request,
    });
  }

  /** Papéis que o usuário logado pode atribuir, para montar o select. */
  papeisDisponiveis(papel: UserRole): UserRole[] {
    return (Object.keys(NIVEL_PAPEL) as UserRole[]).filter(
      (candidato) => NIVEL_PAPEL[candidato] < NIVEL_PAPEL[papel],
    );
  }

  private exigirNivelSuperior(papelDoAutor: UserRole, papelAlvo: UserRole): void {
    if (NIVEL_PAPEL[papelDoAutor] <= NIVEL_PAPEL[papelAlvo]) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Você não pode gerenciar contas de nível igual ou superior ao seu',
      });
    }
    // Redundante com o guard, mas o service tambem e chamado por seed e
    // scripts, onde nao ha guard nenhum.
    if (!papelAtende(papelDoAutor, 'ADMIN')) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Apenas administradores gerenciam contas',
      });
    }
  }
}
