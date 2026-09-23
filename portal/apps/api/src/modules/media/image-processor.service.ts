import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import {
  IMAGE_PRESET_DEFINITIONS,
  MEDIA_VARIANT_WIDTHS,
  type ImagePreset,
  type MediaVariantType,
} from '@makucho/types';
import type { AppConfig } from '../../config/configuration';

export interface AreaRecorte {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VarianteGerada {
  type: MediaVariantType;
  format: string;
  width: number;
  height: number;
  size: number;
  buffer: Buffer;
}

export interface ResultadoProcessamento {
  /** Arquivo principal, ja recortado e otimizado. */
  principal: VarianteGerada;
  variantes: VarianteGerada[];
  largura: number;
  altura: number;
  checksum: string;
  corDominante: string;
  blurDataUrl: string;
}

/**
 * Esteira de imagens (secao 14).
 *
 * Etapas: valida o conteudo real do arquivo, corrige orientacao EXIF,
 * remove metadata, aplica o recorte do cropper, redimensiona e gera as
 * variantes em WebP/AVIF/JPEG.
 */
@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger('ImageProcessor');

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    // A VPS tem 2 vCPUs e pouca RAM livre. Sem limitar, o Sharp abre uma
    // thread por core e varios uploads simultaneos competem por memoria.
    sharp.concurrency(2);
    sharp.cache({ memory: 64, files: 0, items: 50 });
  }

  private get opcoes() {
    return this.config.get('upload', { infer: true });
  }

  // ============================================================
  // VALIDACAO
  // ============================================================

  /**
   * Confere o conteudo real do arquivo, nao a extensao nem o Content-Type.
   *
   * O navegador pode declarar qualquer mimetype; so o Sharp conseguir
   * decodificar prova que ha uma imagem ali. Isso barra um .php renomeado
   * para .jpg e o "polyglot" que e imagem valida e script ao mesmo tempo.
   */
  async validarImagem(
    buffer: Buffer,
    mimeDeclarado: string,
  ): Promise<{ formato: string; largura: number; altura: number }> {
    const { allowedMimeTypes, maxFileSizeBytes } = this.opcoes;

    if (buffer.length === 0) {
      throw new BadRequestException({
        code: 'UPLOAD_EMPTY_FILE',
        message: 'O arquivo está vazio',
      });
    }

    if (buffer.length > maxFileSizeBytes) {
      const mb = Math.round(maxFileSizeBytes / 1024 / 1024);
      throw new BadRequestException({
        code: 'UPLOAD_FILE_TOO_LARGE',
        message: `O arquivo excede o limite de ${mb} MB`,
      });
    }

    if (!allowedMimeTypes.includes(mimeDeclarado.toLowerCase())) {
      throw new BadRequestException({
        code: 'UPLOAD_INVALID_TYPE',
        message: 'Formato não permitido. Envie JPEG, PNG, WebP, AVIF ou GIF.',
      });
    }

    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(buffer, { failOn: 'error' }).metadata();
    } catch {
      throw new BadRequestException({
        code: 'UPLOAD_CORRUPT_IMAGE',
        message: 'O arquivo não é uma imagem válida',
      });
    }

    const formatosAceitos = ['jpeg', 'png', 'webp', 'avif', 'gif'];
    if (!metadata.format || !formatosAceitos.includes(metadata.format)) {
      throw new BadRequestException({
        code: 'UPLOAD_INVALID_TYPE',
        message: 'Formato de imagem não suportado',
      });
    }

    if (!metadata.width || !metadata.height) {
      throw new BadRequestException({
        code: 'UPLOAD_INVALID_IMAGE',
        message: 'Não foi possível ler as dimensões da imagem',
      });
    }

    // Uma imagem de 30000x30000 tem poucos KB comprimida mas estoura a
    // memoria ao ser descomprimida (decompression bomb).
    const MAX_DIMENSAO = 12000;
    const MAX_PIXELS = 60_000_000;
    if (
      metadata.width > MAX_DIMENSAO ||
      metadata.height > MAX_DIMENSAO ||
      metadata.width * metadata.height > MAX_PIXELS
    ) {
      throw new BadRequestException({
        code: 'UPLOAD_IMAGE_TOO_LARGE',
        message: 'A imagem tem resolução excessiva. Reduza antes de enviar.',
      });
    }

    return { formato: metadata.format, largura: metadata.width, altura: metadata.height };
  }

  // ============================================================
  // PROCESSAMENTO
  // ============================================================

  async processar(params: {
    buffer: Buffer;
    mimeType: string;
    preset: ImagePreset;
    crop?: AreaRecorte | null;
  }): Promise<ResultadoProcessamento> {
    const { buffer, mimeType, preset, crop } = params;

    await this.validarImagem(buffer, mimeType);

    // rotate() sem argumento aplica a orientacao do EXIF. Sem isso, foto de
    // celular aparece deitada no site.
    let pipeline = sharp(buffer, { failOn: 'error' }).rotate();

    if (crop) {
      // Dimensoes ja com a rotacao do EXIF aplicada (orientacao >= 5 gira 90°).
      const meta = await sharp(buffer).metadata();
      const girada = (meta.orientation ?? 1) >= 5;
      const largura = (girada ? meta.height : meta.width) ?? 0;
      const altura = (girada ? meta.width : meta.height) ?? 0;
      pipeline = this.aplicarRecorte(pipeline, crop, largura, altura);
    }

    const definicao = IMAGE_PRESET_DEFINITIONS[preset];
    if (preset !== 'FREEFORM' && definicao.width > 0) {
      pipeline = pipeline.resize(definicao.width, definicao.height, {
        // "cover" preenche a area sem distorcer, cortando o excesso.
        fit: 'cover',
        position: 'attention',
        withoutEnlargement: false,
      });
    } else {
      // Sem preset, limita a 2400px: acima disso nao ha ganho visual
      // no site e o arquivo fica pesado.
      pipeline = pipeline.resize(2400, undefined, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    const baseBuffer = await pipeline.toBuffer();
    const baseMeta = await sharp(baseBuffer).metadata();
    const largura = baseMeta.width ?? 0;
    const altura = baseMeta.height ?? 0;

    const principal = await this.gerarVariante(baseBuffer, 'ORIGINAL', 'webp', largura);

    const variantes: VarianteGerada[] = [];
    for (const [tipo, larguraAlvo] of Object.entries(MEDIA_VARIANT_WIDTHS)) {
      // Nao geramos variante maior que a imagem: so aumentaria o peso.
      if (larguraAlvo >= largura && tipo !== 'THUMBNAIL') continue;

      variantes.push(
        await this.gerarVariante(baseBuffer, tipo as MediaVariantType, 'webp', larguraAlvo),
      );

      if (this.opcoes.generateAvif && (tipo === 'LARGE' || tipo === 'MEDIUM')) {
        // AVIF comprime melhor que WebP mas custa CPU; geramos so nos
        // tamanhos que aparecem grandes na tela.
        variantes.push(
          await this.gerarVariante(baseBuffer, tipo as MediaVariantType, 'avif', larguraAlvo),
        );
      }
    }

    // Sem JPEG: o site so serve WebP/AVIF (suporte universal nos
    // navegadores atuais) e o storage guarda apenas formatos otimizados.

    const [corDominante, blurDataUrl] = await Promise.all([
      this.extrairCorDominante(baseBuffer),
      this.gerarPlaceholder(baseBuffer),
    ]);

    return {
      principal,
      variantes,
      largura,
      altura,
      // Identifica o RESULTADO, nao so o arquivo: a mesma foto com outro
      // recorte/formato gera outras chaves no storage. Antes, as variantes
      // pequenas colidiam e uma sobrescrevia a outra.
      checksum: createHash('sha256')
        .update(buffer)
        .update(`|${preset}|${crop ? `${Math.round(crop.x)},${Math.round(crop.y)},${Math.round(crop.width)},${Math.round(crop.height)}` : 'sem-recorte'}`)
        .digest('hex'),
      corDominante,
      blurDataUrl,
    };
  }

  private aplicarRecorte(
    pipeline: sharp.Sharp,
    crop: AreaRecorte,
    larguraImagem: number,
    alturaImagem: number,
  ): sharp.Sharp {
    // O cropper envia numeros fracionarios; extract() exige inteiros e
    // recusa areas que passem da borda. Arredondar pode estourar 1px, entao
    // limitamos a area a imagem.
    const left = Math.min(Math.max(0, Math.round(crop.x)), Math.max(0, larguraImagem - 1));
    const top = Math.min(Math.max(0, Math.round(crop.y)), Math.max(0, alturaImagem - 1));
    return pipeline.extract({
      left,
      top,
      width: Math.max(1, Math.min(Math.round(crop.width), larguraImagem - left)),
      height: Math.max(1, Math.min(Math.round(crop.height), alturaImagem - top)),
    });
  }

  private async gerarVariante(
    base: Buffer,
    type: MediaVariantType,
    format: 'webp' | 'avif' | 'jpeg',
    larguraAlvo: number,
  ): Promise<VarianteGerada> {
    const { webpQuality, avifQuality, jpegQuality } = this.opcoes;

    let p = sharp(base).resize(larguraAlvo, undefined, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    switch (format) {
      case 'webp':
        p = p.webp({ quality: webpQuality, effort: 4 });
        break;
      case 'avif':
        // effort 4 equilibra tamanho e tempo; acima disso o upload demora
        // demais numa VPS de 2 vCPUs.
        p = p.avif({ quality: avifQuality, effort: 4 });
        break;
      case 'jpeg':
        p = p.jpeg({ quality: jpegQuality, progressive: true, mozjpeg: true });
        break;
    }

    // Nao chamar withMetadata() e o que descarta EXIF, GPS e perfil da
    // camera. Chama-lo PRESERVA a metadata, inclusive as coordenadas de
    // onde a foto foi tirada; a orientacao ja foi aplicada pelo rotate().
    const { data, info } = await p.toBuffer({ resolveWithObject: true });

    return {
      type,
      format,
      width: info.width,
      height: info.height,
      size: info.size,
      buffer: data,
    };
  }

  /** Cor media da imagem, usada como fundo enquanto ela carrega. */
  private async extrairCorDominante(buffer: Buffer): Promise<string> {
    try {
      const { dominant } = await sharp(buffer).stats();
      const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
      return `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`;
    } catch {
      // Azul da marca como reserva.
      return '#0A1A3C';
    }
  }

  /** Miniatura embutida em base64, exibida borrada antes da imagem real. */
  private async gerarPlaceholder(buffer: Buffer): Promise<string> {
    try {
      const mini = await sharp(buffer)
        .resize(16, undefined, { fit: 'inside' })
        .webp({ quality: 40 })
        .toBuffer();
      return `data:image/webp;base64,${mini.toString('base64')}`;
    } catch {
      return '';
    }
  }

  /** Nome do objeto no bucket. O hash evita colisao e permite cache eterno. */
  montarChave(params: {
    checksum: string;
    type: MediaVariantType;
    format: string;
    largura: number;
  }): string {
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const id = params.checksum.slice(0, 16);
    const sufixo = params.type === 'ORIGINAL' ? 'full' : params.type.toLowerCase();
    return `${ano}/${mes}/${id}-${sufixo}-${params.largura}.${params.format}`;
  }
}
