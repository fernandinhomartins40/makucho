// ============================================================
// A revisão final do vídeo montado: o que um editor humano confere antes de
// entregar (revisao-final.ts, no contrato, tem as regras).
//
// Três passos, do mais barato ao mais caro:
//   1. medir -- cada animação no Chrome do worker, no instante de descanso
//      (peças, letras, caixas), e onde está a pessoa naquele trecho;
//   2. corrigir sem IA o que é objetivo (peça pequena, cartão sobre o rosto,
//      trilha alta, som em cima da fala, legenda longa, texto rápido);
//   3. revisar a legenda com a IA: só as palavras que o whisper ouviu com
//      pouca certeza, com a frase em volta, e só grafia.
// O que pede julgamento (estilos misturados, texto sobre texto, duas
// animações ao mesmo tempo...) volta como `pendentes`: quem chama entrega
// ao agente, com a skill do revisor (a montagem, ou a ferramenta
// `revisar_video` do próprio agente).
//
// `revisar` não salva: devolve o plano revisado. `revisarESalvar` faz a
// revisão inteira (salva, refaz o vídeo das animações e chama o revisor) e
// é o que a montagem e a FILA usam -- a fila revisa vídeos já montados, um
// de cada vez, pedidos da lista de projetos. Nunca derruba quem chama: sem
// worker, sem IA ou sem transcrição, a regra que depende disso não roda.
// ============================================================

import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  aplicarCorrecoes,
  editPlanV1Schema,
  lerRevisaoDaLegenda,
  palavrasDaRevisao,
  pedidoDaRevisaoDaLegenda,
  revisarVideo,
  type AchadoDaRevisao,
  type EditPlanV1,
  type MedidasDaRevisao,
  type PessoaNoQuadro,
} from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import type { TenantContext } from '../../common/tenant';
import { AnimacoesService } from '../animacoes/animacoes.service';
import { EditPlansService } from '../edit-plans/edit-plans.service';
import { AgenteService } from './agente.service';
import { AiService } from './ai.service';
import { AnimacoesDaFalaService } from './animacoes-da-fala.service';
import { PromptsService } from './prompts.service';
import { skill } from './skills';

/** Quantas animações a revisão mede por vídeo (o worker mede uma por vez, poucos segundos cada). */
const MAXIMO_DE_ANIMACOES_MEDIDAS = 16;

/** O que o revisor (agente) não pode usar: ele conserta, não remonta, não recomeça e não revisa de novo. */
const FORA_DO_REVISOR = ['remontar_video', 'definir_tipo_do_video', 'desfazer_tudo', 'revisar_video', 'criar_animacao', 'criar_cena_animada'] as const;
/** Os estados em que o vídeo já está montado (tem plano para revisar). */
const MONTADOS = ['PROPOSAL_READY', 'USER_EDITING', 'READY_TO_RENDER', 'COMPLETED'];

/** A revisão de um projeto pedida da lista: na fila, revisando, pronta ou falhou. */
export interface EstadoDaRevisao {
  estado: 'na_fila' | 'revisando' | 'pronta' | 'falhou';
  /** O passo de agora ("Medindo as animações"...). */
  passo?: string;
  em: number;
  /** Pronta: o que foi corrigido, para a pessoa. */
  feitos?: string[];
  /** Pronta: o que o revisor (agente) respondeu. */
  resposta?: string;
  erro?: string;
}

export interface ResultadoDaRevisao {
  /** O plano revisado (o mesmo objeto, se nada mudou). */
  plano: EditPlanV1;
  /** O que foi corrigido, em português, para a pessoa. */
  feitos: string[];
  /** O que pede julgamento: vai para o agente revisor. */
  pendentes: AchadoDaRevisao[];
  /** As animações que mudaram: o vídeo delas para a exportação precisa ser refeito. */
  animacoesMudadas: string[];
  custoCentavos: number;
}

@Injectable()
export class RevisaoService {
  private readonly log = new Logger(RevisaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: PromptsService,
    private readonly planos: EditPlansService,
    private readonly modulos: ModuleRef,
    @Optional() private readonly animacoes?: AnimacoesService,
    @Optional() private readonly animacoesDaFala?: AnimacoesDaFalaService,
  ) {}

  // ---------- A fila (vídeos já montados, pedidos da lista de projetos) ----------

  /** O estado da revisão de cada projeto pedido (em memória: some num reinício da API). */
  private readonly estados = new Map<string, EstadoDaRevisao & { workspaceId: string }>();
  private readonly fila: Array<{ tenant: TenantContext; projectId: string }> = [];
  private rodando = false;

