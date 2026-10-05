// ============================================================
// Animações em HTML (HyperFrames): validar, pedir o vídeo com
// transparência ao worker de render e servir o arquivo pronto.
//
// A chave é calculada AQUI, pelo conteúdo (nunca vem do navegador): a
// mesma animação não é renderizada duas vezes, e o arquivo fica numa
// pasta do workspace.
// ============================================================

import { FONTES_DOS_COMPONENTES } from '@makucho/studio-contracts/dist/componentes-hyperframes';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import {
  CORES_PADRAO_DA_MARCA,
  chaveDaAnimacao,
  chaveDoArquivoDaAnimacao,
  documentoDaComposicao,
  problemasDaComposicao,
  type ComposicaoHtml,
  type EstadoDaAnimacao,
} from '@makucho/studio-contracts';
import { FilaService } from '../../common/fila.service';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage.service';
import type { TenantContext } from '../../common/tenant';

/** `import()` de verdade (o lint do HyperFrames é ESM; a API compila para CommonJS). */
const importarEsm = new Function('m', 'return import(m)') as <T>(m: string) => Promise<T>;

interface Lint {
  lintHyperframeHtml: (
    html: string,
    o?: { filePath?: string },
  ) => Promise<{ errorCount: number; findings: Array<{ code: string; severity: string; message: string; fixHint?: string }> }>;
}

@Injectable()
export class AnimacoesService {
  private readonly log = new Logger(AnimacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly filas: FilaService,
    private readonly storage: StorageService,
  ) {}

  /** A cor principal da marca (a mesma que a prévia usa em --marca). */
  async corDaMarca(workspaceId: string): Promise<string> {
    const perfil = await this.prisma.brandProfile.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { version: 'desc' },
      select: { colors: true },
    });
    const cor = (perfil?.colors as Record<string, unknown> | null)?.primary;
    return typeof cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : CORES_PADRAO_DA_MARCA.primary;
  }

  /**
   * O que impede a animação de ir para o vídeo: a checagem do Studio e o
   * lint oficial do HyperFrames (só os erros). Vazio = pode.
   */
  /**
   * A conferência de sobreposição (grade do layout, texto sobre texto),
   * medida no Chrome do worker. Vazio = ok; `null` = não deu para conferir.
   */
  async problemasDeLayout(c: ComposicaoHtml, duracaoMs: number): Promise<string[] | null> {
    if (process.env.STUDIO_CONFERIR_LAYOUT === 'off') return null;
    return this.filas.conferir({ composicao: c, duracaoMs });
  }

  /**
   * As fotos da animação (JPEG em base64) para a crítica olhar, tiradas no
   * Chrome do worker. `null` = não deu para fotografar.
   */
  async fotografar(c: ComposicaoHtml, duracaoMs: number): Promise<string[] | null> {
    if (process.env.STUDIO_CRITICAR_ANIMACOES === 'off') return null;
    return this.filas.fotografar({ composicao: c, duracaoMs });
  }

  async problemas(c: ComposicaoHtml, duracaoMs: number): Promise<string[]> {
    const nossos = problemasDaComposicao(c);
    if (nossos.length) return nossos;
    try {
      const { lintHyperframeHtml } = await importarEsm<Lint>('@hyperframes/lint');
      const doc = documentoDaComposicao(c, { duracaoMs, gsap: 'gsap.min.js', fontes: '', origens: "'self'", componentes: FONTES_DOS_COMPONENTES });
      const r = await lintHyperframeHtml(doc, { filePath: 'index.html' });
      return r.findings
        .filter((f) => f.severity === 'error')
        .slice(0, 8)
        .map((f) => `${f.code}: ${f.message}${f.fixHint ? ` (${f.fixHint})` : ''}`);
    } catch (e) {
      this.log.warn(`lint do HyperFrames indisponível: ${e instanceof Error ? e.message : e}`);
      return [];
    }
  }

  private async exigirProjeto(tenant: TenantContext, projectId: string) {
    const p = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId: tenant.workspaceId }, select: { id: true } });
    if (!p) throw new NotFoundException('projeto não encontrado');
  }

  /** Pede o vídeo (se ainda não existe) e diz onde está. */
  async preparar(tenant: TenantContext, projectId: string, c: ComposicaoHtml, duracaoMs: number): Promise<{ chave: string; estado: EstadoDaAnimacao; erro?: string }> {
    await this.exigirProjeto(tenant, projectId);
    const cor = await this.corDaMarca(tenant.workspaceId);
    const chave = chaveDaAnimacao(c, duracaoMs, cor);
    if (await this.storage.existe(chaveDoArquivoDaAnimacao(tenant.workspaceId, chave))) return { chave, estado: 'pronta' };
    const atual = await this.filas.estadoDaAnimacao(chave);
    if (atual?.estado === 'failed') return { chave, estado: 'falhou', ...(atual.erro ? { erro: atual.erro } : {}) };
    if (atual) return { chave, estado: 'preparando' };
    const problemas = await this.problemas(c, duracaoMs);
    if (problemas.length) throw new BadRequestException(`a animação tem problemas: ${problemas.join('; ')}`);
    const ok = await this.filas.animar({ workspaceId: tenant.workspaceId, chave, composicao: c, duracaoMs, corDaMarca: cor });
    if (!ok) throw new BadRequestException('não foi possível pedir a animação agora; tente de novo');
    return { chave, estado: 'preparando' };
  }

  /** Onde está o vídeo de uma chave. */
  async estado(tenant: TenantContext, projectId: string, chave: string): Promise<{ estado: EstadoDaAnimacao; erro?: string }> {
    await this.exigirProjeto(tenant, projectId);
    if (await this.storage.existe(chaveDoArquivoDaAnimacao(tenant.workspaceId, chave))) return { estado: 'pronta' };
    const atual = await this.filas.estadoDaAnimacao(chave);
    if (atual?.estado === 'failed') return { estado: 'falhou', ...(atual.erro ? { erro: atual.erro } : {}) };
    return { estado: 'preparando' };
  }

  /** Tenta de novo uma animação que falhou. */
  async tentarDeNovo(tenant: TenantContext, projectId: string, c: ComposicaoHtml, duracaoMs: number) {
    const chave = chaveDaAnimacao(c, duracaoMs, await this.corDaMarca(tenant.workspaceId));
    await this.filas.esquecerAnimacao(chave);
    return this.preparar(tenant, projectId, c, duracaoMs);
  }

  async arquivo(tenant: TenantContext, projectId: string, chave: string) {
    await this.exigirProjeto(tenant, projectId);
    const arquivo = chaveDoArquivoDaAnimacao(tenant.workspaceId, chave);
    if (!(await this.storage.existe(arquivo))) throw new NotFoundException('a animação ainda não está pronta');
    const tamanho = await this.storage.tamanho(arquivo);
    return { tamanho, stream: createReadStream(this.storage.caminho(arquivo)) };
  }
}
