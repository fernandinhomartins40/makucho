import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { ImageProcessorService } from './image-processor.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, ImageProcessorService],
  exports: [MediaService, ImageProcessorService],
})
export class MediaModule {}
