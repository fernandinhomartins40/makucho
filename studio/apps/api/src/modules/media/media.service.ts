// ============================================================
// Mídia — entrada de vídeo (ADR 0010, Fase 4a).
//
// Dois caminhos convergem aqui: o arquivo que a pessoa envia e a
// gravação feita no navegador. Os dois usam a mesma sessão de upload
// em pedaços, porque o problema é o mesmo — mandar centenas de MB por
// uma conexão que pode cair.
//
// A quota é conferida ao ABRIR a sessão, não ao terminar: descobrir
// que não cabia depois de 2 GB enviados é o pior momento possível
// para avisar.
// ============================================================

import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { QUOTA_EDICAO_BYTES } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage.service';
import { FilaService } from '../../common/fila.service';
import { assertOwnership } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';

/** 5 MB: grande o bastante para não virar milhares de requisições,
    pequeno o bastante para reenviar sem dor quando um falha. */
export const TAMANHO_DO_PEDACO = 5 * 1024 * 1024;

const TAMANHO_MAXIMO_BYTES = 2 * 1024 * 1024 * 1024;
const DURACAO_MAXIMA_MS = 30 * 60 * 1000;

/** O que aceitamos. WebM entra porque é o que o navegador grava. */
const TIPOS_ACEITOS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
};

interface Sessao {
  uploadId: string;
  projectId: string;
  workspaceId: string;
  nome: string;
  mimeType: string;
  tamanhoTotal: number;
  recebidos: Set<number>;
  criadaEm: number;
}

@Injectable()
export class MediaService {
  private readonly log = new Logger(MediaService.name);

