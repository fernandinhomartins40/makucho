// ============================================================
// Assets do workspace — logo, trilha, fonte, imagem.
//
// Os botoes em Marca prometiam isso desde a Fase 2 e nao tinham nada
// atras. Agora que o render aplica a legenda pelo estilo da marca, e
// o que falta para a identidade visual chegar ao video por inteiro.
//
// TRES REGRAS QUE DEFINEM ESTE ARQUIVO
//
// 1. O MIME vale pelos BYTES, nunca pela extensao nem pelo
//    Content-Type (plano, secao 10.2). Um .exe renomeado para .png
//    passa pelos dois primeiros e para no terceiro.
//
// 2. O nome enviado pelo usuario NUNCA vira caminho. Ele pode conter
//    "../", separador de diretorio ou byte nulo. O original fica como
//    metadado; o caminho e gerado de dados controlados.
//
// 3. SVG passa por sanitizacao. Um SVG e documento XML: servido
//    inline, seu <script> roda no dominio da aplicacao, com acesso ao
//    cookie de sessao. O cliente envia o proprio logo, entao o
//    arquivo e confiavel na INTENCAO e nao na FORMA -- um editor
//    grafico embute script sem ninguem perceber.
// ============================================================

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  MIME_POR_TIPO,
  TAMANHO_MAXIMO,
  assetKindSchema,
  storageKeySeguro,
  svgEhSeguro,
  validarArquivo,
} from '@makucho/studio-contracts';
import type { AssetKind } from '@makucho/studio-contracts';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage.service';
import type { TenantContext } from '../../common/tenant';

/**
 * Cota de assets por workspace.
 *
 * Separada da cota de midia: um logo de 2 MB nao pode competir com
 * um video de 2 GB pelo mesmo teto, senao o primeiro upload de video
 * impediria trocar a logo. Numero pequeno de proposito -- marca e
 * feita de poucos arquivos, e 200 MB comportam dezenas deles.
 */
const COTA_DE_ASSETS_BYTES = 200 * 1024 * 1024;

/** Extensao a partir do MIME real, nao do nome do arquivo. */
const EXTENSAO_POR_MIME: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/json': 'json',
};