  /** Põe um vídeo já montado na fila de revisão. Um de cada vez: o worker mede uma animação por vez. */
  async enfileirar(tenant: TenantContext, projectId: string): Promise<EstadoDaRevisao> {
    const projeto = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId: tenant.workspaceId }, select: { state: true } });
    if (!projeto) throw new BadRequestException('projeto não encontrado');
    if (!MONTADOS.includes(projeto.state)) throw new BadRequestException('o vídeo ainda não foi montado');
    const atual = this.estados.get(projectId);
    if (atual && (atual.estado === 'na_fila' || atual.estado === 'revisando')) return atual;
    const estado = { estado: 'na_fila' as const, em: Date.now(), workspaceId: tenant.workspaceId };
    this.estados.set(projectId, estado);
    this.fila.push({ tenant, projectId });
    void this.processar();
    return estado;
  }

  /** As revisões pedidas dos projetos deste workspace (a lista mostra no cartão). */
  estadosDoWorkspace(tenant: TenantContext): Record<string, EstadoDaRevisao> {
    const out: Record<string, EstadoDaRevisao> = {};
    for (const [id, { workspaceId, ...e }] of this.estados) if (workspaceId === tenant.workspaceId) out[id] = e;
    return out;
  }

  private async processar(): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    try {
      for (let item = this.fila.shift(); item; item = this.fila.shift()) {
        const estado = this.estados.get(item.projectId);
        if (!estado) continue;
        Object.assign(estado, { estado: 'revisando', em: Date.now(), passo: 'Começando' });
        try {
          const r = await this.revisarESalvar(item.tenant, item.projectId, (passo) => (estado.passo = passo));
          Object.assign(estado, { estado: 'pronta', em: Date.now(), passo: undefined, feitos: r.feitos, resposta: r.resposta });
        } catch (e) {
          Object.assign(estado, { estado: 'falhou', em: Date.now(), passo: undefined, erro: e instanceof Error ? e.message : 'a revisão falhou' });
        }
      }
    } finally {
      this.rodando = false;
    }
  }

  /**
   * A revisão inteira de um projeto: revisa o plano ativo, salva (uma versão,
   * desfazível), refaz o vídeo das animações mudadas e entrega ao revisor
   * (o agente com a skill) o que pede julgamento.
   */
  async revisarESalvar(tenant: TenantContext, projectId: string, aoAndar?: (passo: string) => void): Promise<{ feitos: string[]; pendentes: number; resposta: string }> {
    const atual = await this.planos.atual(tenant, projectId);
    const r = await this.revisar(tenant, projectId, atual.document as EditPlanV1, aoAndar);
    if (r.plano !== atual.document) {
      await this.planos.salvar(tenant, projectId, r.plano, 'ai');
      this.prepararAnimacoes(tenant, projectId, r.plano, r.animacoesMudadas);
    }
    let resposta = '';
    // O agente vem pelo ModuleRef: ele também usa esta revisão (a ferramenta revisar_video).
    const agente = r.pendentes.length ? this.modulos.get(AgenteService, { strict: false }) : null;
    if (agente) {
      aoAndar?.(`Resolvendo ${r.pendentes.length === 1 ? 'o ponto que pede julgamento' : `os ${r.pendentes.length} pontos que pedem julgamento`}`);
      const a = await agente.executar(tenant, projectId, this.pedidoDoRevisor(r.feitos, r.pendentes), undefined, undefined, { maxPassos: 14, sem: FORA_DO_REVISOR, prazoMs: 4 * 60_000 });
      resposta = a.resposta;
    }
    this.log.log(`revisão do projeto ${projectId}: ${r.feitos.length} corrigido(s) sem IA, ${r.pendentes.length} para o revisor -- ${[...r.feitos, resposta].filter(Boolean).join(' | ').slice(0, 600)}`);
    return { feitos: r.feitos, pendentes: r.pendentes.length, resposta };
  }

  /** Revisa um plano: mede, corrige o que é objetivo e a legenda; devolve o resto como pendente. */
  async revisar(tenant: TenantContext, projectId: string, plano: EditPlanV1, aoAndar?: (passo: string) => void): Promise<ResultadoDaRevisao> {
    const inicio = Date.now();
    aoAndar?.('Lendo a fala');
    const palavras = palavrasDaRevisao(
      plano,
      await this.prisma.transcriptWord.findMany({
        where: { segment: { transcription: { projectId } } },
        select: { id: true, word: true, startMs: true, endMs: true, confidence: true },
        orderBy: { startMs: 'asc' },
      }),
    );

    // 1. Medir as animações e achar a pessoa em cada uma.
    const animacoes = (plano.mediaLayers ?? []).filter((m) => m.kind === 'html' && m.composicao).slice(0, MAXIMO_DE_ANIMACOES_MEDIDAS);
    const medidas: Record<string, MedidasDaRevisao | null> = {};
    const pessoa: Record<string, PessoaNoQuadro | null> = {};
    if (animacoes.length) {
      aoAndar?.(`Medindo ${animacoes.length === 1 ? 'a animação' : `as ${animacoes.length} animações`}`);
      await this.animacoesDaFala?.carregarOlhar(tenant.workspaceId, projectId).catch(() => undefined);
      for (const a of animacoes) {
        medidas[a.id] = (await this.animacoes?.medirPecas(a.composicao!, a.durationMs).catch(() => null)) ?? null;
        pessoa[a.id] = this.animacoesDaFala?.pessoaNoTrecho(projectId, plano, a.timelineStartMs / 1000) ?? null;
      }
    }

    // 2. As regras, e o conserto do que é objetivo.
    aoAndar?.('Conferindo o vídeo como um editor');
    const achados = revisarVideo(plano, { palavras, medidas, pessoa });
    const { plano: corrigido, feitos } = aplicarCorrecoes(plano, achados);
    let revisado = corrigido;
    const mensagens = feitos.map((a) => a.mensagem);

    // 3. A legenda: as palavras incertas, com a frase em volta.
    let custo = 0;
    const incertas = achados.filter((a) => a.tipo === 'palavra-incerta' && a.alvo).map((a) => a.alvo!);
    if (incertas.length) {
      aoAndar?.(`Conferindo ${incertas.length === 1 ? 'uma palavra' : `${incertas.length} palavras`} da legenda`);
      try {
        const prompt = this.prompts.obter('revisar_legenda');
        const r = await this.ai.chamar({
          workspaceId: tenant.workspaceId,
          projectId,
          chamada: 'revisar_legenda',
          sistema: prompt.texto,
          usuario: pedidoDaRevisaoDaLegenda(palavras, incertas),
          maxTokens: 1200,
          promptVersion: prompt.versao,
          tempoMaximoMs: 60_000,
        });
        custo += r.custoCentavos;
        const novas = lerRevisaoDaLegenda(r.texto, palavras).filter((c) => incertas.includes(c.wordId));
        if (novas.length) {
          const ja = new Set(revisado.captions.corrections.map((c) => c.wordId));
          const corrections = [...revisado.captions.corrections, ...novas.filter((c) => !ja.has(c.wordId))].slice(0, 300);
          revisado = { ...revisado, captions: { ...revisado.captions, corrections } };
          for (const c of novas) mensagens.push(`Na legenda, "${c.original}" virou "${c.text}".`);
        }
      } catch (e) {
        this.log.warn(`revisão da legenda indisponível (projeto ${projectId}): ${e instanceof Error ? e.message : e}`);
      }
    }

    // O plano revisado tem de continuar válido: uma correção que o quebre não entra.
    if (revisado !== plano && !editPlanV1Schema.safeParse(revisado).success) {
      this.log.error(`revisão do projeto ${projectId} gerou um plano inválido; ficou o original`);
      return { plano, feitos: [], pendentes: achados.filter((a) => a.gravidade === 'conferir' && a.tipo !== 'palavra-incerta'), animacoesMudadas: [], custoCentavos: custo };
    }

    const antes = new Map((plano.mediaLayers ?? []).map((m) => [m.id, m.composicao]));
    const animacoesMudadas = (revisado.mediaLayers ?? []).filter((m) => m.kind === 'html' && m.composicao && antes.get(m.id) !== m.composicao).map((m) => m.id);
    // A palavra incerta já passou pela IA da legenda: não volta como pendente.
    const pendentes = achados.filter((a) => a.gravidade === 'conferir' && a.tipo !== 'palavra-incerta');
    this.log.log(
      `revisão do projeto ${projectId}: ${achados.length} achado(s), ${mensagens.length} corrigido(s), ${pendentes.length} para julgar, ${Object.values(medidas).filter(Boolean).length}/${animacoes.length} animação(ões) medida(s), ${Date.now() - inicio} ms`,
    );
    return { plano: revisado, feitos: mensagens, pendentes, animacoesMudadas, custoCentavos: custo };
  }

  /** Refaz o vídeo das animações que a revisão mudou (o que a exportação usa). */
  prepararAnimacoes(tenant: TenantContext, projectId: string, plano: EditPlanV1, ids: readonly string[]): void {
    for (const m of plano.mediaLayers ?? []) {
      if (!ids.includes(m.id) || !m.composicao) continue;
      void this.animacoes?.preparar(tenant, projectId, m.composicao, m.durationMs).catch(() => undefined);
    }
  }

  /** O pedido ao agente revisor: a skill do ofício e o que pede julgamento, com o que foi medido. */
  pedidoDoRevisor(feitos: readonly string[], pendentes: readonly AchadoDaRevisao[]): string {
    return [
      skill('revisao-final').texto,
      '',
      '# A revisão deste vídeo',
      feitos.length ? `Já corrigido sem você (não desfaça):\n${feitos.map((f) => `- ${f}`).join('\n')}` : 'Nada foi corrigido sozinho.',
      '',
      `Resolva cada ponto abaixo (o "alvo" é o id da animação, do texto ou da palavra; use medir_animacao e ajustar_peca_da_animacao nas animações):`,
      ...pendentes.slice(0, 20).map((a) => `- [${a.tipo}${a.alvo ? ` | alvo ${a.alvo}` : ''}] ${a.mensagem}`),
    ].join('\n');
  }
}
