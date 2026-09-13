import { Global, Module } from '@nestjs/common';
import { S3StorageService } from './s3-storage.service';
import { STORAGE_PROVIDER } from './storage.provider';

/**
 * Todos os providers sao S3-compativeis (MinIO, S3, R2, B2), entao uma
 * implementacao atende os quatro. O token permite trocar sem tocar nos
 * servicos que consomem.
 */
@Global()
@Module({
  providers: [S3StorageService, { provide: STORAGE_PROVIDER, useExisting: S3StorageService }],
  exports: [STORAGE_PROVIDER, S3StorageService],
})
export class StorageModule {}
