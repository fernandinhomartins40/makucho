import { Module } from '@nestjs/common';
import { EditPlansController } from './edit-plans.controller';
import { EditPlansService } from './edit-plans.service';

@Module({
  controllers: [EditPlansController],
  providers: [EditPlansService],
  exports: [EditPlansService],
})
export class EditPlansModule {}
