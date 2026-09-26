// ============================================================
// Bancos de mídia: busca unificada nas fontes de licença livre e
// importação para o workspace (fontes.ts tem o formato de cada uma).
//
// As chaves (Pexels, Pixabay) são do workspace, cifradas; as outras
// fontes são abertas. Cada busca fica 24 h em cache na memória (o
// Pixabay pede isso, e a IA repete termos entre momentos e pedidos).
// Importar busca o item DE NOVO na fonte pelo id -- o link do arquivo
// nunca vem do navegador --, baixa com teto de tamanho e grava o asset
// com a licença e o crédito do autor.
// ============================================================

import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import sharp from 'sharp';
import { FONTES_DO_TIPO, TAMANHO_MAXIMO } from '@makucho/studio-contracts';
import type { FonteDeMidia, ImportacaoDeMidia, ResultadoDaBusca, TipoDaBusca } from '@makucho/studio-contracts';
import { CryptoService } from '../../common/crypto.service';
import { PrismaService } from '../../common/prisma.service';
import type { TenantContext } from '../../common/tenant';
import { AssetsService } from '../assets/assets.service';
import { arquivoDaFoto, arquivoDoVideo, linkDoPexels, type FotoDoPexels, type VideoDoPexels } from './pexels';
import {
  COLECOES_DE_LOGO,
  LICENCAS_OPENVERSE,
  arquivoDoIcone3d,
  arquivoDoVideoPixabay,
  buscarIcones3d,
  iconifyResultados,
  licencaDaColecao,
  licencaDoAsset,
  licencaDoOpenverse,
  linkSeguro,
  openverseImagem,
  pexelsFoto,
  pexelsVideo,
  pixabayImagem,
  pixabayVideo,
  urlDoIconify,
  LICENCA_3DICONS,
  LICENCA_FLUENT,
  LICENCA_PEXELS,
  LICENCA_PIXABAY,
  type ColecaoDoIconify,
  type ImagemDoOpenverse,
  type ImagemDoPixabay,
  type VideoDoPixabay,
} from './fontes';

/** Coleções coloridas do Iconify: um ícone "de verdade" sobre o vídeo, não um traço. */
const COLECOES_COLORIDAS = ['fluent-emoji-flat', 'noto', 'twemoji', 'flat-color-icons', 'streamline-color', 'fxemoji', 'emojione'];

const AGENTE = 'MakuchoStudio/1.0 (+https://makucho.com.br)';
const DIA = 24 * 60 * 60 * 1000;

export interface ResultadoDaBuscaUnificada {
  resultados: ResultadoDaBusca[];
  /** Fontes do tipo que ficaram de fora (sem chave, fora do ar, limite). */
  avisos: string[];
}

@Injectable()
export class BancoDeMidiaService {
  private readonly log = new Logger(BancoDeMidiaService.name);
  private readonly cache = new Map<string, { em: number; valor: ResultadoDaBusca[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly assets: AssetsService,
  ) {}

  // ---------- Chaves ----------

  async chave(workspaceId: string, provider: 'pexels' | 'pixabay'): Promise<string | null> {
    const c = await this.prisma.stockCredential.findUnique({ where: { workspaceId_provider: { workspaceId, provider } } });
    return c ? this.crypto.decifrar({ encryptedKey: c.encryptedKey, iv: c.iv, authTag: c.authTag }) : null;
  }

  private async exigirChave(workspaceId: string, provider: 'pexels' | 'pixabay'): Promise<string> {
    const c = await this.chave(workspaceId, provider);
    if (!c) throw new BadRequestException(`cadastre a chave do ${provider === 'pexels' ? 'Pexels' : 'Pixabay'} em Configurações > Banco de mídia`);
    return c;
  }

  // ---------- Rede ----------

  private async json<T>(url: string, init: RequestInit, nome: string): Promise<T> {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r) throw new BadGatewayException(`o ${nome} não respondeu; tente de novo`);
    if (r.status === 401 || r.status === 403) throw new BadRequestException(`o ${nome} recusou a chave; confira em Configurações`);
    if (r.status === 400 && nome === 'Pixabay') throw new BadRequestException('o Pixabay recusou a chave; confira em Configurações');
    if (r.status === 404) throw new NotFoundException(`item não encontrado no ${nome}`);
    if (r.status === 429) throw new BadRequestException(`limite de buscas do ${nome} atingido; tente daqui a pouco`);
    if (!r.ok) throw new BadGatewayException(`o ${nome} respondeu ${r.status}`);
    return (await r.json()) as T;
  }

