import { Module } from '@nestjs/common';
import { BrandController } from './brand.controller';
import { BrandService } from './brand.service';
import { CommunicationController } from '../communication/communication.controller';

@Module({
  controllers: [BrandController, CommunicationController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}
