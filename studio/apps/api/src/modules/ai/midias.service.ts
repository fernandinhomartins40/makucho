// ============================================================
// Mídias sugeridas pela IA: imagens, ícones e vídeos que ilustram a fala.
//
// A IA lê a fala no tempo do vídeo montado e devolve os momentos visuais
// (midias-da-ia.ts); para cada um, o servidor busca nas fontes de licença
// livre do tipo pedido e ordena os resultados. Nada é aplicado aqui: o
// editor mostra as opções e a pessoa aprova (escolhe, troca, desmarca) --
// a escolha vira operações da timeline, desfazíveis, no próprio editor.
// Na montagem com IA a sugestão é feita sozinha e fica guardada no
// projeto (`mediaSuggestions`) até a aprovação.
// ============================================================

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@makucho/studio-database';
import { agendaDoPlano, falaParaMidias, lerMomentosVisuais, ranquearResultados } from '@makucho/studio-contracts';
import type { MomentoVisual, ResultadoDaBusca, TipoDaBusca } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import type { TenantContext } from '../../common/tenant';
import { BancoDeMidiaService } from '../banco-de-midia/banco-de-midia.service';
import { EditPlansService } from '../edit-plans/edit-plans.service';
import { AiService } from './ai.service';
import { PromptsService } from './prompts.service';

/** A fala inteira de um vídeo de 3 min, mais os momentos, cabe folgado. */
const MAX_TOKENS_DAS_MIDIAS = 2500;
/** Opções mostradas por momento. */
const OPCOES_POR_MOMENTO = 4;

/** Quando o tipo pedido não acha nada, o próximo que costuma achar. */
const TIPO_RESERVA: Partial<Record<TipoDaBusca, TipoDaBusca>> = {
  icone3d: 'icone',
  logo: 'icone',
  ilustracao: 'foto',
  video: 'foto',
};

export interface MomentoComOpcoes extends MomentoVisual {
  /** O tipo em que as opções foram achadas (pode ser o reserva). */
  tipoAchado: TipoDaBusca;
  opcoes: ResultadoDaBusca[];
}

@Injectable()
export class MidiasService {
  private readonly log = new Logger(MidiasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planos: EditPlansService,
    private readonly ai: AiService,
    private readonly prompts: PromptsService,
    private readonly banco: BancoDeMidiaService,
  ) {}

  async sugerir(tenant: TenantContext, projectId: string, desligados: readonly string[] = []) {
    const atual = await this.planos.atual(tenant, projectId);
    const plano = atual.document;
    const [palavras, projeto] = await Promise.all([
      this.prisma.transcriptWord.findMany({
        where: { segment: { transcription: { projectId } } },
        select: { startMs: true, endMs: true, word: true },
        orderBy: { startMs: 'asc' },
      }),
      this.prisma.project.findFirst({ where: { id: projectId, workspaceId: tenant.workspaceId }, select: { title: true } }),
    ]);
    if (!palavras.length) throw new BadRequestException('o vídeo ainda não tem transcrição: espere a IA terminar de preparar o vídeo');

    const fala = falaParaMidias(
      plano,
      palavras.map((p) => ({ startMs: p.startMs, endMs: p.endMs, texto: p.word })),
      desligados,
    );
    const duracaoMs = agendaDoPlano(plano, [...desligados]).duracaoMs;
    const { texto: instrucoes, versao } = this.prompts.obter('sugerir_midias');
    const resposta = await this.ai.chamar({
      workspaceId: tenant.workspaceId,
      projectId,
      chamada: 'sugerir_midias',
      sistema: instrucoes,
      usuario: [`Tema do vídeo: ${projeto?.title ?? 'sem título'}`, `Duração: ${Math.round(duracaoMs / 1000)} s`, '', 'Fala:', fala].join('\n'),
      maxTokens: MAX_TOKENS_DAS_MIDIAS,
      promptVersion: versao,
      semCache: true,
    });
    const lido = lerMomentosVisuais(resposta.texto, duracaoMs);
    if (!lido.ok) {
      this.log.warn(`momentos visuais recusados no projeto ${projectId}: ${lido.erro}`);
      throw new BadRequestException('a IA não conseguiu sugerir mídias agora; tente de novo');
    }

    // Busca os momentos de 3 em 3: as fontes têm limite por minuto.
    const avisos = new Set<string>();
    const momentos: MomentoComOpcoes[] = [];
    for (let i = 0; i < lido.momentos.length; i += 3) {
      const lote = await Promise.all(lido.momentos.slice(i, i + 3).map((m) => this.opcoesDoMomento(tenant, m, avisos)));
      momentos.push(...lote);
    }
    return {
      momentos: momentos.filter((m) => m.opcoes.length > 0),
      semOpcoes: momentos.filter((m) => !m.opcoes.length).map((m) => m.conceito),
      avisos: [...avisos],
      custoCentavos: resposta.custoCentavos,
    };
  }

