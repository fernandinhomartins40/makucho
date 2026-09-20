import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { atualizarMidiaSchema, paginacaoSchema } from '@makucho/validation';
import type { ImagePreset } from '@makucho/types';
import { MediaService } from './media.service';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Roles, type RequestUser } from '../../common/decorators';

@ApiTags('Mídia')
@Controller('media')
// AUTHOR tambem envia imagem: precisa ilustrar o proprio artigo.
@Roles('AUTHOR')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Enviar imagem com recorte e geração de variantes' })
  // O limite real e validado no service; aqui evitamos bufferizar arquivo
  // gigante so para recusar depois.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async enviar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() corpo: Record<string, string>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'UPLOAD_NO_FILE',
        message: 'Nenhum arquivo enviado',
      });
    }

    // O multipart entrega tudo como texto; o recorte vem em JSON.
    let crop = null;
    if (corpo.crop) {
      try {
        crop = JSON.parse(corpo.crop);
      } catch {
        throw new BadRequestException({
          code: 'UPLOAD_INVALID_CROP',
          message: 'Área de recorte inválida',
        });
      }
    }

    return this.media.enviar({
      buffer: file.buffer,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      preset: (corpo.preset as ImagePreset) ?? 'FREEFORM',
      crop,
      alt: corpo.alt ?? null,
      caption: corpo.caption ?? null,
      credit: corpo.credit ?? null,
      title: corpo.title ?? null,
      userId: user.id,
      request: req,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Listar a biblioteca de mídia' })
  async listar(@Query() query: Record<string, string>) {
    const { page, perPage, search } = paginacaoSchema.parse(query);
    return this.media.listar({
      page,
      perPage,
      search,
      preset: query.preset as ImagePreset | undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes de uma imagem' })
  async buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.media.buscarPorId(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar alt, legenda e crédito' })
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(atualizarMidiaSchema)) dados: Record<string, string | null>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.media.atualizarMetadados(id, dados, user.id, req);
  }

  @Delete(':id')
  @Roles('EDITOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir imagem' })
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.media.excluir(id, user.id, req);
  }
}
