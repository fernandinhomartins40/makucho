// ============================================================
// Proposta de edição — o passo entre a transcrição e o editor.
//
// Dois caminhos chegam aqui:
//
//   - automático: a transcrição termina e o worker enfileira a
//     análise. Ninguém está olhando, então o projeto PRECISA sair de
//     "analisando": se a IA não estiver disponível (sem credencial,
//     teto do mês, resposta inaproveitável), entra a montagem
//     automática sem IA, e o aviso diz o que aconteceu;
//   - manual: o botão "Analisar com IA" do editor. Aí existe uma
//     proposta na tela, e trocá-la em silêncio por uma montagem sem
//     IA seria pior que dizer que a IA falhou.
//
// A fila é consumida AQUI, na API, e não num worker: é a API que tem
// a credencial cifrada, o teto de gasto e o registro de uso.
// ============================================================

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  FILA_ANALISE,
  PREFIXO_DAS_FILAS,
  compilarProposta,
  montarPropostaSemIa,
} from '@makucho/studio-contracts';
import type { SemanticIssue } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import type { TenantContext } from '../../common/tenant';
import { EditPlansService } from '../edit-plans/edit-plans.service';
import { AcabamentoService } from './acabamento.service';
import { AnaliseService } from './analise.service';

export interface ResultadoDaProposta {
  ok: boolean;
  /** "ia" quando o modelo montou; "automatica" quando foi a reserva. */
  origem: 'ia' | 'automatica';
  confianca: number;
  avisos: string[];
  problemas: SemanticIssue[];
  erro?: string;
}

/** De quanto em quanto tempo procura projeto parado em "analisando". */
const VARREDURA_MS = 60_000;
/** Projeto em "analisando" há mais que isso sem job é projeto órfão. */
const ORFAO_APOS_MS = 3 * 60_000;

