import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type {
  AdBillingStatus,
  AdDeviceTarget,
  AdPlacement,
  AdPricingModel,
  AdStatus,
  AdvertisementDto,
  AdsSummaryDto,
} from '@makucho/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, detectarDispositivo } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { hashDeSessao, normalizarReferrer } from '../../common/utils/session.util';
import type { AppConfig } from '../../config/configuration';

/** Sorteio ponderado sem reposição: chance proporcional ao peso. */
function sortearPonderado<T>(opcoes: Array<{ item: T; peso: number }>, quantidade: number): T[] {
  const restantes = [...opcoes];
  const escolhidos: T[] = [];
  while (escolhidos.length < quantidade && restantes.length > 0) {
    const total = restantes.reduce((soma, o) => soma + o.peso, 0);
    let alvo = Math.random() * total;
    let indice = restantes.findIndex((o) => (alvo -= o.peso) <= 0);
    if (indice < 0) indice = restantes.length - 1;
    escolhidos.push(restantes[indice]!.item);
    restantes.splice(indice, 1);
  }
  return escolhidos;
}

/**
 * Publicidade (secao 25).
 *
 * O criativo e sempre uma imagem processada pelo pipeline + um link. Nao
 * aceitamos HTML ou script do anunciante: seria uma porta aberta para
 * injecao de codigo em todas as paginas do portal.
 */
@Injectable()
export class AdsService {
  private readonly logger = new Logger('Ads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private readonly incluir = {
    media: { include: { variants: true } },
    placements: true,
  };

