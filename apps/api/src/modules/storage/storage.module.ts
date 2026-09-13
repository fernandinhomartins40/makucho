import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiskStorageService } from './disk-storage.service';
import { S3StorageService } from './s3-storage.service';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.provider';
import type { AppConfig } from '../../config/configuration';

/**
 * O provedor sai de STORAGE_PROVIDER.
 *
 * O padrao e "disk": guarda no volume e deixa o nginx servir. Um portal
 * editorial lida com imagens ja otimizadas, volume que um diretorio
 * atende — e dispensa manter um servidor de objetos consumindo memoria
 * na VPS. Os demais valores usam a implementacao S3, que atende MinIO,
 * S3, R2 e B2 com o mesmo codigo.
 */
@Global()
@Module({
  providers: [
    DiskStorageService,
    S3StorageService,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, DiskStorageService, S3StorageService],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        disco: DiskStorageService,
        s3: S3StorageService,
      ): StorageProvider => {
        const provider = config.get('storage', { infer: true }).provider;
        Logger.log(`Armazenamento: ${provider}`, 'Storage');
        return provider === 'disk' ? disco : s3;
      },
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
