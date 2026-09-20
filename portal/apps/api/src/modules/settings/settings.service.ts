import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { SiteSettings, SocialProfileDto } from '@makucho/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface ConfiguracaoRegistro {
  id: string;
  key: string;
  value: unknown;
  type: string;
  group: string;
  label: string | null;
  description: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Configuracoes do site e redes sociais (secoes 26, 27 e 35).
 *
 * Tudo o que o portal exibe fora do conteudo editorial — nome, logo, textos
 * do rodape, perfis sociais, metadados de SEO — vem daqui, nunca de
 * constantes no frontend.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Configurações visíveis ao portal (isPublic). */
  async publicas(): Promise<SiteSettings> {
    const registros = await this.prisma.siteSetting.findMany({
      where: { isPublic: true },
      select: { key: true, value: true },
    });
    return Object.fromEntries(registros.map((r) => [r.key, r.value]));
  }

  /**
   * Todas as chaves, com rótulo e grupo, para a tela de configurações.
   *
   * O retorno e anotado a mao: deixar o TypeScript inferir a partir do
   * Prisma produz um tipo que referencia um caminho interno do pacote.
   */
  async todas(grupo?: string): Promise<ConfiguracaoRegistro[]> {
    return this.prisma.siteSetting.findMany({
      where: grupo ? { group: grupo } : {},
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
  }

  async obter<T = unknown>(chave: string, padrao?: T): Promise<T> {
    const registro = await this.prisma.siteSetting.findUnique({ where: { key: chave } });
    return registro ? (registro.value as T) : (padrao as T);
  }

  /**
   * Grava um lote de chaves. Usamos upsert porque a tela pode enviar uma
   * chave nova que ainda nao existia (ex.: um campo de SEO recem-adicionado).
   */
  async atualizar(
    itens: Array<{ key: string; value: unknown }>,
    userId: string,
    request: Request,
  ): Promise<SiteSettings> {
    await this.prisma.$transaction(
      itens.map((item) =>
        this.prisma.siteSetting.upsert({
          where: { key: item.key },
          update: { value: item.value as never },
          create: {
            key: item.key,
            value: item.value as never,
            type: this.tipoDe(item.value),
          },
        }),
      ),
    );

    await this.audit.registrar({
      userId,
      action: 'update',
      resource: 'settings',
      summary: `${itens.length} configuração(ões) alterada(s)`,
      // Apenas as chaves: os valores podem conter tokens de provedores.
      metadata: { keys: itens.map((i) => i.key) },
      request,
    });

    return this.publicas();
  }

  private tipoDe(valor: unknown): string {
    if (typeof valor === 'boolean') return 'boolean';
    if (typeof valor === 'number') return 'number';
    if (typeof valor === 'string') return 'string';
    return 'json';
  }

  // ============================================================
  // REDES SOCIAIS
  // ============================================================

  async redesSociais(apenasAtivas = true): Promise<SocialProfileDto[]> {
    const perfis = await this.prisma.socialProfile.findMany({
      where: apenasAtivas ? { isActive: true } : {},
      orderBy: { position: 'asc' },
    });

    return perfis.map((p) => ({
      id: p.id,
      platform: p.platform,
      label: p.label,
      url: p.url,
      handle: p.handle,
      icon: p.icon,
      followerCount: p.followerCount,
      followerLabel: p.followerLabel,
      position: p.position,
    }));
  }

  async salvarRedeSocial(
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<SocialProfileDto[]> {
    const plataforma = String(dados.platform);

    await this.prisma.socialProfile.upsert({
      where: { platform: plataforma },
      update: dados as never,
      create: dados as never,
    });

    await this.audit.registrar({
      userId,
      action: 'update',
      resource: 'social_profile',
      summary: `Perfil social salvo: ${plataforma}`,
      request,
    });

    return this.redesSociais(false);
  }

  async excluirRedeSocial(id: string, userId: string, request: Request): Promise<void> {
    await this.prisma.socialProfile.delete({ where: { id } });
    await this.audit.registrar({
      userId,
      action: 'delete',
      resource: 'social_profile',
      resourceId: id,
      summary: 'Perfil social removido',
      request,
    });
  }
}
