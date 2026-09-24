// ============================================================
// PWA — o Studio como aplicativo instalável (Android e iOS).
//
// Uma imagem enviada vira tudo o que cada plataforma exige, porque
// cada uma lê um arquivo diferente:
//
//   - Android/Chrome lê o MANIFESTO: ícones 192 e 512 ("any") e os
//     MASCARÁVEIS (o sistema recorta em círculo, gota ou quadrado, então
//     o desenho precisa de margem: 80% central);
//   - iOS IGNORA os ícones do manifesto e usa o `apple-touch-icon` de
//     180 px, sem transparência (transparente vira preto) e sem cantos
//     arredondados (o iOS aplica a máscara);
//   - iOS mostra tela branca ao abrir sem `apple-touch-startup-image`
//     no tamanho exato de cada aparelho: essas telas são geradas sob
//     demanda e guardadas;
//   - Android mostra a instalação "rica" (descrição + carrossel) só
//     quando o manifesto traz `screenshots` do formato do aparelho.
//
// Tudo é gerado uma vez por versão e guardado em `pwa/v{versão}/`: o
// manifesto e os ícones saem do disco, sem reprocessar imagem a cada
// requisição. Mudar qualquer coisa sobe a versão, e a URL nova força os
// navegadores a buscarem de novo.
// ============================================================

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage.service';

export interface CapturaDoPwa {
  key: string;
  formFactor: 'narrow' | 'wide';
  width: number;
  height: number;
  label: string;
}

/** Os ícones gerados, pelo nome público. */
export const ICONES = {
  'icon-192.png': { tamanho: 192, tipo: 'any' },
  'icon-512.png': { tamanho: 512, tipo: 'any' },
  'maskable-192.png': { tamanho: 192, tipo: 'maskable' },
  'maskable-512.png': { tamanho: 512, tipo: 'maskable' },
  'apple-touch-icon.png': { tamanho: 180, tipo: 'apple' },
  'favicon-32.png': { tamanho: 32, tipo: 'any' },
  'favicon-16.png': { tamanho: 16, tipo: 'any' },
} as const;

export type NomeDoIcone = keyof typeof ICONES;

const COR = /^#[0-9a-fA-F]{6}$/;

/**
 * O ícone padrão, quando ninguém enviou um: o "M" da marca sobre o
 * degradê azul. Desenhado em caminho, e não em texto: a imagem da API
 * não tem fontes instaladas, e um <text> sairia vazio.
 */
const ICONE_PADRAO = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#2F66FF"/><stop offset="1" stop-color="#41C8FF"/>
  </linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <path fill="#fff" d="M262 752V272h128l122 196 122-196h128v480H646V478L536 648h-48L378 478v274z"/>