  /**
   * Anúncios a exibir em um slot, escolhidos por competição de valor.
   *
   * 1. Elegíveis: ativos, com imagem, dentro do período, no dispositivo e
   *    na posição, e sem ter batido a meta de impressões (CPM).
   * 2. Patrocínio: havendo um exclusivo elegível, só exclusivos disputam.
   * 3. Rotação ponderada: cada exibição sorteia com chance proporcional ao
   *    eCPM (quanto o anúncio rende por mil exibições) vezes o bônus de
   *    prioridade. Quem paga mais aparece mais, sem tirar do ar quem paga
   *    menos. Cortesias e anúncios sem valor ficam com peso mínimo.
   */
  async paraExibicao(
    placement: AdPlacement,
    dispositivo: AdDeviceTarget = 'ALL',
    limite = 1,
  ): Promise<AdvertisementDto[]> {
    const agora = new Date();

    const candidatos = await this.prisma.advertisement.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        mediaId: { not: null },
        placements: { some: { placement } },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: agora } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: agora } }] },
        ],
        ...(dispositivo === 'ALL' ? {} : { device: { in: ['ALL', dispositivo] } }),
      },
      include: this.incluir,
    });

    let elegiveis = candidatos.filter((a) => !a.impressionGoal || a.impressions < a.impressionGoal);
    if (elegiveis.some((a) => a.isExclusive)) elegiveis = elegiveis.filter((a) => a.isExclusive);
    if (elegiveis.length === 0) return [];

    const audiencia = await this.audienciaDiaria(placement);
    const escolhidos = sortearPonderado(
      elegiveis.map((a) => ({ item: a, peso: this.pesoCompeticao(a, audiencia) })),
      limite,
    );

    const mobiles = await this.carregarMobiles(escolhidos);
    return escolhidos.map((a) => this.paraDto(a, mobiles.get(a.mobileMediaId ?? ''), audiencia));
  }

  /** Impressões médias por dia na posição (últimos 7 dias; mínimo 100). */
  private async audienciaDiaria(placement?: AdPlacement): Promise<number> {
    const desde = new Date(Date.now() - 7 * 86400000);
    const total = await this.prisma.adEvent.count({
      where: { type: 'impression', createdAt: { gte: desde }, ...(placement ? { placement } : {}) },
    });
    return Math.max(100, total / 7);
  }

  /**
   * eCPM em R$ × bônus de prioridade. É o que decide a disputa da posição.
   * `audiencia` converte contratos de valor fixo em valor por mil exibições.
   */
  private pesoCompeticao(
    a: {
      pricingModel: AdPricingModel;
      price: unknown;
      billingStatus: AdBillingStatus;
      startsAt: Date | null;
      endsAt: Date | null;
      impressions: number;
      clicks: number;
      priority: number;
    },
    audiencia: number,
  ): number {
    const preco = a.price === null || a.price === undefined ? 0 : Number(a.price);
    let ecpm = 0;
    if (a.billingStatus !== 'COURTESY' && preco > 0) {
      if (a.pricingModel === 'CPM') {
        ecpm = preco;
      } else if (a.pricingModel === 'CPC') {
        // CTR real depois de 200 impressões; antes disso, 1% de referência.
        const ctr = a.impressions >= 200 ? a.clicks / a.impressions : 0.01;
        ecpm = preco * ctr * 1000;
      } else {
        const dias =
          a.startsAt && a.endsAt
            ? Math.max(1, Math.ceil((a.endsAt.getTime() - a.startsAt.getTime()) / 86400000))
            : 30;
        ecpm = (preco / dias / audiencia) * 1000;
      }
    }
    const base = Math.max(ecpm, 0.01); // cortesia/sem valor: só preenche espaço vazio
    return Number((base * (1 + a.priority / 100)).toFixed(4));
  }

  async listar(filtro: {
    page: number;
    perPage: number;
    status?: AdStatus;
    placement?: AdPlacement;
    search?: string;
    billingStatus?: AdBillingStatus;
  }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (filtro.status) where.status = filtro.status;
    if (filtro.billingStatus) where.billingStatus = filtro.billingStatus;
    if (filtro.placement) where.placements = { some: { placement: filtro.placement } };
    if (filtro.search) {
      where.OR = [
        { name: { contains: filtro.search, mode: 'insensitive' } },
        { advertiser: { contains: filtro.search, mode: 'insensitive' } },
      ];
    }

    const [anuncios, total] = await Promise.all([
      this.prisma.advertisement.findMany({
        where,
        include: this.incluir,
        // Os que vencem antes aparecem primeiro: é o que pede ação.
        orderBy: [{ endsAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (filtro.page - 1) * filtro.perPage,
        take: filtro.perPage,
      }),
      this.prisma.advertisement.count({ where }),
    ]);

    const mobiles = await this.carregarMobiles(anuncios);
    const totalPages = Math.max(1, Math.ceil(total / filtro.perPage));

    return {
      data: anuncios.map((a) => this.paraDto(a, mobiles.get(a.mobileMediaId ?? ''))),
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

  async buscarPorId(id: string): Promise<AdvertisementDto> {
    const anuncio = await this.prisma.advertisement.findFirst({
      where: { id, deletedAt: null },
      include: this.incluir,
    });
    if (!anuncio) {
      throw new NotFoundException({ code: 'AD_NOT_FOUND', message: 'Anúncio não encontrado' });
    }
    const mobiles = await this.carregarMobiles([anuncio]);
    return this.paraDto(anuncio, mobiles.get(anuncio.mobileMediaId ?? ''));
  }

  async criar(
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<AdvertisementDto> {
    const { placements, ...campos } = dados as {
      placements: AdPlacement[];
      [k: string]: unknown;
    };
    if (campos.billingStatus === 'PAID' && !campos.paidAt) campos.paidAt = new Date();
    this.validarVeiculacao(
      (dados.status as AdStatus | undefined) ?? 'DRAFT',
      (dados.mediaId as string | null | undefined) ?? null,
      (dados.startsAt as Date | null | undefined) ?? null,
      (dados.endsAt as Date | null | undefined) ?? null,
    );

    const anuncio = await this.prisma.advertisement.create({
      // O cast recai sobre o objeto inteiro: os campos ja passaram pelo Zod
      // em criarAnuncioSchema, mas o Prisma nao consegue inferir isso a
      // partir de um Record<string, unknown>.
      data: {
        ...campos,
        placements: {
          create: placements.map((placement, i) => ({ placement, position: i })),
        },
      } as never,
      include: this.incluir,
    });

    await this.audit.registrar({
      userId,
      action: 'create',
      resource: 'advertisement',
      resourceId: anuncio.id,
      summary: `Anúncio criado: ${anuncio.name}`,
      request,
    });

    const mobiles = await this.carregarMobiles([anuncio]);
    return this.paraDto(anuncio, mobiles.get(anuncio.mobileMediaId ?? ''));
  }

  async atualizar(
    id: string,
    dados: Record<string, unknown>,
    userId: string,
    request: Request,
  ): Promise<AdvertisementDto> {
    const existe = await this.prisma.advertisement.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, mediaId: true, startsAt: true, endsAt: true },
    });
    if (!existe) {
      throw new NotFoundException({ code: 'AD_NOT_FOUND', message: 'Anúncio não encontrado' });
    }

    const { placements, ...campos } = dados as {
      placements?: AdPlacement[];
      [k: string]: unknown;
    };
    // Marcou como pago sem data: registra agora. Voltou a pendente: limpa.
    if (campos.billingStatus === 'PAID' && campos.paidAt === undefined) campos.paidAt = new Date();
    if (campos.billingStatus && campos.billingStatus !== 'PAID' && campos.paidAt === undefined) campos.paidAt = null;
    this.validarVeiculacao(
      (dados.status as AdStatus | undefined) ?? existe.status,
      dados.mediaId === undefined ? existe.mediaId : dados.mediaId as string | null,
      dados.startsAt === undefined ? existe.startsAt : dados.startsAt as Date | null,
      dados.endsAt === undefined ? existe.endsAt : dados.endsAt as Date | null,
    );

    // A lista de posicoes e substituida por inteiro: e mais simples e mais
    // previsivel do que tentar casar o que entrou com o que ja existia.
    const anuncio = await this.prisma.advertisement.update({
      where: { id },
      data: {
        ...campos,
        ...(placements
          ? {
              placements: {
                deleteMany: {},
                create: placements.map((placement, i) => ({ placement, position: i })),
              },
            }
          : {}),
      } as never,
      include: this.incluir,
    });

    await this.audit.registrar({
      userId,
      action: 'update',
      resource: 'advertisement',
      resourceId: id,
      summary: `Anúncio atualizado: ${anuncio.name}`,
      request,
    });

    const mobiles = await this.carregarMobiles([anuncio]);
    return this.paraDto(anuncio, mobiles.get(anuncio.mobileMediaId ?? ''));
  }

  async excluir(id: string, userId: string, request: Request): Promise<void> {
    const anuncio = await this.prisma.advertisement.findFirst({
      where: { id, deletedAt: null },
      select: { name: true },
    });
    if (!anuncio) {
      throw new NotFoundException({ code: 'AD_NOT_FOUND', message: 'Anúncio não encontrado' });
    }

    await this.prisma.advertisement.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.registrar({
      userId,
      action: 'delete',
      resource: 'advertisement',
      resourceId: id,
      summary: `Anúncio excluído: ${anuncio.name}`,
      request,
    });
  }

  private validarVeiculacao(status: AdStatus, mediaId: string | null, inicio: Date | null, fim: Date | null): void {
    if (status === 'ACTIVE' && !mediaId) {
      throw new BadRequestException({ code: 'AD_MEDIA_REQUIRED', message: 'Escolha uma imagem antes de ativar o anúncio.' });
    }
    if (inicio && fim && fim.getTime() <= inicio.getTime()) {
      throw new BadRequestException({ code: 'AD_PERIOD_INVALID', message: 'A data final deve ser posterior à inicial.' });
    }
  }

  // ============================================================
  // MEDICAO
  // ============================================================

  /**
   * Registra impressao ou clique.
   *
   * Nunca lanca erro para o visitante: falha de metrica nao pode quebrar a
   * pagina nem o redirecionamento do clique.
   */
  async registrarEvento(
    dados: { adId: string; type: 'impression' | 'click'; placement?: AdPlacement },
    request: Request,
  ): Promise<void> {
    try {
      const existe = await this.prisma.advertisement.findFirst({
        where: { id: dados.adId, deletedAt: null },
        select: { id: true },
      });
      if (!existe) return;

      const salt = this.config.get('analytics', { infer: true }).sessionSalt;

      await this.prisma.$transaction([
        this.prisma.adEvent.create({
          data: {
            adId: dados.adId,
            type: dados.type,
            placement: dados.placement ?? null,
            sessionHash: hashDeSessao(request, salt),
            device: detectarDispositivo(request.headers['user-agent']),
            referrer: normalizarReferrer(request.headers.referer),
          },
        }),
        // Contadores agregados no proprio anuncio: a tela do painel nao
        // precisa varrer a tabela de eventos para mostrar o total.
        this.prisma.advertisement.update({
          where: { id: dados.adId },
          data:
            dados.type === 'click'
              ? { clicks: { increment: 1 } }
              : { impressions: { increment: 1 } },
        }),
      ]);
    } catch (erro) {
      this.logger.warn(
        `Falha ao registrar ${dados.type} do anúncio ${dados.adId}: ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }
  }

  /** Destino do clique, validado antes de redirecionar. */
  async destinoDoClique(id: string): Promise<string | null> {
    const anuncio = await this.prisma.advertisement.findFirst({
      where: { id, deletedAt: null },
      select: { targetUrl: true },
    });
    if (!anuncio) return null;

    // Redirecionar sem conferir o protocolo transformaria a rota em um
    // open redirect para javascript: ou data:.
    try {
      const url = new URL(anuncio.targetUrl);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  /** Métricas por anúncio para a tela de relatórios. */
  async metricas(dias = 30) {
    const desde = new Date(Date.now() - dias * 86400000);

    const eventos = await this.prisma.adEvent.groupBy({
      by: ['adId', 'type'],
      where: { createdAt: { gte: desde } },
      _count: { _all: true },
    });

    const porAnuncio = new Map<string, { impressions: number; clicks: number }>();
    for (const linha of eventos) {
      const atual = porAnuncio.get(linha.adId) ?? { impressions: 0, clicks: 0 };
      if (linha.type === 'click') atual.clicks += linha._count._all;
      else atual.impressions += linha._count._all;
      porAnuncio.set(linha.adId, atual);
    }

    const anuncios = await this.prisma.advertisement.findMany({
      where: { id: { in: [...porAnuncio.keys()] } },
      select: { id: true, name: true, advertiser: true },
    });

    return anuncios
      .map((a) => {
        const m = porAnuncio.get(a.id) ?? { impressions: 0, clicks: 0 };
        return {
          ...a,
          ...m,
          // CTR em porcentagem, com duas casas.
          ctr: m.impressions > 0 ? Number(((m.clicks / m.impressions) * 100).toFixed(2)) : 0,
        };
      })
      .sort((a, b) => b.impressions - a.impressions);
  }

  /**
   * Painel comercial: o que vence, o que venceu, o que cobrar e quem está
   * ganhando cada posição.
   */
  async resumo(): Promise<AdsSummaryDto> {
    const agora = new Date();
    const dia = 86400000;
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const todos = await this.prisma.advertisement.findMany({
      where: { deletedAt: null },
      include: { placements: true },
      orderBy: { endsAt: 'asc' },
    });
    const valor = (a: (typeof todos)[number]) => this.valorDevido(a) ?? 0;
    const dias = (d: Date) => Math.ceil((d.getTime() - agora.getTime()) / dia);
    const ativoAgora = (a: (typeof todos)[number]) =>
      a.status === 'ACTIVE' && (!a.startsAt || a.startsAt <= agora) && (!a.endsAt || a.endsAt >= agora);

    const vencendo = todos
      .filter((a) => ativoAgora(a) && a.endsAt && a.endsAt.getTime() - agora.getTime() <= 7 * dia)
      .map((a) => ({ id: a.id, name: a.name, advertiser: a.advertiser, endsAt: a.endsAt!.toISOString(), dias: dias(a.endsAt!) }));

    const vencidos = todos
      .filter((a) => (a.status === 'EXPIRED' || (a.endsAt && a.endsAt < agora)) && a.endsAt && agora.getTime() - a.endsAt.getTime() <= 90 * dia)
      .map((a) => ({
        id: a.id, name: a.name, advertiser: a.advertiser, endsAt: a.endsAt!.toISOString(),
        dias: Math.abs(dias(a.endsAt!)), billingStatus: a.billingStatus,
      }))
      .sort((x, y) => x.dias - y.dias);

    const cobraveis = todos.filter((a) => a.billingStatus !== 'COURTESY');
    const soma = (lista: typeof todos) => Number(lista.reduce((t, a) => t + valor(a), 0).toFixed(2));
    const atrasados = cobraveis.filter((a) => a.billingStatus === 'OVERDUE');

    const porAnunciante = new Map<string, typeof todos>();
    for (const a of cobraveis) {
      const chave = a.advertiser?.trim() || 'Sem anunciante';
      porAnunciante.set(chave, [...(porAnunciante.get(chave) ?? []), a]);
    }

    // Competição: fatia de cada anúncio elegível agora, por posição.
    const audiencias = new Map<string, number>();
    const competicao: AdsSummaryDto['competicao'] = [];
    const ativos = todos.filter((a) => ativoAgora(a) && a.mediaId && (!a.impressionGoal || a.impressions < a.impressionGoal));
    const posicoes = [...new Set(ativos.flatMap((a) => a.placements.map((p) => p.placement)))];
    for (const placement of posicoes) {
      if (!audiencias.has(placement)) audiencias.set(placement, await this.audienciaDiaria(placement));
      let naPosicao = ativos.filter((a) => a.placements.some((p) => p.placement === placement));
      if (naPosicao.some((a) => a.isExclusive)) naPosicao = naPosicao.filter((a) => a.isExclusive);
      const pesos = naPosicao.map((a) => ({ a, peso: this.pesoCompeticao(a, audiencias.get(placement)!) }));
      const total = pesos.reduce((t, x) => t + x.peso, 0) || 1;
      competicao.push({
        placement,
        anuncios: pesos
          .map(({ a, peso }) => ({ id: a.id, name: a.name, advertiser: a.advertiser, share: Number(((peso / total) * 100).toFixed(1)), exclusivo: a.isExclusive }))
          .sort((x, y) => y.share - x.share),
      });
    }

    return {
      ativos: todos.filter(ativoAgora).length,
      vencendo,
      vencidos,
      cobranca: {
        contratadoMes: soma(cobraveis.filter((a) => (a.startsAt ?? a.createdAt) >= inicioMes)),
        recebido: soma(cobraveis.filter((a) => a.billingStatus === 'PAID')),
        aReceber: soma(cobraveis.filter((a) => a.billingStatus === 'PENDING' || a.billingStatus === 'INVOICED')),
        emAtraso: soma(atrasados),
        atrasados: atrasados.map((a) => ({
          id: a.id, name: a.name, advertiser: a.advertiser,
          billingDueDate: (a.billingDueDate ?? a.endsAt ?? a.createdAt).toISOString(), valor: valor(a),
        })),
      },
      anunciantes: [...porAnunciante.entries()]
        .map(([advertiser, lista]) => ({
          advertiser,
          anuncios: lista.length,
          contratado: soma(lista),
          recebido: soma(lista.filter((a) => a.billingStatus === 'PAID')),
          aReceber: soma(lista.filter((a) => a.billingStatus !== 'PAID')),
        }))
        .sort((x, y) => y.contratado - x.contratado),
      competicao,
    };
  }

  /** Cobrança vencida e não paga vira "Em atraso" (tarefa agendada). */
  async marcarAtrasados(): Promise<number> {
    const { count } = await this.prisma.advertisement.updateMany({
      where: {
        deletedAt: null,
        billingStatus: { in: ['PENDING', 'INVOICED'] },
        billingDueDate: { lt: new Date() },
      },
      data: { billingStatus: 'OVERDUE' },
    });
    if (count > 0) this.logger.log(`${count} cobrança(s) marcada(s) como em atraso`);
    return count;
  }

  /** Expira automaticamente o que passou da data final (tarefa agendada). */
  async expirarVencidos(): Promise<number> {
    const { count } = await this.prisma.advertisement.updateMany({
      where: { status: 'ACTIVE', endsAt: { lt: new Date() }, deletedAt: null },
      data: { status: 'EXPIRED' },
    });
    if (count > 0) this.logger.log(`${count} anúncio(s) expirado(s)`);
    return count;
  }

  /**
   * O criativo mobile nao tem relacao declarada no schema (e apenas um id),
   * entao carregamos as midias em uma consulta so em vez de uma por anuncio.
   */
  private async carregarMobiles(
    anuncios: Array<{ mobileMediaId: string | null }>,
  ): Promise<Map<string, Parameters<MediaService['paraDto']>[0]>> {
    const ids = [...new Set(anuncios.map((a) => a.mobileMediaId).filter(Boolean))] as string[];
    if (ids.length === 0) return new Map();

    const midias = await this.prisma.media.findMany({
      where: { id: { in: ids } },
      include: { variants: true },
    });

    return new Map(midias.map((m) => [m.id, m as never]));
  }

  /** Quanto cobrar até agora: FIXED = total; CPM/CPC = pelo que foi entregue. */
  private valorDevido(a: {
    pricingModel: AdPricingModel;
    price: unknown;
    billingStatus: AdBillingStatus;
    impressions: number;
    clicks: number;
  }): number | null {
    if (a.billingStatus === 'COURTESY') return 0;
    if (a.price === null || a.price === undefined) return null;
    const preco = Number(a.price);
    const valor =
      a.pricingModel === 'CPM' ? (a.impressions / 1000) * preco
        : a.pricingModel === 'CPC' ? a.clicks * preco
          : preco;
    return Number(valor.toFixed(2));
  }

  private paraDto(
    anuncio: Record<string, unknown>,
    mobileMedia?: Parameters<MediaService['paraDto']>[0],
    audiencia = 1000,
  ): AdvertisementDto {
    const a = anuncio as {
      id: string;
      name: string;
      advertiser: string | null;
      media?: Parameters<MediaService['paraDto']>[0] | null;
      targetUrl: string;
      alt: string;
      openInNewTab: boolean;
      linkRel: string;
      status: AdStatus;
      device: AdDeviceTarget;
      priority: number;
      widthPx: number | null;
      heightPx: number | null;
      placements?: Array<{ placement: AdPlacement }>;
      startsAt: Date | null;
      endsAt: Date | null;
      impressions: number;
      clicks: number;
      format: AdvertisementDto['format'];
      isExclusive: boolean;
      pricingModel: AdPricingModel;
      price: unknown;
      impressionGoal: number | null;
      billingStatus: AdBillingStatus;
      billingDueDate: Date | null;
      paidAt: Date | null;
      contactName: string | null;
      contactEmail: string | null;
      contactPhone: string | null;
      billingNotes: string | null;
    };

    return {
      id: a.id,
      name: a.name,
      advertiser: a.advertiser,
      media: a.media ? this.media.paraDto(a.media) : null,
      mobileMedia: mobileMedia ? this.media.paraDto(mobileMedia) : null,
      targetUrl: a.targetUrl,
      alt: a.alt,
      openInNewTab: a.openInNewTab,
      linkRel: a.linkRel,
      status: a.status,
      device: a.device,
      priority: a.priority,
      widthPx: a.widthPx,
      heightPx: a.heightPx,
      placements: (a.placements ?? []).map((p) => p.placement),
      startsAt: a.startsAt ? a.startsAt.toISOString() : null,
      endsAt: a.endsAt ? a.endsAt.toISOString() : null,
      impressions: a.impressions,
      clicks: a.clicks,
      format: a.format ?? null,
      isExclusive: a.isExclusive ?? false,
      pricingModel: a.pricingModel ?? 'FIXED',
      price: a.price === null || a.price === undefined ? null : Number(a.price),
      impressionGoal: a.impressionGoal ?? null,
      billingStatus: a.billingStatus ?? 'PENDING',
      billingDueDate: a.billingDueDate ? a.billingDueDate.toISOString() : null,
      paidAt: a.paidAt ? a.paidAt.toISOString() : null,
      contactName: a.contactName ?? null,
      contactEmail: a.contactEmail ?? null,
      contactPhone: a.contactPhone ?? null,
      billingNotes: a.billingNotes ?? null,
      amountDue: this.valorDevido(a),
      competitionWeight: this.pesoCompeticao(a, audiencia),
    };
  }
}
