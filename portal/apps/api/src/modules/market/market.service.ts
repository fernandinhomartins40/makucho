import { Inject, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import type { Request } from 'express';
import type { MarketIndicatorDto } from '@makucho/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MARKET_DATA_PROVIDER, type MarketDataProvider } from './market-data.provider';

/** Ticker financeiro do topo do site (seção 19). */
@Injectable()
export class MarketService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Market');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(MARKET_DATA_PROVIDER) private readonly provedor: MarketDataProvider,
  ) {}

  /**
   * Primeira carga logo que a API sobe (o cron roda a cada 10 min): um
   * deploy não deixa o Radar com valores velhos. Sem await, para não
   * atrasar a subida se uma fonte estiver lenta.
   */
  onApplicationBootstrap(): void {
    if (this.provedor.nome === 'manual') return;
    void this.sincronizar().catch(() => undefined);
  }

  /** O Radar precisa destes três; os que faltarem são criados na sincronização. */
  private static readonly RADAR = [
    { symbol: 'IBOVESPA', chave: 'IBOV', label: 'Ibovespa', unit: 'pts', position: 0 },
    { symbol: 'USD', chave: 'USD', label: 'Dólar', unit: 'R$', position: 1 },
    { symbol: 'BTC', chave: 'BTC', label: 'Bitcoin', unit: 'US$', position: 3 },
  ];

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
    const [ativos, todos] = await Promise.all([
      this.prisma.marketIndicator.findMany({ where: { isActive: true }, select: { symbol: true } }),
      this.prisma.marketIndicator.findMany({ select: { symbol: true } }),
    ]);
    // Indicadores do Radar que nunca existiram: também são consultados, e só
    // são criados se a fonte devolver um valor (nunca aparece "0" no site).
    // Um indicador desativado no painel continua existindo e não é recriado.
    const faltantes =
      this.provedor.nome === 'manual'
        ? []
        : MarketService.RADAR.filter(
            (r) => !todos.some((t) => t.symbol.toUpperCase().includes(r.chave)),
          );
    const simbolos = [...ativos.map((a) => a.symbol), ...faltantes.map((f) => f.symbol)];
    if (simbolos.length === 0) return 0;

    let atualizados = 0;
    try {
      const cotacoes = await this.provedor.cotacoes(simbolos);

      for (const cotacao of cotacoes) {
        const novo = faltantes.find((f) => f.symbol === cotacao.symbol);
        if (novo) {
          await this.prisma.marketIndicator.create({
            data: {
              symbol: novo.symbol,
              label: novo.label,
              unit: novo.unit,
              position: novo.position,
              isActive: true,
              value: cotacao.value,
              changePercent: cotacao.changePercent ?? null,
              changeAbsolute: cotacao.changeAbsolute ?? null,
              source: cotacao.source ?? this.provedor.nome,
              lastUpdatedAt: cotacao.quotedAt ?? new Date(),
            } as never,
          });
          this.logger.log(`Indicador ${novo.symbol} criado automaticamente para o Radar`);
          atualizados += 1;
          continue;
        }
        await this.prisma.marketIndicator.updateMany({
          where: { symbol: cotacao.symbol },
          data: {
            value: cotacao.value,
            changePercent: cotacao.changePercent ?? null,
            changeAbsolute: cotacao.changeAbsolute ?? null,
            source: cotacao.source ?? this.provedor.nome,
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
    isActive?: boolean;
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
      isActive: indicador.isActive,
      lastUpdatedAt: indicador.lastUpdatedAt.toISOString(),
    };
  }
}
