// ============================================================
// Filas (BullMQ).
//
// A API só PRODUZ; quem consome são os workers, em processos
// separados (ADR 0003). Essa separação é o que permite reiniciar a
// API sem interromper um render de dez minutos.
//
// Um enfileiramento que falha não pode derrubar a requisição: o
// upload já está no disco, e perder a resposta faria o usuário
// reenviar 2 GB por causa de um Redis momentaneamente indisponível.
// A falha vira estado no projeto, com opção de tentar de novo.
// ============================================================

import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  FILA_ANALISE,
  FILA_MIDIA,
  FILA_RENDER,
  FILA_TRANSCRICAO,
  FILAS,
  PREFIXO_DAS_FILAS,
} from '@makucho/studio-contracts';

export { FILA_MIDIA, FILA_TRANSCRICAO, FILA_RENDER };

@Injectable()
export class FilaService implements OnModuleDestroy {
  private readonly log = new Logger(FilaService.name);
  private readonly conexao: IORedis;
  private readonly filas = new Map<string, Queue>();

  constructor() {
    this.conexao = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }

  private fila(nome: string): Queue {
    let fila = this.filas.get(nome);
    if (!fila) {
      fila = new Queue(nome, {
        connection: this.conexao,
        prefix: PREFIXO_DAS_FILAS,
        defaultJobOptions: {
          // Três tentativas com espera crescente: falha de FFmpeg por
          // disputa de CPU costuma passar sozinha na segunda.
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          // O histórico serve para depurar, não para acumular: cem
          // concluídos e quinhentos falhados cobrem uma semana de uso
          // sem encher o Redis.
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      });
      this.filas.set(nome, fila);
    }
    return fila;
  }

  async prepararMidia(projectId: string, mediaSourceId: string): Promise<boolean> {
    try {
      await this.fila(FILA_MIDIA).add(
        'preparar',
        { projectId, mediaSourceId },
        // jobId pelo mediaSourceId: um clique duplo em "concluir" não
        // vira dois FFmpeg disputando o mesmo arquivo.
        { jobId: `midia-${mediaSourceId}` },
      );
      return true;
    } catch (e) {
      this.log.error(`falha ao enfileirar mídia do projeto ${projectId}`, e as Error);
      return false;
    }
  }

  async transcrever(projectId: string, mediaSourceId: string): Promise<boolean> {
    try {
      await this.fila(FILA_TRANSCRICAO).add(
        'transcrever',
        { projectId, mediaSourceId },
        { jobId: `transcricao-${mediaSourceId}` },
      );
      return true;
    } catch (e) {
      this.log.error(`falha ao enfileirar transcrição do projeto ${projectId}`, e as Error);
      return false;
    }
  }

  /**
   * Análise automática. O jobId é o projeto e o job some ao terminar:
   * um job antigo guardado com o mesmo id bloquearia a próxima análise.
   */
  async analisar(projectId: string): Promise<boolean> {
    try {
      await this.fila(FILA_ANALISE).add(
        'analisar',
        { projectId },
        { jobId: `analise-${projectId}`, attempts: 2, removeOnComplete: true, removeOnFail: true },
      );
      return true;
    } catch (e) {
      this.log.error(`falha ao enfileirar análise do projeto ${projectId}`, e as Error);
      return false;
    }
  }

  async renderizar(
    projectId: string,
    editPlanId: string,
    renderId: string,
    clipsDesligados: string[] = [],
  ): Promise<boolean> {
    try {
      await this.fila(FILA_RENDER).add(
        'renderizar',
        { projectId, editPlanId, renderId, clipsDesligados },
        // jobId pelo renderId: cada exportação é um registro próprio,
        // e um clique duplo em "Exportar" não vira dois FFmpeg
        // disputando o mesmo arquivo de saída.
        { jobId: `render-${renderId}` },
      );
      return true;
    } catch (e) {
      this.log.error(`falha ao enfileirar render do projeto ${projectId}`, e as Error);
      return false;
    }
  }

  /** Quantos jobs esperam em cada fila. Alimenta o painel de status. */
  async situacao() {
    const contagens = await Promise.all(
      FILAS.map(async (nome) => {
        const fila = this.fila(nome);
        const [esperando, ativos, falhados] = await Promise.all([
          fila.getWaitingCount(),
          fila.getActiveCount(),
          fila.getFailedCount(),
        ]);
        return { fila: nome, esperando, ativos, falhados };
      }),
    );
    return contagens;
  }

  async onModuleDestroy() {
    await Promise.all([...this.filas.values()].map((f) => f.close()));
    await this.conexao.quit();
  }
}
