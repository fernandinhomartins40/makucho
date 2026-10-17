// ============================================================
// Os vídeos de apoio na montagem (videos-de-apoio.ts).
//
// A pessoa gravou o vídeo dela falando e, junto, os vídeos de apoio. A
// transcrição separou um do outro (a fala é a linha principal) e o
// worker de mídia converteu os apoios em assets. Aqui a IA OLHA os
// quadros de cada apoio, lê a fala no tempo do vídeo montado e decide
// onde cada um entra por cima dela e qual trecho mostrar -- sempre mudo.
//
// Sem IA (fora do ar, resposta ilegível), os apoios entram espalhados
// pelo vídeo: o que a pessoa gravou para mostrar não fica de fora.
// Nunca derruba a montagem.
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import {
  aplicarOperacao,
  agendaDoPlano,
  apoiosParaAIa,
  colocacaoSemIa,
  comIdsNovos,
  falaParaMidias,
  lerColocacoesDosApoios,
  operacoesDosApoios,
  partesDoVideoSchema,
} from '@makucho/studio-contracts';
import type { ApoioParaColocar, ColocacaoDeApoio, EditPlanV1 } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage.service';
import type { TenantContext } from '../../common/tenant';
import { EditPlansService } from '../edit-plans/edit-plans.service';
import { AiService } from './ai.service';
import { PromptsService } from './prompts.service';

/** Quadros que a IA olha por apoio, e no total (cada imagem custa tokens). */
const QUADROS_POR_APOIO = 3;
const QUADROS_NO_TOTAL = 12;

@Injectable()
export class ApoiosService {
  private readonly log = new Logger(ApoiosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly planos: EditPlansService,
    private readonly ai: AiService,
    private readonly prompts: PromptsService,
  ) {}