  /**
   * Sessões em memória.
   *
   * Um upload aberto não sobrevive a um restart da API — e isso é
   * aceitável: o cliente reabre a sessão e reenvia. Persistir sessão
   * em banco só valeria a pena se o restart fosse comum, e nesse caso
   * o problema seria outro.
   */
  private readonly sessoes = new Map<string, Sessao>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly fila: FilaService,
  ) {}

  // ---------- Abrir ----------

  async abrir(
    tenant: TenantContext,
    projectId: string,
    dados: { nome: string; mimeType: string; tamanhoBytes: number; duracaoMs?: number },
  ) {
    const projeto = await this.prisma.project.findUnique({ where: { id: projectId } });
    assertOwnership(tenant, projeto, 'projeto');

    const extensao = TIPOS_ACEITOS[dados.mimeType];
    if (!extensao) {
      throw new BadRequestException(
        `formato não aceito. Envie MP4, MOV, WebM, MKV ou AVI.`,
      );
    }

    if (dados.tamanhoBytes > TAMANHO_MAXIMO_BYTES) {
      throw new PayloadTooLargeException(
        `o arquivo tem ${gb(dados.tamanhoBytes)} GB e o limite é 2 GB.`,
      );
    }

    if (dados.duracaoMs && dados.duracaoMs > DURACAO_MAXIMA_MS) {
      throw new BadRequestException(
        `o vídeo tem ${Math.round(dados.duracaoMs / 60_000)} min e o limite é 30 min.`,
      );
    }

    // A quota, ANTES de aceitar um byte.
    const usado = await this.storage.usoDoWorkspace(tenant.workspaceId);
    if (usado + dados.tamanhoBytes > QUOTA_EDICAO_BYTES) {
      const livre = Math.max(0, QUOTA_EDICAO_BYTES - usado);
      throw new PayloadTooLargeException(
        `não há espaço: o arquivo precisa de ${gb(dados.tamanhoBytes)} GB e restam ` +
          `${gb(livre)} GB. Arquive projetos antigos para liberar espaço.`,
      );
    }

    const uploadId = randomUUID();
    this.sessoes.set(uploadId, {
      uploadId,
      projectId,
      workspaceId: tenant.workspaceId,
      nome: dados.nome,
      mimeType: dados.mimeType,
      tamanhoTotal: dados.tamanhoBytes,
      recebidos: new Set(),
      criadaEm: Date.now(),
    });

    this.limparSessoesVelhas();

    return {
      uploadId,
      tamanhoDoPedaco: TAMANHO_DO_PEDACO,
      totalDePedacos: Math.ceil(dados.tamanhoBytes / TAMANHO_DO_PEDACO),
      recebidos: [] as number[],
    };
  }

  // ---------- Enviar pedaço ----------

  async receberPedaco(
    tenant: TenantContext,
    uploadId: string,
    indice: number,
    corpo: Buffer,
  ) {
    const sessao = this.sessaoDe(tenant, uploadId);

    if (!Number.isInteger(indice) || indice < 0) {
      throw new BadRequestException('índice de pedaço inválido');
    }

    await this.storage.gravar(this.storage.chaveDePedaco(uploadId, indice), corpo);
    sessao.recebidos.add(indice);

    return {
      recebidos: sessao.recebidos.size,
      total: Math.ceil(sessao.tamanhoTotal / TAMANHO_DO_PEDACO),
    };
  }

  /** O que já chegou — é o que permite retomar de onde parou. */
  estado(tenant: TenantContext, uploadId: string) {
    const sessao = this.sessaoDe(tenant, uploadId);
    return {
      uploadId,
      tamanhoDoPedaco: TAMANHO_DO_PEDACO,
      totalDePedacos: Math.ceil(sessao.tamanhoTotal / TAMANHO_DO_PEDACO),
      recebidos: [...sessao.recebidos].sort((a, b) => a - b),
    };
  }

  // ---------- Concluir ----------

  async concluir(tenant: TenantContext, uploadId: string) {
    const sessao = this.sessaoDe(tenant, uploadId);
    const esperados = Math.ceil(sessao.tamanhoTotal / TAMANHO_DO_PEDACO);

    if (sessao.recebidos.size !== esperados) {
      const faltam = esperados - sessao.recebidos.size;
      throw new BadRequestException(
        `faltam ${faltam} ${faltam === 1 ? 'pedaço' : 'pedaços'} para concluir o envio.`,
      );
    }

    const extensao = TIPOS_ACEITOS[sessao.mimeType] ?? 'bin';
    const chave = this.storage.chaveDeMidia(
      sessao.workspaceId,
      sessao.projectId,
      'original',
      extensao,
    );

    const tamanho = await this.storage.juntarPedacos(uploadId, chave);

    // O registro só existe depois que o arquivo está inteiro no disco:
    // uma MediaSource apontando para arquivo incompleto faria o worker
    // falhar com um erro que não explica nada.
    const midia = await this.prisma.mediaSource.create({
      data: {
        projectId: sessao.projectId,
        kind: 'ORIGINAL',
        storageKey: chave,
        mimeType: sessao.mimeType,
        sizeBytes: BigInt(tamanho),
      },
    });

    const enfileirado = await this.fila.prepararMidia(sessao.projectId, midia.id);

    // Se o Redis estiver fora do ar, o arquivo já está salvo: o
    // projeto fica num estado que a tela sabe explicar e que permite
    // tentar de novo, em vez de perder 2 GB de envio.
    await this.prisma.project.update({
      where: { id: sessao.projectId },
      data: enfileirado
        ? { state: 'INGESTING', publicError: null }
        : {
            state: 'FAILED_RETRYABLE',
            publicError: 'O vídeo foi recebido, mas o preparo não começou. Tente de novo.',
          },
    });

    this.sessoes.delete(uploadId);
    this.log.log(`upload concluído: projeto ${sessao.projectId}, ${tamanho} bytes`);

    return {
      mediaSourceId: midia.id,
      tamanhoBytes: tamanho,
      state: enfileirado ? 'INGESTING' : 'FAILED_RETRYABLE',
    };
  }

  /** Descarta a sessão e os pedaços já gravados. */
  async cancelar(tenant: TenantContext, uploadId: string) {
    const sessao = this.sessaoDe(tenant, uploadId);
    await this.storage.remover(`_tmp/${uploadId}`);
    this.sessoes.delete(uploadId);
    return { cancelado: true, projectId: sessao.projectId };
  }

  // ---------- Servir ----------

  async arquivoDoProjeto(
    tenant: TenantContext,
    projectId: string,
    kind: 'ORIGINAL' | 'PROXY' | 'THUMBNAIL',
  ) {
    const projeto = await this.prisma.project.findUnique({ where: { id: projectId } });
    assertOwnership(tenant, projeto, 'projeto');

    // A mais recente: um projeto que recebeu um segundo vídeo tem dois
    // registros, e o editor precisa tocar o novo.
    const midia = await this.prisma.mediaSource.findFirst({
      where: { projectId, kind },
      orderBy: { createdAt: 'desc' },
    });
    if (!midia) throw new NotFoundException('mídia não encontrada');

    const caminho = this.storage.caminho(midia.storageKey);
    const tamanho = await this.storage.tamanho(midia.storageKey);
    if (tamanho === null) {
      throw new NotFoundException('o arquivo não está mais no disco');
    }

    return { caminho, tamanho, mimeType: midia.mimeType };
  }

  // ---------- Internos ----------

  private sessaoDe(tenant: TenantContext, uploadId: string): Sessao {
    const sessao = this.sessoes.get(uploadId);

    // 404 e não 403: confirmar que a sessão existe permitiria varrer
    // ids de upload de outros workspaces.
    if (!sessao || sessao.workspaceId !== tenant.workspaceId) {
      throw new NotFoundException('sessão de upload não encontrada ou expirada');
    }
    return sessao;
  }

  /**
   * Varre sessões abandonadas.
   *
   * Sem isso, um upload interrompido deixa pedaços consumindo os 6 GB
   * de edição sem aparecer em lugar nenhum — espaço que some e
   * ninguém explica.
   */
  private limparSessoesVelhas() {
    const limite = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, sessao] of this.sessoes) {
      if (sessao.criadaEm < limite) {
        this.sessoes.delete(id);
        void this.storage.remover(`_tmp/${id}`).catch(() => undefined);
      }
    }
  }
}

function gb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1).replace('.', ',');
}
