/**
 * Abstracao de storage (secao 13).
 *
 * A aplicacao so conhece esta interface. Trocar MinIO por S3, R2 ou B2 e
 * questao de variavel de ambiente, sem tocar em servico nenhum.
 */
export interface ArquivoParaUpload {
  key: string;
  body: Buffer;
  contentType: string;
  /** Valor do Cache-Control gravado no objeto. */
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface StorageProvider {
  upload(arquivo: ArquivoParaUpload): Promise<{ key: string; url: string }>;
  delete(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** URL publica permanente. */
  getUrl(key: string): string;
  /** URL temporaria, para objetos privados. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  ensureBucket(): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
