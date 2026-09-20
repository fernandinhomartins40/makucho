import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { MarketIndicatorDto } from '@makucho/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MARKET_DATA_PROVIDER, type MarketDataProvider } from './market-data.provider';

/** Ticker financeiro do topo do site (seção 19). */
@Injectable()
export class MarketService {
  private readonly logger = new Logger('Market');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(MARKET_DATA_PROVIDER) private readonly provedor: MarketDataProvider,
  ) {}

  async listar(apenasAtivos = true): Promise<MarketIndicatorDto[]> {
    const indicadores = await this.prisma.marketIndicator.findMany({
      where: apenasAtivos ? { isActive: true } : {},
      orderBy: { position: 'asc' },
    });
    return indicadores.map((i) => this.paraDto(i));
  }

  /** Cria ou atualiza pelo símbolo — a redação edita o ticker por aqui. */
  async salvar(
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<MarketIndicatorDto> {
    const simbolo = String(dados.symbol);

    const indicador = await this.prisma.marketIndicator.upsert({
      where: { symbol: simbolo },
      update: { ...dados, source: 'manual', lastUpdatedAt: new Date() } as never,
      create: { ...dados, source: 'manual', lastUpdatedAt: new Date() } as never,
    });

    await this.audit.registrar({
      userId,
      action: 'update',
      resource: 'market_indicator',
      resourceId: indicador.id,
      summary: `Indicador atualizado: ${simbolo}`,
      request,
    });

    return this.paraDto(indicador);
  }

  async excluir(id: string, userId: string, request: Request): Promise<void> {
    const indicador = await this.prisma.marketIndicator.findUnique({ where: { id } });
    if (!indicador) {
      throw new NotFoundException({
        code: 'INDICATOR_NOT_FOUND',
        message: 'Indicador não encontrado',
      });
    }

    await this.prisma.marketIndicator.delete({ where: { id } });

    await this.audit.registrar({
      userId,
      action: 'delete',
      resource: 'market_indicator',
      resourceId: id,
      summary: `Indicador removido: ${indicador.symbol}`,
      request,
    });
  }

  /**
   * Sincroniza com o provedor externo. Com o provedor manual nao faz nada;
   * a tarefa agendada chama isto periodicamente e continua valida quando
   * uma integracao real for plugada.
   */
  async sincronizar(): Promise<number> {
    const ativos = await this.prisma.marketIndicator.findMany({
      where: { isActive: true },
      select: { symbol: true },
    });
    if (ativos.length === 0) return 0;

    let atualizados = 0;
    try {
      const cotacoes = await this.provedor.cotacoes(ativos.map((a) => a.symbol));

      for (const cotacao of cotacoes) {
        await this.prisma.marketIndicator.updateMany({
          where: { symbol: cotacao.symbol },
          data: {
            value: cotacao.value,
            changePercent: cotacao.changePercent ?? null,
            changeAbsolute: cotacao.changeAbsolute ?? null,
            source: this.provedor.nome,
            lastUpdatedAt: cotacao.quotedAt ?? new Date(),
          },
        });
        atualizados += 1;
      }
    } catch (erro) {
      // Uma fonte fora do ar nao pode derrubar o portal: o ticker segue
      // exibindo o ultimo valor conhecido.
      this.logger.warn(
        `Falha ao sincronizar cotações (${this.provedor.nome}): ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }

    return atualizados;
  }

  private paraDto(indicador: {
    id: string;
    symbol: string;
    label: string;
    unit: string | null;
    icon: string | null;
    value: unknown;
    changePercent: unknown;
    changeAbsolute: unknown;
    source: string;
    position: number;
    lastUpdatedAt: Date;
  }): MarketIndicatorDto {
    return {
      id: indicador.id,
      symbol: indicador.symbol,
      label: indicador.label,
      unit: indicador.unit,
      icon: indicador.icon,
      // Decimal do Prisma: Number() evita mandar o objeto serializado ao
      // cliente, que esperaria um numero.
      value: Number(indicador.value),
      changePercent:
        indicador.changePercent === null ? null : Number(indicador.changePercent),
      changeAbsolute:
        indicador.changeAbsolute === null ? null : Number(indicador.changeAbsolute),
      source: indicador.source,
      position: indicador.position,
      lastUpdatedAt: indicador.lastUpdatedAt.toISOString(),
    };
  }
}