  /**
   * Na MONTAGEM com IA (proposta.service): a IA escolhe os momentos e o
   * servidor busca as opções, mas NADA entra no vídeo -- a sugestão fica
   * guardada no projeto e o editor pede a aprovação (escolher, trocar,
   * desmarcar). Desligável no Kit de marca (`midiasDaIa: false`). Nunca
   * derruba a montagem: falha vira zero sugestões e um aviso no log.
   */
  async separarNaMontagem(workspaceId: string, projectId: string): Promise<number> {
    const perfil = await this.prisma.brandProfile.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { version: 'desc' },
      select: { videoDefaults: true },
    });
    const prefs = (perfil?.videoDefaults ?? {}) as { midiasDaIa?: boolean };
    if (prefs.midiasDaIa === false) return 0;
    const tenant: TenantContext = { userId: 'sistema', workspaceId, role: 'OWNER' };
    const r = await this.sugerir(tenant, projectId);
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        mediaSuggestions: r.momentos.length
          ? ({ momentos: r.momentos, avisos: r.avisos, semOpcoes: r.semOpcoes, geradoEm: new Date().toISOString() } as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });
    return r.momentos.length;
  }

  /** As mídias separadas na montagem, esperando aprovação (ou null). */
  async pendentes(tenant: TenantContext, projectId: string) {
    const p = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId: tenant.workspaceId }, select: { mediaSuggestions: true } });
    if (!p) throw new NotFoundException('projeto não encontrado');
    return (p.mediaSuggestions ?? null) as { momentos: MomentoComOpcoes[]; avisos: string[]; semOpcoes: string[]; geradoEm: string } | null;
  }

  /** Aprovadas (as escolhidas já entraram pelo editor) ou dispensadas: some o aviso. */
  async concluir(tenant: TenantContext, projectId: string) {
    const r = await this.prisma.project.updateMany({ where: { id: projectId, workspaceId: tenant.workspaceId }, data: { mediaSuggestions: Prisma.DbNull } });
    if (!r.count) throw new NotFoundException('projeto não encontrado');
    return { ok: true };
  }

  /** As opções de um momento: termo a termo até achar, e o tipo reserva se nada. */
  private async opcoesDoMomento(tenant: TenantContext, m: MomentoVisual, avisos: Set<string>): Promise<MomentoComOpcoes> {
    for (const tipo of [m.tipo, TIPO_RESERVA[m.tipo]].filter((t): t is TipoDaBusca => Boolean(t))) {
      const achados: ResultadoDaBusca[] = [];
      for (const termo of m.termos) {
        const r = await this.banco.buscar(tenant, { q: termo, tipo });
        r.avisos.forEach((a) => avisos.add(a));
        for (const x of r.resultados) if (!achados.some((y) => y.fonte === x.fonte && y.id === x.id)) achados.push(x);
        if (achados.length >= OPCOES_POR_MOMENTO * 2) break;
      }
      if (achados.length) return { ...m, tipoAchado: tipo, opcoes: ranquearResultados(achados, m.termos, tipo).slice(0, OPCOES_POR_MOMENTO) };
    }
    return { ...m, tipoAchado: m.tipo, opcoes: [] };
  }
}
