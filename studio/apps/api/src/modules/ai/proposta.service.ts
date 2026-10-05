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

import { Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { FILA_ANALISE, FILA_ANIMACOES_DA_MONTAGEM, PREFIXO_DAS_FILAS } from '@makucho/studio-contracts';
import type { EditPlanV1, SemanticIssue } from '@makucho/studio-contracts';
import { Prisma } from '@makucho/studio-database';
import { PrismaService } from '../../common/prisma.service';
import type { TenantContext } from '../../common/tenant';
import { EditPlansService } from '../edit-plans/edit-plans.service';
import { FilaService } from '../../common/fila.service';
import { MidiasService } from './midias.service';
import { AgenteService } from './agente.service';
import { AnimacoesDaFalaService } from './animacoes-da-fala.service';
import { AnaliseService } from './analise.service';

export interface ResultadoDaProposta {
  ok: boolean;
  /** "ia" quando o modelo montou; "automatica" quando foi a reserva. */
  origem: 'ia' | 'automatica';
  confianca: number;
  avisos: string[];
  problemas: SemanticIssue[];
  erro?: string;
  /** A falha pode passar sozinha (rede, tempo, resposta cortada). */
  temporario?: boolean;
}

/** Tentativas COM a IA antes de pedir à pessoa para tentar de novo. */
const TENTATIVAS_DA_IA = 3;
/** Espera entre elas (cresce a cada tentativa). */
const ESPERA_ENTRE_TENTATIVAS_MS = 15_000;

/** De quanto em quanto tempo procura projeto parado em "analisando". */
const VARREDURA_MS = 60_000;
/** Projeto em "analisando" há mais que isso sem job é projeto órfão. */
const ORFAO_APOS_MS = 3 * 60_000;

/** O job das animações da montagem (fila própria: sobrevive a um reinício da API). */
interface JobDasAnimacoes {
  projectId: string;
  workspaceId: string;
  /** Montagem automática: o projeto só sai de "analisando" quando as animações terminam. */
  ativarAoFim: boolean;
  /** Separar também as mídias (depois da direção, fora dos instantes das animações). */
  comMidias: boolean;
}

@Injectable()
export class PropostaService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PropostaService.name);
  private conexao: IORedis | null = null;
  private fila: Queue | null = null;
  private worker: Worker | null = null;
  private filaDeAnimacoes: Queue<JobDasAnimacoes> | null = null;
  private workerDeAnimacoes: Worker<JobDasAnimacoes> | null = null;
  private varredura: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analise: AnaliseService,
    private readonly planos: EditPlansService,
    private readonly filas: FilaService,
    private readonly midias: MidiasService,
    @Optional() private readonly animacoesDaFala?: AnimacoesDaFalaService,
    @Optional() private readonly agente?: AgenteService,
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

    // As animações da montagem levam minutos. Na fila (e não soltas numa
    // promessa), um reinício da API no meio não as perde: o job "travado"
    // volta para a fila e roda de novo quando a API sobe.
    this.filaDeAnimacoes = new Queue<JobDasAnimacoes>(FILA_ANIMACOES_DA_MONTAGEM, {
      connection: this.conexao,
      prefix: PREFIXO_DAS_FILAS,
      defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
    });
    this.workerDeAnimacoes = new Worker<JobDasAnimacoes>(
      FILA_ANIMACOES_DA_MONTAGEM,
      async (job) => {
        await this.rodarAnimacoes(job.data, job.timestamp);
      },
      // Um vídeo por vez: cada um já escreve 3 animações em paralelo.
      { connection: this.conexao, prefix: PREFIXO_DAS_FILAS, concurrency: 1, lockDuration: 120_000, maxStalledCount: 2 },
    );
    this.workerDeAnimacoes.on('failed', (job, erro) => {
      this.log.error(`animações do projeto ${job?.data.projectId} falharam: ${erro.message}`);
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
    await this.workerDeAnimacoes?.close();
    await this.filaDeAnimacoes?.close();
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
      // Esperando as animações (que levam minutos) não é órfão.
      if (await this.animacoesNaFila(p.id)) continue;
      await this.enfileirar(p.id);
    }
  }

  /**
   * O caminho automático: a IA monta. Uma falha passageira (rede, tempo
   * esgotado, resposta cortada) ganha novas tentativas COM a IA; se não
   * der, o projeto sai de "analisando" com o motivo na tela e o botão
   * "Tentar de novo". Não há montagem sem IA: numa ferramenta de IA, ela
   * entregava "tudo Contexto" e parecia que a IA tinha esquecido o que sabe.
   */
  async automatica(projectId: string): Promise<ResultadoDaProposta | null> {
    const projeto = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!projeto || projeto.state !== 'ANALYZING') return null;

    let ultimoErro = 'a IA não respondeu';
    for (let tentativa = 1; tentativa <= TENTATIVAS_DA_IA; tentativa += 1) {
      try {
        await this.filas.publicarProgresso(projectId, 'montando', 5);
        const r = await this.gerar(projeto.workspaceId, projectId);
        if (r.ok) {
          await this.filas.publicarProgresso(projectId, 'montando', 100);
          return r;
        }
        ultimoErro = r.erro ?? ultimoErro;
        if (!r.temporario) break;
      } catch (e) {
        ultimoErro = e instanceof Error ? e.message : String(e);
      }
      this.log.warn(`proposta do projeto ${projectId}: tentativa ${tentativa} falhou (${ultimoErro})`);
      if (tentativa < TENTATIVAS_DA_IA) await new Promise((ok) => setTimeout(ok, ESPERA_ENTRE_TENTATIVAS_MS * tentativa));
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        state: 'FAILED_RETRYABLE',
        publicError: `A IA não conseguiu montar o vídeo (${ultimoErro.replace(/\.$/, '').slice(0, 300)}). Toque em "Tentar de novo".`,
      },
    });
    return null;
  }

  /** Gera, salva e ativa a proposta da IA. Uma falha volta para quem pediu. */
  /**
   * `animacoesEmSegundoPlano`: o "Refazer a análise" espera a resposta pela
   * requisição (o nginx corta em 600 s); as animações, que levam minutos,
   * seguem depois -- o editor acompanha pela nota e carrega quando saem.
   */
  async gerar(workspaceId: string, projectId: string, opcoes: { animacoesEmSegundoPlano?: boolean } = {}): Promise<ResultadoDaProposta> {
    const resultado = await this.analise.analisar(workspaceId, projectId, { semCache: true });
    if (!resultado.ok) {
      return { ok: false, origem: 'ia', confianca: 0, avisos: [], problemas: [], erro: resultado.erro, temporario: resultado.temporario };
    }
    const plano = resultado.plano;
    const resposta: ResultadoDaProposta = {
      ok: true,
      origem: 'ia',
      confianca: resultado.confianca,
      avisos: resultado.avisos,
      problemas: resultado.problemas,
    };

    const sistema: TenantContext = { userId: 'sistema', workspaceId, role: 'OWNER' };
    await this.planos.salvar(sistema, projectId, plano, 'ai');

    // Sem fala (montagem pelas cenas), não há fala a ilustrar.
    const pelasCenas = (plano as EditPlanV1).clips.every((c) => c.origin === 'cena');
    if (pelasCenas) {
      await this.prisma.project
        .update({ where: { id: projectId }, data: { animationNote: 'Sem animações: o vídeo foi montado pelas cenas (sem fala para explicar).', animationReport: Prisma.DbNull } })
        .catch(() => undefined);
    } else {
      // A direção visual decide as animações; as mídias vêm DEPOIS dela,
      // fora dos instantes das animações (um instante, um recurso). Tudo
      // num job da fila: a montagem automática espera por ele (o vídeo já
      // chega animado); o "Refazer a análise" entrega o plano já e as
      // animações entram quando saem.
      const job: JobDasAnimacoes = { projectId, workspaceId, ativarAoFim: !opcoes.animacoesEmSegundoPlano, comMidias: true };
      await this.prisma.project.update({ where: { id: projectId }, data: { animationNote: 'Criando as animações…' } }).catch(() => undefined);
      const naFila = await this.enfileirarAnimacoes(job);
      if (!naFila) {
        // Sem Redis: do jeito antigo, aqui mesmo.
        await this.filas.publicarProgresso(projectId, 'montando', 80).catch(() => undefined);
        const criadas = await this.rodarAnimacoes({ ...job, ativarAoFim: false }, Date.now());
        if (criadas > 0) resposta.avisos = [...resposta.avisos, `A IA criou ${criadas} ${criadas === 1 ? 'animação' : 'animações'} para explicar a fala (faixa Mídia).`];
      } else if (job.ativarAoFim) {
        // O projeto sai de "analisando" quando o job terminar.
        await this.prisma.project.update({ where: { id: projectId }, data: { aiFallbackReason: null } }).catch(() => undefined);
        return resposta;
      } else {
        resposta.avisos = [...resposta.avisos, 'A IA está criando as animações: elas entram sozinhas em alguns minutos.'];
      }
    }
    await this.ativar(projectId);
    await this.prisma.project.update({ where: { id: projectId }, data: { aiFallbackReason: null } }).catch(() => undefined);
    return resposta;
  }

  /** Enfileira as animações de um projeto. Devolve false sem Redis (quem chama roda aqui mesmo). */
  async enfileirarAnimacoes(job: JobDasAnimacoes): Promise<boolean> {
    if (!this.filaDeAnimacoes) return false;
    try {
      // O id é o projeto: pedir de novo enquanto um roda não duplica.
      await this.filaDeAnimacoes.add('animar', job, { jobId: `animacoes-${job.projectId}` });
      return true;
    } catch (e) {
      this.log.error(`falha ao enfileirar as animações do projeto ${job.projectId}`, e as Error);
      return false;
    }
  }

  /** Há um job de animações esperando ou rodando para o projeto? */
  async animacoesNaFila(projectId: string): Promise<boolean> {
    const job = await this.filaDeAnimacoes?.getJob(`animacoes-${projectId}`).catch(() => undefined);
    if (!job) return false;
    const estado = await job.getState().catch(() => 'unknown');
    return ['waiting', 'active', 'delayed', 'prioritized', 'waiting-children'].includes(estado);
  }

  /**
   * O job das animações: a direção, as mídias fora dos instantes dela, a
   * escrita e -- na montagem automática -- a entrega do projeto. Devolve
   * quantas animações entraram; o motivo de não ter nenhuma fica no projeto.
   */
  private async rodarAnimacoes(job: JobDasAnimacoes, criadoEm: number): Promise<number> {
    const { projectId, workspaceId } = job;
    const sistema: TenantContext = { userId: 'sistema', workspaceId, role: 'OWNER' };
    let midias: Promise<unknown> | null = null;
    const separarMidias = (ocupados: Array<{ inicioMs: number; fimMs: number }>) => {
      if (!job.comMidias || midias) return;
      midias = this.midias.separarNaMontagem(workspaceId, projectId, ocupados).catch((e: unknown) => {
        this.log.warn(`mídias da montagem falharam no projeto ${projectId}: ${e instanceof Error ? e.message : e}`);
        return 0;
      });
    };
    let criadas = 0;
    try {
      // Job que voltou depois de um reinício, mas que já tinha terminado a
      // escrita: não cria tudo de novo (duplicaria as animações).
      const feito = await this.prisma.project.findUnique({ where: { id: projectId }, select: { animationNote: true, animationReport: true } });
      const relatorio = feito?.animationReport as { em?: string; erro?: string } | null;
      const jaFeito = !!relatorio?.em && Date.parse(relatorio.em) >= criadoEm && !feito?.animationNote?.endsWith('…');
      if (!jaFeito) criadas = await this.animarNaMontagem(sistema, projectId, separarMidias);
    } finally {
      separarMidias([]);
      if (midias) await midias;
      if (job.ativarAoFim) {
        // Só na montagem automática: no "Refazer a análise" a pessoa já está
        // no editor, e a direção salvaria por cima do que ela mexeu.
        await this.dirigirNaMontagem(sistema, projectId);
        await this.filas.publicarProgresso(projectId, 'montando', 100).catch(() => undefined);
        await this.ativar(projectId);
      }
    }
    return criadas;
  }

  /**
   * A direção do vídeo: depois dos cortes, do acabamento por regra, das
   * animações e das mídias, o agente (com todas as ferramentas do Studio)
   * olha o vídeo inteiro e o dirige como AQUELE conteúdo pede. É o que tira
   * a montagem da fórmula. Nunca derruba a montagem: se falhar, o vídeo
   * sai como estava. Desliga com STUDIO_DIRIGIR_NA_MONTAGEM=off.
   */
  private async dirigirNaMontagem(sistema: TenantContext, projectId: string): Promise<void> {
    if (!this.agente || process.env.STUDIO_DIRIGIR_NA_MONTAGEM === 'off') return;
    // Etapa própria na tela de preparo: são minutos, e "animando a 99%" parecia travado.
    await this.filas.publicarProgresso(projectId, 'dirigindo', 0).catch(() => undefined);
    try {
      const r = await this.agente.dirigir(sistema, projectId);
      this.log.log(`direção do projeto ${projectId}: ${r.aplicadas} mudança(s), US$ ${(r.custoCentavos / 100).toFixed(3)} -- ${r.resposta.slice(0, 200)}`);
    } catch (e) {
      this.log.warn(`direção do projeto ${projectId} não rodou: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * As animações da montagem (HyperFrames), pela direção visual
   * (animacoes-da-fala.service). Devolve quantas entraram; o motivo de
   * não ter nenhuma fica no projeto.
   */
  private async animarNaMontagem(sistema: TenantContext, projectId: string, aoDirigir: (ocupados: Array<{ inicioMs: number; fimMs: number }>) => void): Promise<number> {
    // Toda saída deixa um motivo no projeto: "sem animação e sem nota" não
    // diz nada a ninguém (e foi assim que uma falha passou despercebida).
    const anotar = (nota: string) =>
      this.prisma.project
        .update({ where: { id: projectId }, data: { animationNote: nota } })
        .catch((e: unknown) => this.log.error(`nota das animações não gravada no projeto ${projectId}: ${e instanceof Error ? e.message : e}`));
    if (process.env.STUDIO_ANIMAR_NA_MONTAGEM === 'off') {
      await anotar('Sem animações: desligadas neste servidor (STUDIO_ANIMAR_NA_MONTAGEM=off).');
      return 0;
    }
    if (!this.animacoesDaFala) {
      this.log.error('animações da montagem: o serviço não foi carregado');
      await anotar('Sem animações: o serviço de animações não carregou no servidor.');
      return 0;
    }
    const avisar = (pct: number) => void this.filas.publicarProgresso(projectId, 'animando', pct).catch(() => undefined);
    avisar(1);
    try {
      const r = await this.animacoesDaFala.criarNaMontagem(sistema, projectId, avisar, aoDirigir);
      return r.criadas;
    } catch (e) {
      this.log.error(`animações da montagem falharam no projeto ${projectId}: ${e instanceof Error ? e.stack : e}`);
      await anotar(`Sem animações: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500));
      return 0;
    }
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
