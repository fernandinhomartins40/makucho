import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { paginacaoSchema } from '@makucho/validation';
import { AuditService } from './audit.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../../common/decorators';

@ApiTags('Auditoria')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Trilha de auditoria' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'resource', required: false })
  async listar(
    @Query(zodPipe(paginacaoSchema)) paginacao: { page: number; perPage: number },
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
  ) {
    return this.audit.listar({
      page: paginacao.page,
      perPage: paginacao.perPage,
      userId,
      action,
      resource,
    });
  }
}
