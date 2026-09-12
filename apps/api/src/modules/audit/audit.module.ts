import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** Global: quase todo modulo registra alguma acao. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