@Injectable()
export class PropostaService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PropostaService.name);
  private conexao: IORedis | null = null;
  private fila: Queue | null = null;
  private worker: Worker | null = null;
  private varredura: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analise: AnaliseService,
    private readonly planos: EditPlansService,
    private readonly acabamento: AcabamentoService,
  ) {}

  onModuleInit() {
    // Nos testes de unidade não há Redis: a API sobe sem a fila.
    if (process.env.STUDIO_SEM_FILA_DE_ANALISE === '1') return;

    this.conexao = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });

    this.fila = new Queue(FILA_ANALISE, {
      connection: this.conexao,
      prefix: PREFIXO_DAS_FILAS,
      // Job removido ao terminar: o jobId é o projeto, e um job antigo
      // guardado bloquearia a próxima análise do mesmo projeto.
      defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 20_000 }, removeOnComplete: true, removeOnFail: true },
    });

    this.worker = new Worker<{ projectId: string }>(
      FILA_ANALISE,
      async (job) => {
        await this.automatica(job.data.projectId);
      },
      { connection: this.conexao, prefix: PREFIXO_DAS_FILAS, concurrency: 1 },
    );

    this.worker.on('failed', (job, erro) => {
      this.log.error(`análise automática do projeto ${job?.data.projectId} falhou: ${erro.message}`);
    });

    // A varredura cobre o que a fila não cobre: projeto que já estava
    // parado antes desta versão existir, ou transcrição que terminou
    // com o Redis fora do ar.
    const varrer = () => void this.varrerOrfaos().catch((e: Error) => this.log.warn(`varredura: ${e.message}`));
    setTimeout(varrer, 5_000);
    this.varredura = setInterval(varrer, VARREDURA_MS);
  }

  async onModuleDestroy() {
    if (this.varredura) clearInterval(this.varredura);
    await this.worker?.close();
    await this.fila?.close();
    await this.conexao?.quit().catch(() => undefined);
  }

  /** Enfileira a análise de um projeto. Devolve false sem Redis. */
  async enfileirar(projectId: string): Promise<boolean> {
    if (!this.fila) return false;
    try {
      await this.fila.add('analisar', { projectId }, { jobId: `analise-${projectId}` });
      return true;
    } catch (e) {
      this.log.error(`falha ao enfileirar a análise do projeto ${projectId}`, e as Error);
      return false;
    }
  }

  private async varrerOrfaos() {
    const parados = await this.prisma.project.findMany({
      where: { state: 'ANALYZING', updatedAt: { lt: new Date(Date.now() - ORFAO_APOS_MS) } },
      select: { id: true },
      take: 20,
    });
    for (const p of parados) {
      await this.enfileirar(p.id);
    }
  }

  /**
   * O caminho automático: sempre termina com o projeto fora de
   * "analisando" — com proposta, ou com uma falha que explica o motivo.
   */
  async automatica(projectId: string): Promise<ResultadoDaProposta | null> {
    const projeto = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!projeto || projeto.state !== 'ANALYZING') return null;

    try {
      return await this.gerar(projeto.workspaceId, projectId, { comReserva: true });
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      this.log.error(`proposta do projeto ${projectId} falhou: ${mensagem}`);
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          state: 'FAILED_RETRYABLE',
          publicError: 'Não foi possível montar a proposta de edição. Tente de novo.',
        },
      });
      return null;
    }
  }

  /**
   * Gera, salva e ativa a proposta.
   *
   * Com `comReserva`, qualquer falha da IA cai na montagem automática.
   * Sem ela, a falha volta para quem pediu.
   */
  async gerar(
    workspaceId: string,
    projectId: string,
    opcoes: { comReserva: boolean },
  ): Promise<ResultadoDaProposta> {
    // Pedido manual ("refazer a análise") quer uma resposta nova, não a
    // guardada; o automático aceita o cache.
    const resultado = await this.analise.analisar(workspaceId, projectId, { semCache: !opcoes.comReserva });

    let plano: unknown;
    let resposta: ResultadoDaProposta;

    if (resultado.ok) {
      plano = resultado.plano;
      resposta = {
        ok: true,
        origem: 'ia',
        confianca: resultado.confianca,
        avisos: resultado.avisos,
        problemas: resultado.problemas,
      };
    } else if (opcoes.comReserva) {
      const reserva = await this.montarSemIa(workspaceId, projectId, resultado.erro);
      if (!reserva) {
        throw new Error(`sem proposta da IA (${resultado.erro}) e sem fala para montar`);
      }
      plano = reserva.plano;
      resposta = { ok: true, origem: 'automatica', confianca: 1, avisos: reserva.avisos, problemas: [] };
    } else {
      return { ok: false, origem: 'ia', confianca: 0, avisos: [], problemas: [], erro: resultado.erro };
    }

    const sistema: TenantContext = { userId: 'sistema', workspaceId, role: 'OWNER' };
    await this.planos.salvar(sistema, projectId, plano, resposta.origem === 'ia' ? 'ai' : 'user');
    await this.ativar(projectId);

    // O motivo fica no projeto: a tela diz POR QUE a IA não montou
    // (chave recusada, sem crédito, rede), e não só que não montou.
    await this.prisma.project
      .update({
        where: { id: projectId },
        data: { aiFallbackReason: resposta.origem === 'ia' || resultado.ok ? null : resultado.erro.slice(0, 500) },
      })
      .catch(() => undefined);

    return resposta;
  }

  /** Monta a proposta sem IA a partir da transcrição salva. */
  private async montarSemIa(workspaceId: string, projectId: string, motivo: string) {
    const transcricao = await this.prisma.transcription.findUnique({
      where: { projectId },
      include: { segments: { orderBy: { position: 'asc' } } },
    });
    const original = await this.prisma.mediaSource.findFirst({
      where: { projectId, kind: 'ORIGINAL' },
      orderBy: { createdAt: 'desc' },
    });

    if (!transcricao || !original?.durationMs) return null;

    const segmentos = transcricao.segments.map((s) => ({
      id: s.id,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
      minWordConfidence: s.confidence ?? 1,
    }));

    const aviso =
      `A IA não montou esta proposta (${motivo.replace(/\.$/, '')}). ` +
      'O vídeo foi montado com toda a fala, sem as pausas longas — corte o que quiser na timeline.';

    const proposta = montarPropostaSemIa(segmentos, original.durationMs, aviso);
    if (!proposta) return null;

    // Sem IA, o video sai acabado do mesmo jeito: legenda, zoom, logo e
    // trilha vem do Kit de marca, por regra -- nenhum token gasto.
    const compilado = compilarProposta({
      proposta,
      projectId,
      sourceMediaId: original.id,
      sourceDurationMs: original.durationMs,
      segmentos,
      acabamento: await this.acabamento.contexto(workspaceId),
    });
    if (!compilado.ok) return null;

    return { plano: compilado.plano, avisos: compilado.avisos };
  }

  /**
   * Leva o projeto a "proposta pronta" por um caminho válido da
   * máquina de estados: de uma falha, passa por "analisando" antes.
   */
  private async ativar(projectId: string) {
    const projeto = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!projeto) return;

    // Quem já está editando continua editando: uma análise nova troca
    // o plano, não o momento do projeto.
    if (['PROPOSAL_READY', 'USER_EDITING', 'READY_TO_RENDER', 'COMPLETED'].includes(projeto.state)) {
      await this.prisma.project.update({ where: { id: projectId }, data: { publicError: null } });
      return;
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { state: 'PROPOSAL_READY', publicError: null },
    });
  }
}
