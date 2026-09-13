import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppConfig } from '../../config/configuration';
import type { ArquivoParaUpload, StorageProvider } from './storage.provider';

/**
 * Implementacao S3-compativel: atende MinIO, AWS S3, Cloudflare R2 e
 * Backblaze B2, que falam o mesmo protocolo.
 */
@Injectable()
export class S3StorageService implements StorageProvider, OnModuleInit {
  private readonly logger = new Logger('Storage');
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const storage = this.config.get('storage', { infer: true });
    this.bucket = storage.bucket;
    this.publicUrl = storage.publicUrl;

    this.client = new S3Client({
      region: storage.region,
      endpoint: storage.endpoint,
      // MinIO usa caminho (host/bucket/objeto); a AWS usa subdominio.
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKey,
        secretAccessKey: storage.secretKey,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (erro) {
      // Nao derruba a API: o portal continua servindo conteudo mesmo se o
      // storage estiver fora; so o upload de imagem falha.
      this.logger.error(
        `Storage indisponivel na subida: ${erro instanceof Error ? erro.message : erro}`,
      );
    }
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" acessível`);
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" criado`);
    }
  }

  async upload(arquivo: ArquivoParaUpload): Promise<{ key: string; url: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: arquivo.key,
        Body: arquivo.body,
        ContentType: arquivo.contentType,
        // Os nomes carregam hash do conteudo, entao o arquivo nunca muda:
        // cache longo e seguro e economiza banda.
        CacheControl: arquivo.cacheControl ?? 'public, max-age=31536000, immutable',
        Metadata: arquivo.metadata,
      }),
    );

    return { key: arquivo.key, url: this.getUrl(arquivo.key) };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    // A API aceita no maximo 1000 objetos por chamada.
    for (let i = 0; i < keys.length; i += 1000) {
      const lote = keys.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: lote.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  getUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
