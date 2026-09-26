// ============================================================
// Mídias sugeridas pela IA: imagens, ícones e vídeos que ilustram a fala.
//
// A IA lê a fala no tempo do vídeo montado e devolve os momentos visuais
// (midias-da-ia.ts); para cada um, o servidor busca nas fontes de licença
// livre do tipo pedido e ordena os resultados. Nada é aplicado aqui: o
// editor mostra as opções e a pessoa escolhe (ou aceita todas) -- a
// escolha vira operações da timeline, desfazíveis, no próprio editor.
// ============================================================

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { agendaDoPlano, aplicarOperacoes, falaParaMidias, lerMomentosVisuais, operacoesDaComposicao, ranquearResultados } from '@makucho/studio-contracts';
import type { MomentoVisual, ResultadoDaBusca, TimelineOperation, TipoDaBusca } from '@makucho/studio-contracts';
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
   * Na MONTAGEM com IA (proposta.service): a IA escolhe os momentos, a
   * melhor opção de cada um é importada e as camadas entram numa versão
   * nova do plano -- o vídeo já abre ilustrado. Desligável no Kit de marca
   * (`midiasDaIa: false`). Nunca derruba a montagem: qualquer falha vira
   * zero mídias e um aviso no log.
   */
  async ilustrarNaMontagem(workspaceId: string, projectId: string): Promise<number> {
    const perfil = await this.prisma.brandProfile.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { version: 'desc' },
      select: { colors: true, videoDefaults: true },
    });
    const prefs = (perfil?.videoDefaults ?? {}) as { midiasDaIa?: boolean };
    if (prefs.midiasDaIa === false) return 0;
    const cor = (perfil?.colors as { primary?: string } | null)?.primary;
    const tenant: TenantContext = { userId: 'sistema', workspaceId, role: 'OWNER' };

    const { momentos } = await this.sugerir(tenant, projectId);
    const ops: TimelineOperation[] = [];
    let colocadas = 0;
    for (const m of momentos) {
      // A 1ª opção que baixar (fonte fora do ar, arquivo grande: tenta a 2ª).
      for (const opcao of m.opcoes.slice(0, 2)) {
        try {
          const imp = await this.banco.importar(tenant, { fonte: opcao.fonte, tipo: opcao.tipo, id: opcao.id });
          ops.push(
            ...operacoesDaComposicao(
              m,
              {
                assetId: imp.id,
                kind: opcao.tipo === 'video' ? 'video' : 'image',
                largura: imp.largura ?? opcao.largura,
                altura: imp.altura ?? opcao.altura,
                transparente: imp.transparente || opcao.transparente,
              },
              cor ? { corDaMarca: cor } : {},
            ),
          );
          colocadas += 1;
          break;
        } catch (e) {
          this.log.warn(`mídia de "${m.conceito}" não veio de ${opcao.fonte}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    if (!ops.length) return 0;
    const atual = await this.planos.atual(tenant, projectId);
    const r = aplicarOperacoes(atual.document, ops);
    if (!r.ok || !r.plan) {
      this.log.warn(`mídias da montagem recusadas no projeto ${projectId}: ${r.erro}`);
      return 0;
    }
    // Versão própria (não 'ai'): o plano da SELEÇÃO continua sendo a
    // referência do aproveitamento, e Ctrl+Z tira as mídias de uma vez.
    await this.planos.salvar(tenant, projectId, r.plan, 'ai-comando');
    return colocadas;
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
