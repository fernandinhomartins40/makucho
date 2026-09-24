// ============================================================
// Projetos — a unidade de trabalho (ADR 0010, Fase 4a).
//
// Um projeto amarra roteiro, gravacao, transcricao, EditPlan e
// render. E o primeiro modulo da fase porque sem ele nao ha onde
// pendurar mídia nenhuma.
//
// Estado nunca vem do cliente: quem muda estado e o metodo
// transicionar(), que consulta PROJECT_TRANSITIONS. Aceitar estado
// pelo corpo deixaria a interface pular direto para COMPLETED.
// ============================================================

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { analiseDaIaSchema, canTransition } from '@makucho/studio-contracts';
import type { ProjectInput, ProjectPatch, ProjectState } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import { FilaService } from '../../common/fila.service';
import { StorageService } from '../../common/storage.service';
import { assertOwnership, scopedWhere } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';

/** Campos que a lista precisa. Nunca devolve caminho de arquivo. */
const RESUMO = {
  id: true,
  title: true,
  state: true,
  objective: true,
  framework: true,
  targetDurationMs: true,
  publicError: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filas: FilaService,
    private readonly storage: StorageService,
  ) {}

  async listar(tenant: TenantContext, incluirArquivados = false) {
    const projetos = await this.prisma.project.findMany({
      where: {
        ...scopedWhere(tenant),
        ...(incluirArquivados ? {} : { state: { not: 'ARCHIVED' } }),
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        ...RESUMO,
        // Original e thumbnail são MediaSource separadas: a duração
        // vem de uma, a prévia da outra. Sem elas o cartão mostra o
        // projeto sem prévia — o caso de quem criou e ainda não
        // enviou vídeo.
        mediaSources: {
          where: { kind: { in: ['ORIGINAL', 'THUMBNAIL'] } },
          select: { kind: true, durationMs: true },
        },
      },
    });

    return projetos.map(({ mediaSources, ...projeto }) => {
      const original = mediaSources.find((m) => m.kind === 'ORIGINAL');
      const temThumb = mediaSources.some((m) => m.kind === 'THUMBNAIL');

      return {
        ...projeto,
        durationMs: original?.durationMs ?? null,
        // A rota serve o arquivo; a storageKey nunca sai daqui.
        thumbnailUrl: temThumb ? `/api/projects/${projeto.id}/thumbnail` : null,
        createdAt: projeto.createdAt.toISOString(),
        updatedAt: projeto.updatedAt.toISOString(),
      };
    });
  }

  async obter(tenant: TenantContext, id: string) {
    const projeto = await this.prisma.project.findUnique({
      where: { id },
      include: {
        script: { select: { id: true, title: true } },
        mediaSources: {
          select: {
            id: true,
            kind: true,
            durationMs: true,
            widthPx: true,
            heightPx: true,
            createdAt: true,
          },
        },
        editPlans: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true, createdAt: true },
        },
      },
    });

    // Confere a posse ANTES de devolver: sem isto, conhecer o id de um
    // projeto de outro workspace bastaria para lê-lo.
    assertOwnership(tenant, projeto, 'projeto');
    return { ...projeto, entendimentoDaIa: await this.entendimentoDaIa(id) };
  }

  /**
   * O que a IA entendeu do vídeo na última seleção que deu certo:
   * assunto, promessa, estrutura. Mostrado no editor, para a pessoa
   * ver se a IA pegou o ponto antes de revisar os cortes.
   */
  private async entendimentoDaIa(projectId: string) {
    const ultima = await this.prisma.aiAnalysis.findFirst({
      where: { projectId, parsedOk: true, promptVersion: { startsWith: 'selecao' } },
      orderBy: { createdAt: 'desc' },
      select: { rawOutput: true },
    });
    const texto = (ultima?.rawOutput as { texto?: string } | null)?.texto;
    if (!texto) return null;
    try {
      const json = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
      const lido = analiseDaIaSchema.safeParse(json?.analysis);
      return lido.success ? lido.data : null;
    } catch {
      return null;
    }
  }

  criar(tenant: TenantContext, dados: ProjectInput) {
    return this.prisma.project.create({
      data: {
        workspaceId: tenant.workspaceId,
        title: dados.title,
        scriptId: dados.scriptId ?? null,
        objective: dados.objective ?? null,
        framework: dados.framework ?? null,
        targetDurationMs: dados.targetDurationMs ?? null,
      },
      select: RESUMO,
    });
  }

  async atualizar(tenant: TenantContext, id: string, dados: ProjectPatch) {
    const projeto = await this.prisma.project.findUnique({ where: { id } });
    assertOwnership(tenant, projeto, 'projeto');

    // Um projeto em processamento não aceita mudança: o worker já leu
    // os parâmetros e mudá-los no meio produziria um resultado que não
    // corresponde a nenhuma das duas versões.
    if (projeto && ['UPLOADING', 'INGESTING', 'TRANSCRIBING', 'ANALYZING', 'RENDERING'].includes(projeto.state)) {
      throw new BadRequestException(
        'o projeto está sendo processado; aguarde terminar para editar',
      );
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        ...(dados.title !== undefined && { title: dados.title }),
        ...(dados.scriptId !== undefined && { scriptId: dados.scriptId }),
        ...(dados.objective !== undefined && { objective: dados.objective }),
        ...(dados.framework !== undefined && { framework: dados.framework }),
        ...(dados.targetDurationMs !== undefined && {
          targetDurationMs: dados.targetDurationMs,
        }),
      },
      select: RESUMO,
    });
  }

  /**
   * Arquiva em vez de apagar.
   *
   * O projeto some da lista mas o vídeo continua no disco até a
   * retenção decidir. Apagar na hora impediria desfazer um clique
   * errado, e a gravação pode ser a única cópia que a pessoa tem.
   */
  async arquivar(tenant: TenantContext, id: string) {
    const projeto = await this.prisma.project.findUnique({ where: { id } });
    assertOwnership(tenant, projeto, 'projeto');
    if (!projeto) throw new NotFoundException();

    if (!canTransition(projeto.state as ProjectState, 'ARCHIVED')) {
      throw new BadRequestException(
        'não dá para arquivar um projeto neste estado; cancele o processamento primeiro',
      );
    }

    return this.prisma.project.update({
      where: { id },
      data: { state: 'ARCHIVED' },
      select: RESUMO,
    });
  }

  /**
   * Exclui o projeto e TODOS os arquivos dele, em qualquer estado.
   *
   * Arquivar só esconde: o vídeo continua no disco e na cota. Quem
   * precisa de espaço, ou tem um projeto travado no meio do
   * processamento (que não podia nem ser arquivado), precisa disto.
   *
   * Ordem: filas, banco, disco. Sem a linha no banco nenhum worker
   * consegue mais gravar resultado; um que já estava no meio pode
   * ainda deixar um arquivo na pasta, por isso ela é apagada de novo
   * minutos depois. O roteiro de origem fica: ele não é mídia e pode
   * virar outro vídeo.
   */
  async excluir(tenant: TenantContext, id: string) {
    const projeto = await this.prisma.project.findUnique({ where: { id } });
    assertOwnership(tenant, projeto, 'projeto');
    if (!projeto) throw new NotFoundException();

    const pasta = this.storage.pastaDoProjeto(projeto.workspaceId, id);
    const liberadoBytes = await this.storage.tamanhoDaPasta(pasta);

    await this.filas.descartarDoProjeto(id);

    await this.prisma.$transaction(async (tx) => {
      // Render aponta para o plano com RESTRICT: sai antes, senão a
      // cascata do projeto esbarra nele.
      await tx.render.deleteMany({ where: { projectId: id } });
      await tx.project.delete({ where: { id } });
      await tx.auditEvent.create({
        data: {
          workspaceId: projeto.workspaceId,
          actorId: tenant.userId,
          action: 'project.deleted',
          entityType: 'Project',
          entityId: id,
          metadata: { title: projeto.title, state: projeto.state, liberadoBytes },
        },
      });
    });

    await this.storage.remover(pasta);
    setTimeout(() => void this.storage.remover(pasta).catch(() => undefined), 10 * 60_000).unref();

    return { ok: true, liberadoBytes };
  }

  /**
   * A transcrição do projeto, palavra por palavra.
   *
   * Existe para a correção manual de legenda: sem os ids das
   * palavras, a tela não tem o que corrigir — a âncora da correção é
   * o id da `TranscriptWord`, e não um tempo.
   *
   * Devolve as palavras agrupadas por segmento, porque quem corrige
   * precisa ver a frase em volta: é o contexto que revela que
   * "macucho" era "Makucho". Uma lista plana de palavras faria a
   * pessoa corrigir no escuro.
   */
  async transcricao(tenant: TenantContext, id: string) {
    const projeto = await this.prisma.project.findUnique({ where: { id } });
    assertOwnership(tenant, projeto, 'projeto');
    if (!projeto) throw new NotFoundException();

    const transcricao = await this.prisma.transcription.findFirst({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        segments: {
          orderBy: { startMs: 'asc' },
          include: { words: { orderBy: { startMs: 'asc' } } },
        },
      },
    });

    // Sem transcrição ainda não é erro: o projeto pode estar no meio
    // do processamento, e a tela mostra "transcrevendo" em vez de um
    // 404 que pareceria defeito.
    if (!transcricao) return { existe: false as const, segmentos: [] };

    return {
      existe: true as const,
      idioma: transcricao.language,
      segmentos: transcricao.segments.map((s) => ({
        id: s.id,
        startMs: s.startMs,
        endMs: s.endMs,
        texto: s.text,
        palavras: s.words.map((w) => ({
          id: w.id,
          startMs: w.startMs,
          endMs: w.endMs,
          texto: w.word,
          // A confiança orienta onde olhar primeiro: o whisper erra
          // mais onde ele mesmo tem menos certeza, e destacar isso na
          // tela é mais útil que pedir revisão palavra por palavra.
          confianca: w.confidence,
        })),
      })),
    };
  }

  /**
   * Recomeça o processamento de um projeto que falhou.
   *
   * A tela promete "Falhou — dá para tentar de novo" desde o primeiro
   * dia; esta é a rota que cumpre a promessa.
   *
   * Recomeça da etapa MAIS ADIANTADA que já tem insumo pronto: se o
   * áudio foi extraído, a falha foi da transcrição, e refazer proxy e
   * thumbnail gastaria minutos de FFmpeg para produzir os mesmos
   * arquivos. O lock global é único na VPS — trabalho repetido aqui é
   * fila parada para todo mundo.
   */
  async reprocessar(tenant: TenantContext, id: string) {
    const projeto = await this.prisma.project.findUnique({ where: { id } });
    assertOwnership(tenant, projeto, 'projeto');
    if (!projeto) throw new NotFoundException();

    // "Analisando" parado também aceita: é o estado em que um projeto
    // ficava preso antes de a análise ser automática.
    if (projeto.state !== 'FAILED_RETRYABLE' && projeto.state !== 'ANALYZING') {
      throw new BadRequestException(
        'só dá para tentar de novo um projeto que falhou e permite retentativa',
      );
    }

    // Transcrição pronta: a falha foi na proposta, e refazer mídia e
    // transcrição gastaria minutos de CPU para chegar ao mesmo ponto.
    const transcrito = await this.prisma.transcriptSegment.count({
      where: { transcription: { projectId: id } },
    });

    if (transcrito > 0) {
      if (!(await this.filas.analisar(id))) {
        throw new BadRequestException(
          'não foi possível recomeçar agora; tente de novo em alguns minutos',
        );
      }
      return this.transicionar(id, 'ANALYZING');
    }

    const audio = await this.prisma.mediaSource.findFirst({
      where: { projectId: id, kind: 'AUDIO' },
      orderBy: { createdAt: 'desc' },
    });

    if (audio) {
      const enfileirou = await this.filas.transcrever(id, audio.id);
      if (!enfileirou) {
        throw new BadRequestException(
          'não foi possível recomeçar agora; tente de novo em alguns minutos',
        );
      }
      return this.transicionar(id, 'TRANSCRIBING');
    }

    const original = await this.prisma.mediaSource.findFirst({
      where: { projectId: id, kind: 'ORIGINAL' },
      orderBy: { createdAt: 'desc' },
    });

    if (!original) {
      // A junção das partes falhou antes de gerar o original: tenta
      // juntar de novo.
      const partes = await this.prisma.mediaSource.count({ where: { projectId: id, kind: 'PART' } });
      if (partes > 1 && (await this.filas.juntarPartes(id))) {
        return this.transicionar(id, 'INGESTING');
      }
      throw new BadRequestException(
        'este projeto não tem vídeo enviado; envie a gravação antes de tentar de novo',
      );
    }

    const enfileirou = await this.filas.prepararMidia(id, original.id);
    if (!enfileirou) {
      throw new BadRequestException(
        'não foi possível recomeçar agora; tente de novo em alguns minutos',
      );
    }
    return this.transicionar(id, 'INGESTING');
  }

  /**
   * Muda o estado respeitando a máquina de transições.
   *
   * É o único caminho: os workers e os controllers chamam este método
   * em vez de escrever `state` direto. Uma transição inválida é erro
   * de programação, então falha alto em vez de gravar um estado que
   * ninguém sabe interpretar.
   */
  async transicionar(
    id: string,
    destino: ProjectState,
    opcoes?: { publicError?: string | null },
  ) {
    const projeto = await this.prisma.project.findUnique({ where: { id } });
    if (!projeto) throw new NotFoundException('projeto não encontrado');

    const origem = projeto.state as ProjectState;
    if (origem === destino) return projeto;

    if (!canTransition(origem, destino)) {
      throw new BadRequestException(
        `transição inválida: ${origem} não leva a ${destino}`,
      );
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        state: destino,
        // A mensagem de falha some quando o projeto sai do estado de
        // erro: mantê-la faria a tela mostrar um erro já resolvido.
        publicError: opcoes?.publicError ?? null,
      },
    });
  }
}