@Injectable()
export class AssetsService {
  private readonly log = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Os assets ativos do workspace, opcionalmente de um tipo. */
  async listar(tenant: TenantContext, kind?: string) {
    const tipo = kind ? assetKindSchema.safeParse(kind) : null;
    if (kind && !tipo?.success) {
      throw new BadRequestException(`tipo de asset desconhecido: ${kind}`);
    }

    const assets = await this.prisma.asset.findMany({
      where: {
        workspaceId: tenant.workspaceId,
        isActive: true,
        ...(tipo?.success ? { kind: tipo.data } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        kind: true,
        mimeType: true,
        originalName: true,
        sizeBytes: true,
        widthPx: true,
        heightPx: true,
        durationMs: true,
        hasAlpha: true,
        license: true,
        createdAt: true,
      },
    });

    return assets.map((a) => ({ ...a, sizeBytes: Number(a.sizeBytes) }));
  }

  /**
   * Recebe um asset e o grava.
   *
   * A ordem dos passos e o que da as garantias, e cada uma barra um
   * caso concreto:
   *
   *   1. tipo valido        -> o resto depende dele (teto, MIME)
   *   2. tamanho            -> antes de olhar o conteudo
   *   3. MIME pelos bytes   -> .exe renomeado para .png para aqui
   *   4. SVG sanitizado     -> <script> no logo para aqui
   *   5. cota               -> antes de gravar, nao depois
   *   6. grava e registra
   */
  async enviar(
    tenant: TenantContext,
    dados: {
      kind: string;
      originalName: string;
      mimeDeclarado: string;
      conteudo: Buffer;
      license?: unknown;
    },
  ) {
    const tipo = assetKindSchema.safeParse(dados.kind);
    if (!tipo.success) {
      throw new BadRequestException(`tipo de asset desconhecido: ${dados.kind}`);
    }
    const kind = tipo.data;

    if (dados.conteudo.byteLength === 0) {
      throw new BadRequestException('o arquivo chegou vazio');
    }

    const teto = TAMANHO_MAXIMO[kind];
    if (dados.conteudo.byteLength > teto) {
      throw new PayloadTooLargeException(
        `${kind} aceita até ${Math.round(teto / 1024 / 1024)} MB; ` +
          `este arquivo tem ${Math.round(dados.conteudo.byteLength / 1024 / 1024)} MB`,
      );
    }

    // O que vale e o conteudo. A divergencia entre o declarado e o
    // real ja e sinal de problema: ou o cliente errou, ou tentou
    // disfarcar o arquivo.
    const validacao = validarArquivo(
      dados.conteudo.subarray(0, 512),
      dados.mimeDeclarado,
      MIME_POR_TIPO[kind],
    );

    if (!validacao.ok || !validacao.mimeReal) {
      throw new BadRequestException(validacao.erro ?? 'arquivo não reconhecido');
    }

    const mimeReal = validacao.mimeReal;

    if (mimeReal === 'image/svg+xml') {
      const exame = svgEhSeguro(dados.conteudo.toString('utf8'));
      if (!exame.seguro) {
        // O motivo tecnico vai para o log; a tela recebe uma frase
        // que a pessoa entende. Ela nao colocou o script ali de
        // proposito -- foi o editor grafico.
        this.log.warn(`SVG recusado no workspace ${tenant.workspaceId}: ${exame.motivo}`);
        throw new BadRequestException(
          'este SVG contém código ativo e não pode ser usado. ' +
            'Exporte novamente sem scripts, ou envie em PNG.',
        );
      }
    }

    const usado = await this.usoDeAssets(tenant.workspaceId);
    if (usado + dados.conteudo.byteLength > COTA_DE_ASSETS_BYTES) {
      throw new PayloadTooLargeException(
        `a cota de assets do workspace (${Math.round(COTA_DE_ASSETS_BYTES / 1024 / 1024)} MB) ` +
          'foi atingida; remova algum arquivo antes de enviar outro',
      );
    }

    // O hash do CONTEUDO, e nao um id aleatorio: enviar o mesmo
    // arquivo duas vezes reaproveita a chave em vez de duplicar
    // bytes no disco da VPS.
    const hash = createHash('sha256').update(dados.conteudo).digest('hex').slice(0, 32);
    const chave = storageKeySeguro(
      tenant.workspaceId,
      kind,
      hash,
      EXTENSAO_POR_MIME[mimeReal] ?? 'bin',
    );

    // Mesmo arquivo, mesmo tipo, mesmo workspace: devolve o que ja
    // existe. Sem isto, trocar a logo e voltar atras acumularia
    // copias identicas.
    const existente = await this.prisma.asset.findUnique({ where: { storageKey: chave } });
    if (existente) {
      if (!existente.isActive) {
        await this.prisma.asset.update({
          where: { id: existente.id },
          data: { isActive: true },
        });
      }
      return { id: existente.id, kind: existente.kind, jaExistia: true };
    }

    await this.storage.gravar(chave, dados.conteudo);

    const dimensoes = medirImagem(dados.conteudo, mimeReal);

    const asset = await this.prisma.asset.create({
      data: {
        workspaceId: tenant.workspaceId,
        kind,
        mimeType: mimeReal,
        storageKey: chave,
        // O nome original e METADADO, nunca caminho. Truncado porque
        // o banco tem limite e o nome nao precisa ser exato.
        originalName: dados.originalName.slice(0, 255),
        sizeBytes: dados.conteudo.byteLength,
        widthPx: dimensoes?.largura ?? null,
        heightPx: dimensoes?.altura ?? null,
        hasAlpha: dimensoes?.alfa ?? false,
        license: (dados.license as never) ?? null,
      },
    });

    return { id: asset.id, kind: asset.kind, jaExistia: false };
  }

  /** O arquivo, para servir. */
  async arquivo(tenant: TenantContext, id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, workspaceId: tenant.workspaceId, isActive: true },
    });

    if (!asset) throw new NotFoundException('asset não encontrado');

    const caminho = this.storage.caminho(asset.storageKey);
    const tamanho = await this.storage.tamanho(asset.storageKey);

    if (tamanho === null) {
      // O registro ficou e o arquivo saiu do disco. Dizer a verdade
      // e melhor que um 500.
      throw new NotFoundException('o arquivo não está mais disponível; envie de novo');
    }

    return { caminho, tamanho, mimeType: asset.mimeType, nome: asset.originalName };
  }

  /**
   * Desativa em vez de apagar.
   *
   * Um video antigo pode ter sido gerado com esta logo, e apagar o
   * arquivo tornaria impossivel reproduzir o resultado ou saber com
   * que marca ele foi feito. O bit `isActive` tira da tela sem
   * destruir o historico.
   */
  async remover(tenant: TenantContext, id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, workspaceId: tenant.workspaceId },
    });

    if (!asset) throw new NotFoundException('asset não encontrado');

    await this.prisma.asset.update({ where: { id }, data: { isActive: false } });
    return { ok: true };
  }

  /** Quanto os assets ativos ocupam, para a cota. */
  private async usoDeAssets(workspaceId: string): Promise<number> {
    const soma = await this.prisma.asset.aggregate({
      where: { workspaceId, isActive: true },
      _sum: { sizeBytes: true },
    });
    return Number(soma._sum.sizeBytes ?? 0);
  }

  /** O uso e o teto, para a tela mostrar antes de o limite bater. */
  async cota(tenant: TenantContext) {
    const usado = await this.usoDeAssets(tenant.workspaceId);
    return {
      usadoBytes: usado,
      quotaBytes: COTA_DE_ASSETS_BYTES,
      percentual: Math.round((usado / COTA_DE_ASSETS_BYTES) * 100),
    };
  }
}

