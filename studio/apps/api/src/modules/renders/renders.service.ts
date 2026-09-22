// ============================================================
// Exportação do vídeo (Fase 7).
//
// "Exportar vídeo" prometia um arquivo desde o redesenho e não
// gerava nenhum. Esta é a rota que cumpre a promessa.
//
// O render roda por FILA, ao contrário da análise: leva minutos, não
// dezenas de segundos, e ninguém fica olhando a tela esperando. O
// usuário pede, fecha a aba e volta depois — e é por isso que o
// estado precisa ser consultável.
// ============================================================

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { FilaService } from '../../common/fila.service';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage.service';
import { assertOwnership } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';

@Injectable()
export class RendersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filas: FilaService,
    private readonly storage: StorageService,
  ) {}

  /** Pede a exportação do plano ativo. */
  async exportar(tenant: TenantContext, projectId: string, clipsDesligados: string[] = []) {
    const projeto = await this.prisma.project.findUnique({ where: { id: projectId } });
    assertOwnership(tenant, projeto, 'projeto');
    if (!projeto) throw new NotFoundException();

    const plano = await this.prisma.editPlan.findFirst({
      where: { projectId, isActive: true },
      orderBy: { version: 'desc' },
    });

    if (!plano) {
      throw new BadRequestException(
        'este projeto ainda não tem uma proposta de edição; peça a análise da IA antes de exportar',
      );
    }

    // Um render em andamento é o que tem startedAt e não tem
    // finishedAt. Pedir outro por cima dobraria o trabalho mais
    // pesado do pipeline numa VPS onde o lock é único.
    const emAndamento = await this.prisma.render.findFirst({
      where: { projectId, finishedAt: null, startedAt: { not: null } },
    });

    if (emAndamento) {
      return { id: emAndamento.id, estado: 'processando' as const, jaExistia: true };
    }

    const render = await this.prisma.render.create({
      data: { projectId, editPlanId: plano.id },
    });

    const enfileirou = await this.filas.renderizar(
      projectId,
      plano.id,
      render.id,
      clipsDesligados,
    );

    if (!enfileirou) {
      // O registro fica, com a falha anotada: um render sem job é
      // indistinguível de um job perdido, e o usuário precisa saber
      // que pode pedir de novo.
      await this.prisma.render.update({
        where: { id: render.id },
        data: { finishedAt: new Date(), qualityCheck: { erro: 'não foi possível enfileirar' } },
      });
      throw new BadRequestException(
        'não foi possível iniciar a exportação agora; tente de novo em alguns minutos',
      );
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { state: 'RENDERING', publicError: null },
    });

    return { id: render.id, estado: 'processando' as const, jaExistia: false };
  }

  /** O estado da exportação mais recente. */
  async situacao(tenant: TenantContext, projectId: string) {
    const projeto = await this.prisma.project.findUnique({ where: { id: projectId } });
    assertOwnership(tenant, projeto, 'projeto');
    if (!projeto) throw new NotFoundException();

    const render = await this.prisma.render.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    if (!render) return { existe: false as const };

    const qualidade = render.qualityCheck as { erro?: string; ok?: boolean } | null;

    return {
      existe: true as const,
      id: render.id,
      // Três estados que o usuário distingue: esperando na fila,
      // sendo processado, e pronto. Um quarto — falhou — vem do
      // qualityCheck, porque a falha é anotada lá pelo worker.
      estado: render.storageKey
        ? ('pronto' as const)
        : qualidade?.erro
          ? ('falhou' as const)
          : render.startedAt
            ? ('processando' as const)
            : ('na_fila' as const),
      tamanhoBytes: render.sizeBytes ? Number(render.sizeBytes) : null,
      duracaoMs: render.durationMs,
      erro: qualidade?.erro ?? null,
      criadoEm: render.createdAt,
      concluidoEm: render.finishedAt,
    };
  }

  /** O arquivo pronto, para download. */
  async arquivo(tenant: TenantContext, projectId: string) {
    const projeto = await this.prisma.project.findUnique({ where: { id: projectId } });
    assertOwnership(tenant, projeto, 'projeto');
    if (!projeto) throw new NotFoundException();

    const render = await this.prisma.render.findFirst({
      where: { projectId, storageKey: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    if (!render?.storageKey) {
      throw new NotFoundException('este projeto ainda não tem vídeo exportado');
    }

    // O caminho vem do banco e é conferido contra a raiz do storage:
    // uma chave manipulada não pode escapar do diretório.
    const caminho = this.storage.caminho(render.storageKey);
    const info = await stat(caminho).catch(() => null);

    if (!info) {
      // O arquivo saiu do disco (retenção, limpeza manual) mas o
      // registro ficou. Dizer a verdade é melhor que um 500.
      throw new NotFoundException(
        'o arquivo exportado não está mais disponível; exporte de novo',
      );
    }

    return {
      stream: createReadStream(caminho),
      tamanho: info.size,
      // O nome do arquivo é o do projeto: quem baixa dez vídeos não
      // quer dez "render.mp4" na pasta de downloads.
      nome: `${sanitizar(projeto.title)}.mp4`,
    };
  }
}

/** Nome de arquivo seguro a partir do título do projeto. */
function sanitizar(titulo: string): string {
  const limpo = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);

  return limpo || 'video';
}