</svg>`);

@Injectable()
export class PwaService {
  private readonly log = new Logger(PwaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async config() {
    return this.prisma.pwaConfig.upsert({ where: { id: 'padrao' }, create: { id: 'padrao' }, update: {} });
  }

  private pasta(versao: number) {
    return `pwa/v${versao}`;
  }

  // ---------- Manifesto ----------

  async manifesto() {
    const c = await this.config();
    const v = `?v=${c.version}`;
    const capturas = (c.screenshots as unknown as CapturaDoPwa[]) ?? [];

    return {
      // `id` estável: o Chrome identifica o app instalado por ele, e mudar
      // a start_url sem `id` faria o app instalado virar "outro app".
      id: '/',
      name: c.name,
      short_name: c.shortName,
      description: c.description,
      lang: 'pt-BR',
      dir: 'ltr',
      start_url: '/?origem=app',
      scope: '/',
      display: 'standalone',
      display_override: ['window-controls-overlay', 'standalone'],
      // `any`, e não `portrait`: no tablet o editor é melhor deitado.
      orientation: 'any',
      background_color: c.backgroundColor,
      theme_color: c.themeColor,
      categories: ['productivity', 'photo', 'video'],
      prefer_related_applications: false,
      icons: [
        { src: `/api/pwa/icone/icon-192.png${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `/api/pwa/icone/icon-512.png${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `/api/pwa/icone/maskable-192.png${v}`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: `/api/pwa/icone/maskable-512.png${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      screenshots: capturas.map((s, i) => ({
        src: `/api/pwa/captura/${i}${v}`,
        sizes: `${s.width}x${s.height}`,
        type: 'image/png',
        form_factor: s.formFactor,
        label: s.label,
      })),
      shortcuts: [
        { name: 'Novo vídeo', short_name: 'Novo', url: '/gravar?origem=atalho', icons: [{ src: `/api/pwa/icone/icon-192.png${v}`, sizes: '192x192' }] },
        { name: 'Projetos', url: '/?origem=atalho' },
        { name: 'Roteiros', url: '/roteiros?origem=atalho' },
      ],
    };
  }

  // ---------- Ícones ----------

  /** O caminho do ícone, gerando a versão atual se ainda não existe. */
  async icone(nome: string): Promise<string> {
    if (!(nome in ICONES)) throw new NotFoundException('ícone não encontrado');
    const c = await this.config();
    const chave = `${this.pasta(c.version)}/${nome}`;
    if ((await this.storage.tamanho(chave)) === null) await this.gerarIcones(c);
    return this.storage.caminho(chave);
  }

  private async fonte(chave: string | null): Promise<Buffer> {
    if (!chave) return sharp(ICONE_PADRAO).png().toBuffer();
    const { readFile } = await import('node:fs/promises');
    return readFile(this.storage.caminho(chave));
  }

  /** Gera todos os tamanhos da versão atual. */
  private async gerarIcones(c: Awaited<ReturnType<PwaService['config']>>) {
    const principal = await this.fonte(c.iconKey);
    const fundo = c.backgroundColor;
    // Sem mascarável própria: um ícone OPACO de borda a borda (como o
    // padrão, ou uma arte quadrada cheia) já é mascarável -- o Android
    // recorta a borda, e emoldurá-lo criaria "um ícone dentro de outro".
    // Só o ícone com transparência ganha a margem com a cor de fundo.
    const estatisticas = await sharp(principal).stats();
    const opaco = estatisticas.isOpaque;
    const mascaravel = c.maskableKey ? await this.fonte(c.maskableKey) : opaco ? principal : null;

    for (const [nome, { tamanho, tipo }] of Object.entries(ICONES)) {
      let imagem: Buffer;
      if (tipo === 'any') {
        imagem = await sharp(principal).resize(tamanho, tamanho, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      } else if (tipo === 'apple') {
        // Sem transparência (vira preto no iOS) e sangrando até a borda:
        // o iOS aplica os cantos.
        imagem = await sharp(principal).resize(tamanho, tamanho, { fit: 'cover' }).flatten({ background: fundo }).png().toBuffer();
      } else if (mascaravel) {
        imagem = await sharp(mascaravel).resize(tamanho, tamanho, { fit: 'cover' }).flatten({ background: fundo }).png().toBuffer();
      } else {
        // Sem mascarável própria: o ícone em 72% do quadro, centralizado
        // sobre a cor de fundo -- dentro da zona segura de 80% que o
        // Android garante em qualquer formato de máscara.
        const interno = Math.round(tamanho * 0.72);
        const desenho = await sharp(principal).resize(interno, interno, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        imagem = await sharp({ create: { width: tamanho, height: tamanho, channels: 4, background: fundo } })
          .composite([{ input: desenho, gravity: 'center' }])
          .png()
          .toBuffer();
      }
      await this.storage.gravar(`${this.pasta(c.version)}/${nome}`, imagem);
    }
    this.log.log(`ícones do app gerados (versão ${c.version})`);
  }

  // ---------- Telas de abertura do iOS ----------

  /**
   * A tela que o iOS mostra enquanto o app abre, no tamanho EXATO do
   * aparelho (em pixels físicos): o ícone no centro, sobre a cor de
   * fundo. Gerada no primeiro pedido e guardada.
   */
  async telaDeAbertura(largura: number, altura: number): Promise<string> {
    if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura < 300 || altura < 300 || largura > 3000 || altura > 3000) {
      throw new NotFoundException('tamanho de tela inválido');
    }
    const c = await this.config();
    const chave = `${this.pasta(c.version)}/splash-${largura}x${altura}.png`;
    if ((await this.storage.tamanho(chave)) === null) {
      const lado = Math.round(Math.min(largura, altura) * 0.28);
      const desenho = await sharp(await this.fonte(c.iconKey)).resize(lado, lado, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      const imagem = await sharp({ create: { width: largura, height: altura, channels: 3, background: c.backgroundColor } })
        .composite([{ input: desenho, gravity: 'center' }])
        .png({ compressionLevel: 9 })
        .toBuffer();
      await this.storage.gravar(chave, imagem);
    }
    return this.storage.caminho(chave);
  }

  // ---------- Capturas ----------

  async captura(indice: number): Promise<string> {
    const c = await this.config();
    const lista = (c.screenshots as unknown as CapturaDoPwa[]) ?? [];
    const alvo = lista[indice];
    if (!alvo) throw new NotFoundException('captura não encontrada');
    return this.storage.caminho(alvo.key);
  }

  // ---------- Edição ----------

  async atualizar(dados: { name?: string; shortName?: string; description?: string; themeColor?: string; backgroundColor?: string }) {
    for (const cor of [dados.themeColor, dados.backgroundColor]) {
      if (cor !== undefined && !COR.test(cor)) throw new BadRequestException('use cores em hexadecimal, ex.: #06132d');
    }
    const atual = await this.config();
    return this.prisma.pwaConfig.update({
      where: { id: 'padrao' },
      data: {
        ...dados,
        // Cor de fundo entra nos ícones e nas telas de abertura: nova versão.
        version: atual.version + 1,
      },
    });
  }

  /**
   * Recebe o ícone (ou o mascarável). Confere que é imagem quadrada o
   * bastante: um ícone pequeno esticado para 512 sai borrado no Android.
   */
  async enviarIcone(tipo: 'icone' | 'maskable', conteudo: Buffer) {
    const meta = await sharp(conteudo).metadata().catch(() => null);
    if (!meta?.width || !meta.height || !['png', 'jpeg', 'webp', 'svg'].includes(meta.format ?? '')) {
      throw new BadRequestException('envie uma imagem PNG, JPG, WebP ou SVG');
    }
    if (meta.format !== 'svg' && Math.min(meta.width, meta.height) < 512) {
      throw new BadRequestException(`a imagem tem ${meta.width}×${meta.height}; o mínimo é 512×512 para sair nítida no Android`);
    }
    if (Math.abs(meta.width - meta.height) > Math.max(meta.width, meta.height) * 0.02) {
      throw new BadRequestException('o ícone precisa ser quadrado');
    }

    const atual = await this.config();
    const versao = atual.version + 1;
    // Normaliza para PNG 1024: a fonte de todos os tamanhos.
    const png = await sharp(conteudo, { density: 300 }).resize(1024, 1024, { fit: 'cover' }).png().toBuffer();
    const chave = `pwa/fonte/${tipo}-v${versao}.png`;
    await this.storage.gravar(chave, png);

    return this.prisma.pwaConfig.update({
      where: { id: 'padrao' },
      data: { ...(tipo === 'icone' ? { iconKey: chave } : { maskableKey: chave }), version: versao },
    });
  }

  async removerIcone(tipo: 'icone' | 'maskable') {
    const atual = await this.config();
    return this.prisma.pwaConfig.update({
      where: { id: 'padrao' },
      data: { ...(tipo === 'icone' ? { iconKey: null } : { maskableKey: null }), version: atual.version + 1 },
    });
  }

  async enviarCaptura(conteudo: Buffer, formFactor: 'narrow' | 'wide', rotulo: string) {
    const meta = await sharp(conteudo).metadata().catch(() => null);
    if (!meta?.width || !meta.height) throw new BadRequestException('envie uma imagem PNG, JPG ou WebP');
    // Regras do Chrome para a instalação rica: lado entre 320 e 3840 px,
    // proporção de no máximo 2,3:1.
    const maior = Math.max(meta.width, meta.height);
    const menor = Math.min(meta.width, meta.height);
    if (menor < 320 || maior > 3840 || maior / menor > 2.3) {
      throw new BadRequestException('a captura precisa ter lados entre 320 e 3840 px e proporção de até 2,3:1');
    }
    const atual = await this.config();
    const lista = ((atual.screenshots as unknown as CapturaDoPwa[]) ?? []).slice(0, 7);
    const chave = `pwa/capturas/${Date.now().toString(36)}.png`;
    await this.storage.gravar(chave, await sharp(conteudo).png().toBuffer());
    lista.push({ key: chave, formFactor, width: meta.width, height: meta.height, label: rotulo.slice(0, 80) || 'MAKUCHO Studio' });
    return this.prisma.pwaConfig.update({
      where: { id: 'padrao' },
      data: { screenshots: lista as unknown as object, version: atual.version + 1 },
    });
  }

  async removerCaptura(indice: number) {
    const atual = await this.config();
    const lista = ((atual.screenshots as unknown as CapturaDoPwa[]) ?? []).filter((_, i) => i !== indice);
    return this.prisma.pwaConfig.update({
      where: { id: 'padrao' },
      data: { screenshots: lista as unknown as object, version: atual.version + 1 },
    });
  }
}
