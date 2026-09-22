import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import type { AppConfig } from '../../config/configuration';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { ImageProcessorService } from './image-processor.service';

@Module({
  imports: [MulterModule.registerAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService<AppConfig, true>) => ({
      limits: { fileSize: config.get('upload', { infer: true }).maxFileSizeBytes },
    }),
  })],
  controllers: [MediaController],
  providers: [MediaService, ImageProcessorService],
  exports: [MediaService, ImageProcessorService],
})
export class MediaModule {}
