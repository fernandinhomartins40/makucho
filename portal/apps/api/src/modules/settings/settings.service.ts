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

  /**
   * Chaves secretas (tokens de integração): nunca saem na leitura pública,
   * não aparecem na tela genérica de configurações e só são gravadas por
   * salvarSegredo(). O padrão do banco é isPublic=true, então sem esta
   * lista um token salvo pela tela genérica iria parar no site.
   */
  static readonly CHAVES_SECRETAS = ['market.brapiToken'];

  /** Configurações visíveis ao portal (isPublic). */
  async publicas(): Promise<SiteSettings> {
    const registros = await this.prisma.siteSetting.findMany({
      where: { isPublic: true, key: { notIn: SettingsService.CHAVES_SECRETAS } },
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
      where: {
        key: { notIn: SettingsService.CHAVES_SECRETAS },
        ...(grupo ? { group: grupo } : {}),
      },
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
    // Segredos só por salvarSegredo(): a tela genérica não grava nem sobrescreve.
    itens = itens.filter((item) => !SettingsService.CHAVES_SECRETAS.includes(item.key));
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

  // ============================================================
  // SEGREDOS DE INTEGRAÇÃO
  // ============================================================

  async obterSegredo(chave: string): Promise<string | null> {
    const registro = await this.prisma.siteSetting.findUnique({ where: { key: chave } });
    return typeof registro?.value === 'string' && registro.value ? registro.value : null;
  }

  /** Grava (ou remove, com null) um segredo; a auditoria nunca leva o valor. */
  async salvarSegredo(chave: string, valor: string | null, userId: string, request: Request): Promise<void> {
    if (!SettingsService.CHAVES_SECRETAS.includes(chave)) {
      throw new Error(`Chave ${chave} não é um segredo registrado`);
    }
    if (valor === null) {
      await this.prisma.siteSetting.deleteMany({ where: { key: chave } });
    } else {
      await this.prisma.siteSetting.upsert({
        where: { key: chave },
        update: { value: valor, isPublic: false },
        create: {
          key: chave,
          value: valor,
          type: 'secret',
          group: 'integrations',
          label: 'Token de integração',
          isPublic: false,
        },
      });
    }
    await this.audit.registrar({
      userId,
      action: 'update',
      resource: 'settings',
      summary: valor === null ? `Integração removida: ${chave}` : `Integração configurada: ${chave}`,
      metadata: { keys: [chave] },
      request,
    });
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
