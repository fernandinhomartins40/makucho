// ============================================================
// A trava de custo (seção 26.7, terceira regra).
//
// "Trave o gasto por workspace. Limite mensal configurável, com aviso
// em 80% e bloqueio em 100% — a mesma lógica da cota de disco, pelo
// mesmo motivo: o cliente precisa saber antes de bater no teto, não
// depois."
//
// A ordem importa: conferir ANTES de chamar, registrar DEPOIS de
// receber. Registrar antes contaria o que não aconteceu; conferir
// depois seria conferir a fatura.
// ============================================================

import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  LIMITE_MENSAL_PADRAO_CENTAVOS,
  avisoDeUso,
  cabeNoLimite,
  custoEmCentavos,
  estadoDoLimite,
  periodoDe,
} from '@makucho/studio-contracts';
import type { ChamadaDeIa, SituacaoDeUso } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import type { ModeloDeIa } from '@makucho/studio-contracts';

type Modelo = ModeloDeIa;

@Injectable()
export class UsoDeIaService {
  private readonly log = new Logger(UsoDeIaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Quanto este workspace já gastou no mês corrente. */
  async situacao(workspaceId: string): Promise<SituacaoDeUso> {
    const periodo = periodoDe();

    const [linhas, credencial] = await Promise.all([
      this.prisma.aiUsage.findMany({ where: { workspaceId, period: periodo } }),
      this.prisma.aiCredential.findUnique({
        where: { workspaceId },
        select: { monthlyLimitCents: true },
      }),
    ]);

    const porChamada: Record<string, number> = {};
    let gasto = 0;
    let chamadas = 0;

    for (const linha of linhas) {
      gasto += linha.costCents;
      chamadas += linha.calls;
      porChamada[linha.call] = linha.costCents;
    }

    return {
      periodo,
      gastoCentavos: gasto,
      limiteCentavos: credencial?.monthlyLimitCents ?? LIMITE_MENSAL_PADRAO_CENTAVOS,
      chamadas,
      porChamada: porChamada as SituacaoDeUso['porChamada'],
    };
  }

  /**
   * Barra a chamada que estouraria o teto.
   *
   * A estimativa vem de quem chama, calculada pelo MÁXIMO de tokens
   * que o pedido autoriza. Estimar pela média deixaria passar
   * justamente a chamada grande — que é a que estoura.
   */
  async conferirAntes(
    workspaceId: string,
    modelo: Modelo,
    maxTokensDeEntrada: number,
    maxTokensDeSaida: number,
  ): Promise<SituacaoDeUso> {
    const uso = await this.situacao(workspaceId);
    const estimativa = custoEmCentavos(modelo, maxTokensDeEntrada, maxTokensDeSaida);

    if (!cabeNoLimite(uso, estimativa)) {
      // 403 e não 402: o limite é uma decisão do próprio workspace,
      // não uma cobrança pendente com a MAKUCHO.
      throw new ForbiddenException(
        avisoDeUso({ ...uso, gastoCentavos: uso.limiteCentavos }) ??
          'O limite de IA deste mês foi atingido.',
      );
    }

    return uso;
  }

  /**
   * Soma o que a chamada custou de verdade.
   *
   * Upsert com incremento, e não leitura seguida de escrita: duas
   * chamadas simultâneas do mesmo workspace perderiam uma das
   * contagens, e a que se perde é sempre a que faltava para bater no
   * teto.
   */
  async registrar(
    workspaceId: string,
    chamada: ChamadaDeIa,
    modelo: Modelo,
    inputTokens: number,
    outputTokens: number,
    /** Tokens de entrada que acertaram o cache (cobrados a uma fração). */
    tokensEmCache = 0,
  ): Promise<number> {
    const custo = custoEmCentavos(modelo, inputTokens, outputTokens, tokensEmCache);
    const periodo = periodoDe();

    try {
      await this.prisma.aiUsage.upsert({
        where: { workspaceId_period_call: { workspaceId, period: periodo, call: chamada } },
        create: {
          workspaceId,
          period: periodo,
          call: chamada,
          costCents: custo,
          calls: 1,
          inputTokens,
          outputTokens,
        },
        update: {
          costCents: { increment: custo },
          calls: { increment: 1 },
          inputTokens: { increment: inputTokens },
          outputTokens: { increment: outputTokens },
        },
      });
    } catch (e) {
      // O gasto já aconteceu: falhar aqui devolveria erro ao usuário
      // por uma chamada que deu certo. Fica no log, que é onde uma
      // divergência de contabilidade pode ser investigada.
      this.log.error(
        `não foi possível registrar ${custo} centavos de ${chamada} no workspace ${workspaceId}`,
        e as Error,
      );
    }

    return custo;
  }

  /** O aviso que a tela mostra, quando há um. */
  async aviso(workspaceId: string): Promise<{ texto: string | null; estado: string }> {
    const uso = await this.situacao(workspaceId);
    return { texto: avisoDeUso(uso), estado: estadoDoLimite(uso) };
  }
}