  /** Põe os apoios do projeto no plano ativo. Devolve quantas entradas foram. */
  async colocarNaMontagem(sistema: TenantContext, projectId: string): Promise<number> {
    try {
      const projeto = await this.prisma.project.findUnique({ where: { id: projectId }, select: { title: true, videoParts: true } });
      const lidas = partesDoVideoSchema.safeParse(projeto?.videoParts ?? []);
      const partes = lidas.success ? lidas.data.filter((p) => p.papel === 'apoio' && p.assetId) : [];
      if (!partes.length) return 0;

      const assets = await this.prisma.asset.findMany({
        where: { id: { in: partes.map((p) => p.assetId!) }, workspaceId: sistema.workspaceId },
        select: { id: true, durationMs: true },
      });
      const atual = await this.planos.atual(sistema, projectId);
      const plano = atual.document as EditPlanV1;
      const duracaoMs = agendaDoPlano(plano).duracaoMs;

      // Os quadros de cada apoio: as cenas que o worker de mídia guardou, no trecho dele.
      const regioes = await this.prisma.detectedRegion.findMany({
        where: { kind: 'scene', transcription: { projectId } },
        orderBy: { startMs: 'asc' },
        select: { startMs: true, endMs: true, metadata: true },
      });
      const apoios: ApoioParaColocar[] = [];
      const imagens: string[] = [];
      const legenda: string[] = [];
      for (const p of partes) {
        const asset = assets.find((a) => a.id === p.assetId);
        if (!asset) continue;
        const dentro = regioes.filter((r) => (r.startMs + r.endMs) / 2 >= p.inicioMs && (r.startMs + r.endMs) / 2 < p.fimMs);
        const escolhidas = dentro.length <= QUADROS_POR_APOIO ? dentro : [0, 0.5, 1].map((f) => dentro[Math.round(f * (dentro.length - 1))]!);
        const cenas: ApoioParaColocar['cenas'][number][] = [];
        for (const r of escolhidas) {
          const quadro = (r.metadata as { quadro?: string } | null)?.quadro;
          const arquivo = quadro && imagens.length < QUADROS_NO_TOTAL ? await this.storage.ler(quadro).catch(() => null) : null;
          const inicio = Math.max(0, r.startMs - p.inicioMs);
          const fim = Math.min(p.fimMs, r.endMs) - p.inicioMs;
          if (arquivo) {
            imagens.push((await sharp(arquivo).resize({ width: 320, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer()).toString('base64'));
            cenas.push({ inicioMs: inicio, fimMs: fim, mostra: `ver a imagem ${imagens.length}` });
            legenda.push(`Imagem ${imagens.length}: apoio ${apoios.length + 1}, aos ${(inicio / 1000).toFixed(1).replace('.', ',')} s dele`);
          }
        }
        apoios.push({ assetId: asset.id, nome: p.nome, duracaoMs: asset.durationMs ?? p.fimMs - p.inicioMs, cenas });
      }
      if (!apoios.length) return 0;

      const colocacoes = (await this.pelaIa(sistema.workspaceId, projectId, plano, apoios, duracaoMs, imagens, legenda, projeto?.title ?? '')) ?? colocacaoSemIa(apoios, duracaoMs);
      return await this.aplicar(sistema, projectId, plano, colocacoes);
    } catch (e) {
      this.log.warn(`vídeos de apoio do projeto ${projectId} não entraram: ${e instanceof Error ? e.message : e}`);
      return 0;
    }
  }

  /** A IA escolhe. `null` quando não deu (a colocação sem IA assume). */
  private async pelaIa(
    workspaceId: string,
    projectId: string,
    plano: EditPlanV1,
    apoios: readonly ApoioParaColocar[],
    duracaoMs: number,
    imagens: readonly string[],
    legenda: readonly string[],
    titulo: string,
  ): Promise<ColocacaoDeApoio[] | null> {
    try {
      const palavras = await this.prisma.transcriptWord.findMany({
        where: { segment: { transcription: { projectId } } },
        select: { startMs: true, endMs: true, word: true },
        orderBy: { startMs: 'asc' },
      });
      if (!palavras.length) return null;
      const fala = falaParaMidias(plano, palavras.map((p) => ({ startMs: p.startMs, endMs: p.endMs, texto: p.word })));
      const { texto: instrucoes, versao } = this.prompts.obter('colocar_apoios');
      const r = await this.ai.chamar({
        workspaceId,
        projectId,
        chamada: 'colocar_apoios',
        sistema: instrucoes,
        usuario: [
          `Tema do vídeo: ${titulo || 'sem título'}`,
          `Duração do vídeo final: ${Math.round(duracaoMs / 1000)} s`,
          '',
          'Vídeos de apoio:',
          apoiosParaAIa(apoios),
          ...(legenda.length ? ['', 'As imagens enviadas, na ordem:', ...legenda] : []),
          '',
          'Fala:',
          fala,
        ].join('\n'),
        ...(imagens.length ? { imagens: [...imagens] } : {}),
        maxTokens: 2000,
        promptVersion: versao,
        semCache: true,
        tempoMaximoMs: 90_000,
      });
      const lido = lerColocacoesDosApoios(r.texto, apoios, duracaoMs);
      if (!lido.ok) {
        this.log.warn(`vídeos de apoio do projeto ${projectId}: resposta da IA recusada (${lido.erro}); entrando sem IA`);
        return null;
      }
      return lido.colocacoes;
    } catch (e) {
      this.log.warn(`vídeos de apoio do projeto ${projectId}: a IA não respondeu (${e instanceof Error ? e.message : e}); entrando sem IA`);
      return null;
    }
  }

  private async aplicar(sistema: TenantContext, projectId: string, plano: EditPlanV1, colocacoes: readonly ColocacaoDeApoio[]): Promise<number> {
    let atual = plano;
    let entraram = 0;
    for (const op of operacoesDosApoios(colocacoes)) {
      const r = aplicarOperacao(atual, comIdsNovos(op));
      if (!r.ok || !r.plan) {
        this.log.warn(`vídeo de apoio recusado no projeto ${projectId}: ${r.erro}`);
        continue;
      }
      atual = r.plan;
      entraram += 1;
    }
    if (entraram) {
      await this.planos.salvar(sistema, projectId, atual, 'ai');
      this.log.log(`projeto ${projectId}: ${entraram} entrada(s) de vídeo de apoio por cima da fala`);
    }
    return entraram;
  }
}
