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
          `${gb(livre)} GB. Exclua projetos antigos para liberar espaço.`,
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

  /**
   * Conclui um envio.
   *
   * Com `parte`, o vídeo entra na lista de partes do projeto e NADA é
   * processado ainda: a pessoa pode enviar ou gravar outros e reordenar,
   * e só "Ir para a edição" dispara o preparo (`finalizarPartes`). Sem
   * `parte`, o comportamento antigo: um vídeo só, processado na hora.
   */
  async concluir(tenant: TenantContext, uploadId: string, opcoes: { parte?: boolean } = {}) {
    if (opcoes.parte) return this.concluirParte(tenant, uploadId);
    return this.concluirUnico(tenant, uploadId);
  }

  private async concluirParte(tenant: TenantContext, uploadId: string) {
    const sessao = this.sessaoDe(tenant, uploadId);
    this.conferirCompleto(sessao);

    const extensao = TIPOS_ACEITOS[sessao.mimeType] ?? 'bin';
    const chave = this.storage.chaveDeParte(sessao.workspaceId, sessao.projectId, uploadId, extensao);
    const tamanho = await this.storage.juntarPedacos(uploadId, chave);

    const ultima = await this.prisma.mediaSource.findFirst({
      where: { projectId: sessao.projectId, kind: 'PART' },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const parte = await this.prisma.mediaSource.create({
      data: {
        projectId: sessao.projectId,
        kind: 'PART',
        storageKey: chave,
        mimeType: sessao.mimeType,
        sizeBytes: BigInt(tamanho),
        position: (ultima?.position ?? -1) + 1,
        originalName: sessao.nome.slice(0, 255),
      },
    });

    // O projeto sai de rascunho: tem vídeo, mas ainda não foi mandado
    // para a edição.
    await this.prisma.project.updateMany({
      where: { id: sessao.projectId, state: 'DRAFT' },
      data: { state: 'UPLOADING' },
    });

    this.sessoes.delete(uploadId);
    this.log.log(`parte recebida: projeto ${sessao.projectId}, ${tamanho} bytes`);
    return { mediaSourceId: parte.id, tamanhoBytes: tamanho, state: 'UPLOADING', parte: true };
  }

  private conferirCompleto(sessao: Sessao) {
    const esperados = Math.ceil(sessao.tamanhoTotal / TAMANHO_DO_PEDACO);
    if (sessao.recebidos.size !== esperados) {
      const faltam = esperados - sessao.recebidos.size;
      throw new BadRequestException(
        `faltam ${faltam} ${faltam === 1 ? 'pedaço' : 'pedaços'} para concluir o envio.`,
      );
    }
  }

  // ---------- Partes ----------

  async listarPartes(tenant: TenantContext, projectId: string) {
    const projeto = await this.prisma.project.findUnique({ where: { id: projectId } });
    assertOwnership(tenant, projeto, 'projeto');

    const partes = await this.prisma.mediaSource.findMany({
      where: { projectId, kind: 'PART' },
      orderBy: { position: 'asc' },
    });

    return partes.map((p) => ({
      id: p.id,
      nome: p.originalName ?? 'vídeo',
      tamanhoBytes: Number(p.sizeBytes),
      mimeType: p.mimeType,
      posicao: p.position ?? 0,
    }));
  }

  async removerParte(tenant: TenantContext, projectId: string, parteId: string) {
    await this.conferirEditavel(tenant, projectId);
    const parte = await this.prisma.mediaSource.findFirst({ where: { id: parteId, projectId, kind: 'PART' } });
    if (!parte) throw new NotFoundException('parte não encontrada');

    await this.prisma.mediaSource.delete({ where: { id: parte.id } });
    await this.storage.remover(parte.storageKey).catch(() => undefined);
    return this.listarPartes(tenant, projectId);
  }

  /** Nova ordem: a lista de ids, todos, na ordem em que entram no vídeo. */
  async ordenarPartes(tenant: TenantContext, projectId: string, ids: readonly string[]) {
    await this.conferirEditavel(tenant, projectId);
    const partes = await this.prisma.mediaSource.findMany({
      where: { projectId, kind: 'PART' },
      select: { id: true },
    });

    const existentes = new Set(partes.map((p) => p.id));
    if (ids.length !== existentes.size || !ids.every((id) => existentes.has(id)) || new Set(ids).size !== ids.length) {
      throw new BadRequestException('a nova ordem precisa ter todas as partes, uma vez cada');
    }

    await this.prisma.$transaction(
      ids.map((id, posicao) => this.prisma.mediaSource.update({ where: { id }, data: { position: posicao } })),
    );
    return this.listarPartes(tenant, projectId);
  }

  /**
   * "Ir para a edição": as partes viram o original e o preparo começa.
   *
   * Uma parte só vira o original direto, sem recodificar. Várias vão
   * para o worker de mídia, que as junta na ordem escolhida e segue o
   * mesmo caminho de sempre (proxy, transcrição, IA).
   */
  async finalizarPartes(tenant: TenantContext, projectId: string) {
    await this.conferirEditavel(tenant, projectId);
    const partes = await this.prisma.mediaSource.findMany({
      where: { projectId, kind: 'PART' },
      orderBy: { position: 'asc' },
    });
    if (partes.length === 0) {
      throw new BadRequestException('envie ou grave ao menos um vídeo antes de ir para a edição');
    }

    let enfileirado: boolean;
    if (partes.length === 1) {
      const unica = partes[0]!;
      await this.prisma.mediaSource.update({ where: { id: unica.id }, data: { kind: 'ORIGINAL' } });
      enfileirado = await this.fila.prepararMidia(projectId, unica.id);
    } else {
      enfileirado = await this.fila.juntarPartes(projectId);
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: enfileirado
        ? { state: 'INGESTING', publicError: null }
        : { state: 'FAILED_RETRYABLE', publicError: 'Os vídeos foram recebidos, mas o preparo não começou. Tente de novo.' },
    });

    return { partes: partes.length, state: enfileirado ? 'INGESTING' : 'FAILED_RETRYABLE' };
  }

  /** Partes só mudam antes de o projeto ir para a edição. */
  private async conferirEditavel(tenant: TenantContext, projectId: string) {
    const projeto = await this.prisma.project.findUnique({ where: { id: projectId } });
    assertOwnership(tenant, projeto, 'projeto');
    if (!projeto || !['DRAFT', 'UPLOADING'].includes(projeto.state)) {
      throw new BadRequestException('os vídeos deste projeto já foram para a edição');
    }
  }

  private async concluirUnico(tenant: TenantContext, uploadId: string) {
    const sessao = this.sessaoDe(tenant, uploadId);
    this.conferirCompleto(sessao);

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

  // ---------- Forma de onda ----------

  /**
   * Os picos do áudio do projeto: 100 por segundo, de 0 a 255, no tempo
   * do ORIGINAL -- a timeline recorta o pedaço de cada trecho.
   *
   * Sai do WAV de 16 kHz que a transcrição já usa (sem FFmpeg na API) e
   * fica em cache ao lado dele: a conta roda uma vez por gravação.
   */
  async ondaDoProjeto(tenant: TenantContext, projectId: string): Promise<Buffer> {
    const projeto = await this.prisma.project.findUnique({ where: { id: projectId } });
    assertOwnership(tenant, projeto, 'projeto');
    const audio = await this.prisma.mediaSource.findFirst({
      where: { projectId, kind: 'AUDIO' },
      orderBy: { createdAt: 'desc' },
    });
    if (!audio) throw new NotFoundException('o áudio do projeto não existe');

    const chaveDoCache = `${audio.storageKey}.onda`;
    const emCache = await this.storage.ler(chaveDoCache).catch(() => null);
    if (emCache) return emCache;

    const wav = await this.storage.ler(audio.storageKey).catch(() => null);
    if (!wav) throw new NotFoundException('o áudio do projeto não está mais no disco');
    const picos = picosDoWav(wav, 100);
    await this.storage.gravar(chaveDoCache, picos).catch(() => undefined);
    return picos;
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

/**
 * Picos de um WAV PCM de 16 bits (o que o worker de mídia grava): o
 * maior valor absoluto de cada janela, em raiz quadrada -- a fala baixa
 * continua visível ao lado da alta.
 */
export function picosDoWav(wav: Buffer, porSegundo: number): Buffer {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') return Buffer.alloc(0);
  let canais = 1;
  let taxa = 16_000;
  let bits = 16;
  let inicio = -1;
  let tamanho = 0;
  for (let p = 12; p + 8 <= wav.length; ) {
    const id = wav.toString('ascii', p, p + 4);
    const n = wav.readUInt32LE(p + 4);
    if (id === 'fmt ') {
      canais = wav.readUInt16LE(p + 10);
      taxa = wav.readUInt32LE(p + 12);
      bits = wav.readUInt16LE(p + 22);
    } else if (id === 'data') {
      inicio = p + 8;
      tamanho = Math.min(n, wav.length - inicio);
      break;
    }
    p += 8 + n + (n % 2);
  }
  if (inicio < 0 || bits !== 16) return Buffer.alloc(0);

  const quadro = 2 * canais;
  const amostras = Math.floor(tamanho / quadro);
  const janela = Math.max(1, Math.round(taxa / porSegundo));
  const saida = Buffer.alloc(Math.ceil(amostras / janela));
  for (let j = 0; j < saida.length; j += 1) {
    let pico = 0;
    const fim = Math.min(amostras, (j + 1) * janela);
    for (let a = j * janela; a < fim; a += 1) {
      const v = Math.abs(wav.readInt16LE(inicio + a * quadro));
      if (v > pico) pico = v;
    }
    saida[j] = Math.min(255, Math.round(Math.sqrt(pico / 32768) * 255));
  }
  return saida;
}
