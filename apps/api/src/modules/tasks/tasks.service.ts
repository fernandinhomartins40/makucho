import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostsService } from '../posts/posts.service';
import { AdsService } from '../ads/ads.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { MediaService } from '../media/media.service';
import { MarketService } from '../market/market.service';
import { AuthService } from '../auth/auth.service';

/**
 * Rotinas periodicas (secoes 10, 25 e 41).
 *
 * Todas sao idempotentes e protegidas por try/catch individual: uma tarefa
 * que falha nao pode impedir as outras nem derrubar o processo, porque uma
 * excecao nao tratada dentro de um @Cron encerra o Node.
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger('Tasks');

  constructor(
    private readonly posts: PostsService,
    private readonly ads: AdsService,
    private readonly analytics: AnalyticsService,
    private readonly media: MediaService,
    private readonly market: MarketService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Publicacao agendada. A cada minuto porque o editor escolhe o horario
   * com precisao de minuto; atrasar mais do que isso seria visivel.
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'publicar-agendados' })
  async publicarAgendados(): Promise<void> {
    await this.executar('publicar agendados', () => this.posts.publicarAgendados());
  }

  /** Expira anúncios cuja veiculação terminou. */
  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'expirar-anuncios' })
  async expirarAnuncios(): Promise<void> {
    await this.executar('expirar anúncios', () => this.ads.expirarVencidos());
  }

  /** Atualiza o ticker a partir do provedor configurado. */
  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'sincronizar-mercado' })
  async sincronizarMercado(): Promise<void> {
    await this.executar('sincronizar cotações', () => this.market.sincronizar());
  }

  /**
   * Faxina diaria, de madrugada: refresh tokens expirados, midias marcadas
   * como excluidas e metricas fora da janela de retencao.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'faxina-diaria' })
  async faxinaDiaria(): Promise<void> {
    await this.executar('limpar tokens expirados', () => this.auth.limparTokensExpirados());
    await this.executar('limpar mídias excluídas', () => this.media.limparExcluidas());
    await this.executar('limpar métricas antigas', () => this.analytics.limparAntigas());
  }

  private async executar(nome: string, tarefa: () => Promise<number>): Promise<void> {
    try {
      const afetados = await tarefa();
      if (afetados > 0) this.logger.log(`${nome}: ${afetados} registro(s)`);
    } catch (erro) {
      this.logger.error(
        `Falha na tarefa "${nome}": ${erro instanceof Error ? erro.message : String(erro)}`,
        erro instanceof Error ? erro.stack : undefined,
      );
    }
  }
}