  /** Baixa com teto de tamanho (o content-length pode faltar ou mentir). */
  private async baixar(url: string, teto: number, nome: string): Promise<{ conteudo: Buffer; mime: string }> {
    const r = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(120_000), redirect: 'follow' }).catch(() => null);
    if (!r || !r.ok || !r.body) throw new BadGatewayException(`não foi possível baixar o arquivo do ${nome}`);
    if (!linkSeguro(r.url || url)) throw new BadGatewayException('o arquivo redirecionou para um endereço não permitido');
    const declarado = Number(r.headers.get('content-length') ?? 0);
    if (declarado > teto) throw new PayloadTooLargeException(`o arquivo tem ${Math.round(declarado / 1024 / 1024)} MB; o limite é ${Math.round(teto / 1024 / 1024)} MB`);
    const partes: Buffer[] = [];
    let total = 0;
    for await (const parte of r.body as unknown as AsyncIterable<Uint8Array>) {
      total += parte.byteLength;
      if (total > teto) throw new PayloadTooLargeException(`o arquivo passa do limite de ${Math.round(teto / 1024 / 1024)} MB`);
      partes.push(Buffer.from(parte));
    }
    return { conteudo: Buffer.concat(partes), mime: (r.headers.get('content-type') ?? '').split(';')[0]!.trim() };
  }

  // ---------- Busca ----------

  /**
   * Busca unificada: nas fontes do tipo (ou numa só), em paralelo. Uma
   * fonte que falha (sem chave, fora do ar) não derruba as outras: vira
   * aviso. Os resultados vêm intercalados (1º de cada fonte, 2º de cada...).
   */
  async buscar(tenant: TenantContext, pedido: { q: string; tipo: TipoDaBusca; fonte?: FonteDeMidia; pagina?: number }): Promise<ResultadoDaBuscaUnificada> {
    const fontes = pedido.fonte ? [pedido.fonte] : [...FONTES_DO_TIPO[pedido.tipo]];
    const avisos: string[] = [];
    const listas = await Promise.all(
      fontes.map((f) =>
        this.buscarNaFonte(tenant.workspaceId, f, pedido.tipo, pedido.q, pedido.pagina ?? 1).catch((e: unknown) => {
          avisos.push(e instanceof Error ? e.message : `a busca no ${f} falhou`);
          return [] as ResultadoDaBusca[];
        }),
      ),
    );
    const resultados: ResultadoDaBusca[] = [];
    for (let i = 0; listas.some((l) => i < l.length); i += 1) for (const l of listas) if (l[i]) resultados.push(l[i]!);
    return { resultados, avisos };
  }

  private async buscarNaFonte(workspaceId: string, fonte: FonteDeMidia, tipo: TipoDaBusca, q: string, pagina: number): Promise<ResultadoDaBusca[]> {
    const chaveDoCache = `${workspaceId}|${fonte}|${tipo}|${q.toLowerCase()}|${pagina}`;
    const guardado = this.cache.get(chaveDoCache);
    if (guardado && Date.now() - guardado.em < DIA) return guardado.valor;
    const valor = await this.buscarSemCache(workspaceId, fonte, tipo, q, pagina);
    if (this.cache.size > 800) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(chaveDoCache, { em: Date.now(), valor });
    return valor;
  }

  private async buscarSemCache(workspaceId: string, fonte: FonteDeMidia, tipo: TipoDaBusca, q: string, pagina: number): Promise<ResultadoDaBusca[]> {
    switch (fonte) {
      case 'pexels': {
        const chave = await this.exigirChave(workspaceId, 'pexels');
        const params = new URLSearchParams({ query: q, orientation: 'portrait', per_page: '18', page: String(pagina) });
        if (tipo === 'video') {
          const r = await this.json<{ videos: VideoDoPexels[] }>(`https://api.pexels.com/videos/search?${params}`, { headers: { Authorization: chave } }, 'Pexels');
          return r.videos.map(pexelsVideo);
        }
        const r = await this.json<{ photos: FotoDoPexels[] }>(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: chave } }, 'Pexels');
        return r.photos.map(pexelsFoto);
      }
      case 'pixabay': {
        const chave = await this.exigirChave(workspaceId, 'pixabay');
        const params = new URLSearchParams({ key: chave, q: q.slice(0, 100), per_page: '20', page: String(pagina), safesearch: 'true' });
        if (tipo === 'video') {
          const r = await this.json<{ hits: VideoDoPixabay[] }>(`https://pixabay.com/api/videos/?${params}`, {}, 'Pixabay');
          return r.hits.map(pixabayVideo).filter((x): x is ResultadoDaBusca => Boolean(x));
        }
        params.set('image_type', tipo === 'ilustracao' ? 'illustration' : 'photo');
        if (tipo === 'foto') params.set('orientation', 'vertical');
        const r = await this.json<{ hits: ImagemDoPixabay[] }>(`https://pixabay.com/api/?${params}`, {}, 'Pixabay');
        return r.hits.map((h) => pixabayImagem(h, tipo));
      }
      case 'openverse': {
        const params = new URLSearchParams({ q: q.slice(0, 100), license: LICENCAS_OPENVERSE.join(','), page_size: '20', page: String(pagina), mature: 'false' });
        params.set('category', tipo === 'ilustracao' ? 'illustration,digitized_artwork' : 'photograph');
        const r = await this.json<{ results: ImagemDoOpenverse[] }>(`https://api.openverse.org/v1/images/?${params}`, { headers: { 'User-Agent': AGENTE } }, 'Openverse');
        return r.results.map((i) => openverseImagem(i, tipo)).filter((x): x is ResultadoDaBusca => Boolean(x));
      }
      case 'iconify': {
        const buscar = async (prefixos?: string[]) => {
          const params = new URLSearchParams({ query: q.slice(0, 60), limit: '64' });
          if (prefixos) params.set('prefixes', prefixos.join(','));
          return this.json<{ icons: string[]; collections?: Record<string, ColecaoDoIconify> }>(`https://api.iconify.design/search?${params}`, {}, 'Iconify');
        };
        const preferidas = await buscar(tipo === 'logo' ? COLECOES_DE_LOGO : COLECOES_COLORIDAS);
        const gerais = preferidas.icons.length >= 12 ? { icons: [], collections: {} } : await buscar();
        const colecoes = { ...(gerais.collections ?? {}), ...(preferidas.collections ?? {}) };
        const ids = [...new Set([...preferidas.icons, ...gerais.icons])];
        return iconifyResultados(ids, colecoes, tipo).slice(0, 30);
      }
      case '3dicons':
      case 'fluent':
        return buscarIcones3d(q, fonte);
    }
  }

  // ---------- Importação ----------

  /** Traz o item para o workspace (asset) e devolve o asset com a medida da imagem. */
  async importar(tenant: TenantContext, pedido: ImportacaoDeMidia) {
    const { fonte, tipo, id } = pedido;
    const video = tipo === 'video';
    const kind = video ? 'VIDEO' : 'IMAGE';
    const teto = TAMANHO_MAXIMO[kind];

    let conteudo: Buffer;
    let mime: string;
    let nome: string;
    let licenca: ReturnType<typeof licencaDoAsset>;

    switch (fonte) {
      case 'pexels': {
        const chave = await this.exigirChave(tenant.workspaceId, 'pexels');
        const numero = Number(id);
        if (!Number.isInteger(numero) || numero <= 0) throw new BadRequestException('id inválido');
        let link: string;
        if (video) {
          const v = await this.json<VideoDoPexels>(`https://api.pexels.com/videos/videos/${numero}`, { headers: { Authorization: chave } }, 'Pexels');
          const arquivo = arquivoDoVideo(v);
          if (!arquivo) throw new BadGatewayException('este vídeo não tem um MP4 para baixar');
          link = arquivo.link;
          licenca = licencaDoAsset(LICENCA_PEXELS, v.user.name, v.url, 'Pexels');
        } else {
          const f = await this.json<FotoDoPexels>(`https://api.pexels.com/v1/photos/${numero}`, { headers: { Authorization: chave } }, 'Pexels');
          link = arquivoDaFoto(f);
          licenca = licencaDoAsset(LICENCA_PEXELS, f.photographer, f.url, 'Pexels');
        }
        if (!linkDoPexels(link)) throw new BadGatewayException('link de arquivo inesperado');
        ({ conteudo, mime } = await this.baixar(link, teto, 'Pexels'));
        nome = `pexels-${tipo}-${numero}.${video ? 'mp4' : 'jpg'}`;
        break;
      }
      case 'pixabay': {
        const chave = await this.exigirChave(tenant.workspaceId, 'pixabay');
        const params = new URLSearchParams({ key: chave, id: String(Number(id)) });
        let link: string;
        if (video) {
          const r = await this.json<{ hits: VideoDoPixabay[] }>(`https://pixabay.com/api/videos/?${params}`, {}, 'Pixabay');
          const v = r.hits[0];
          const arquivo = v ? arquivoDoVideoPixabay(v) : null;
          if (!v || !arquivo) throw new NotFoundException('vídeo não encontrado no Pixabay');
          link = arquivo.url;
          licenca = licencaDoAsset(LICENCA_PIXABAY, v.user, v.pageURL, 'Pixabay');
        } else {
          const r = await this.json<{ hits: ImagemDoPixabay[] }>(`https://pixabay.com/api/?${params}`, {}, 'Pixabay');
          const h = r.hits[0];
          if (!h) throw new NotFoundException('imagem não encontrada no Pixabay');
          link = h.largeImageURL;
          licenca = licencaDoAsset(LICENCA_PIXABAY, h.user, h.pageURL, 'Pixabay');
        }
        if (!/(^|\.)pixabay\.com$/.test(new URL(link).hostname)) throw new BadGatewayException('link de arquivo inesperado');
        ({ conteudo, mime } = await this.baixar(link, teto, 'Pixabay'));
        nome = `pixabay-${tipo}-${id}.${video ? 'mp4' : link.toLowerCase().includes('.png') ? 'png' : 'jpg'}`;
        break;
      }
      case 'openverse': {
        if (video) throw new BadRequestException('o Openverse não tem vídeos');
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException('id inválido');
        const i = await this.json<ImagemDoOpenverse>(`https://api.openverse.org/v1/images/${id}/`, { headers: { 'User-Agent': AGENTE } }, 'Openverse');
        const l = licencaDoOpenverse(i.license, i.license_version, i.license_url);
        if (!l) throw new BadRequestException('a licença desta imagem não permite uso comercial livre');
        if (!linkSeguro(i.url)) throw new BadGatewayException('link de arquivo não permitido');
        ({ conteudo, mime } = await this.baixar(i.url, teto, 'Openverse'));
        licenca = licencaDoAsset(l, i.creator ?? '', i.foreign_landing_url ?? '', 'Openverse');
        nome = `openverse-${id.slice(0, 8)}.${mime.includes('png') ? 'png' : 'jpg'}`;
        break;
      }
      case 'iconify': {
        if (video) throw new BadRequestException('ícones não são vídeo');
        if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(id)) throw new BadRequestException('id inválido');
        const prefixo = id.split(':')[0]!;
        const info = await this.json<Record<string, ColecaoDoIconify>>(`https://api.iconify.design/collections?prefixes=${prefixo}`, {}, 'Iconify');
        const colecao = info[prefixo];
        const l = licencaDaColecao(colecao);
        if (!l) throw new BadRequestException('a licença desta coleção de ícones não permite uso livre');
        const svg = await this.baixar(urlDoIconify(id, Boolean(colecao?.palette), 1024), 2 * 1024 * 1024, 'Iconify');
        // O vídeo não desenha SVG: vira PNG de 1024 px, com transparência.
        conteudo = await sharp(svg.conteudo, { density: 300 }).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        mime = 'image/png';
        licenca = licencaDoAsset(l, colecao?.name ?? prefixo, `https://icon-sets.iconify.design/${prefixo}/`, 'Iconify');
        nome = `icone-${id.replace(':', '-')}.png`;
        break;
      }
      case '3dicons':
      case 'fluent': {
        if (video) throw new BadRequestException('ícones não são vídeo');
        const a = arquivoDoIcone3d(fonte, id);
        if (!a) throw new NotFoundException('ícone não encontrado');
        ({ conteudo } = await this.baixar(a.url, teto, fonte === 'fluent' ? 'Fluent Emoji' : '3dicons'));
        // PNG transparente como veio (3dicons 400 px, Fluent 256 px), recomprimido.
        conteudo = await sharp(conteudo).png({ compressionLevel: 9 }).toBuffer();
        mime = 'image/png';
        licenca = fonte === 'fluent' ? licencaDoAsset(LICENCA_FLUENT, 'Microsoft', 'https://github.com/microsoft/fluentui-emoji', 'Fluent Emoji 3D') : licencaDoAsset(LICENCA_3DICONS, '3dicons', 'https://3dicons.co/', '3dicons');
        nome = `icone-3d-${a.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
        break;
      }
      default:
        throw new BadRequestException('fonte desconhecida');
    }

    const medida = video ? null : await sharp(conteudo).metadata().catch(() => null);
    const asset = await this.assets.enviar(tenant, {
      kind,
      originalName: nome.slice(0, 120),
      mimeDeclarado: mime || (video ? 'video/mp4' : 'image/jpeg'),
      conteudo,
      license: licenca,
    });
    this.log.log(`mídia importada de ${fonte} (${tipo}) para o workspace ${tenant.workspaceId}`);
    return {
      ...asset,
      largura: medida?.width ?? null,
      altura: medida?.height ?? null,
      transparente: Boolean(medida?.hasAlpha),
    };
  }
}