/**
 * Dimensoes de PNG e WebP, lidas do cabecalho.
 *
 * Sem biblioteca de imagem: sao dois formatos com cabecalho fixo, e
 * trazer `sharp` para ler oito bytes acrescentaria uma dependencia
 * nativa de ~30 MB ao container. Devolve `null` no que nao conhece --
 * dimensao e informativa, nao requisito.
 *
 * O alfa importa para logo: uma logo sem transparencia ganha um
 * retangulo branco quando sobreposta ao video, e vale avisar antes
 * de o usuario descobrir no resultado.
 */
function medirImagem(
  buffer: Buffer,
  mime: string,
): { largura: number; altura: number; alfa: boolean } | null {
  if (mime === 'image/png' && buffer.byteLength >= 33) {
    // Confere que o IHDR esta ONDE deveria antes de ler os offsets.
    //
    // Sem isto, um PNG truncado ou com cabecalho deslocado produz
    // numeros absurdos gravados no banco -- medido: um arquivo de
    // teste malformado devolveu altura 134.610.944. O dado seria
    // exibido na tela como dimensao da logo.
    if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;

    const largura = buffer.readUInt32BE(16);
    const altura = buffer.readUInt32BE(20);

    // O teto do formato e 2^31-1, mas nenhuma imagem real chega
    // perto: 65535 ja e maior que qualquer tela. Fora disso, o
    // cabecalho esta corrompido.
    if (largura < 1 || altura < 1 || largura > 65_535 || altura > 65_535) return null;

    // Tipo de cor no byte 25: 4 = cinza com alfa, 6 = RGBA.
    const tipoDeCor = buffer.readUInt8(25);

    return { largura, altura, alfa: tipoDeCor === 4 || tipoDeCor === 6 };
  }

  if (mime === 'image/webp' && buffer.byteLength >= 30) {
    // Somente VP8L e VP8X trazem dimensao em posicao fixa; o VP8
    // simples exige decodificar. Nao vale o codigo para um caso que
    // so preenche um campo informativo.
    // O container RIFF/WEBP confirmado antes dos offsets, pelo mesmo
    // motivo do PNG.
    if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
    if (buffer.toString('ascii', 8, 12) !== 'WEBP') return null;

    const formato = buffer.toString('ascii', 12, 16);
    if (formato === 'VP8X') {
      const largura = 1 + buffer.readUIntLE(24, 3);
      const altura = 1 + buffer.readUIntLE(27, 3);
      if (largura > 65_535 || altura > 65_535) return null;

      // O bit 4 do flag em 20 indica canal alfa.
      return { largura, altura, alfa: (buffer.readUInt8(20) & 0x10) !== 0 };
    }
  }

  return null;
}
