// ============================================================
// `POST /projects/:id/analyze` — as chamadas #3 e #5 da seção 26.
//
// Controller próprio, sem prefixo, porque a rota vive sob
// `/projects` e o de configurações vive sob `/settings`. Forçar as
// duas no mesmo lugar faria uma delas nascer com caminho errado.
// ============================================================

import { BadRequestException, Body, Controller, Param, Post } from '@nestjs/common';
import { CHAVES_DOS_ESTILOS_DE_ANIMACAO, coresDaPaleta } from '@makucho/studio-contracts';
import { z } from 'zod';
import { ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma.service';
import { assertCanWrite, assertOwnership } from '../../common/tenant';
import type { TenantContext } from '../../common/tenant';
import { AnimacoesDaFalaService, NOTA_REFAZENDO } from './animacoes-da-fala.service';
import { PropostaService } from './proposta.service';

/** A nota enquanto as animações são criadas (a tela espera ela mudar). */
const NOTA_CRIANDO = 'Criando as animações…';

/** Refazer animações no editor: quais (ou todas) e o que muda. */
const pedidoDeRefazerSchema = z
  .object({
    camadas: z.array(z.string().max(80)).max(30).optional(),
    estilo: z.string().refine((e) => CHAVES_DOS_ESTILOS_DE_ANIMACAO.includes(e), 'estilo desconhecido').optional(),
    layout: z.enum(['meio_a_meio', 'cartao', 'tela_cheia', 'pip']).optional(),
    canto: z.enum(['sup-esq', 'sup-dir', 'inf-esq', 'inf-dir']).optional(),
    lado: z.enum(['cima', 'baixo']).optional(),
    pedido: z.string().trim().min(2).max(600).optional(),
    paleta: z.string().refine((p) => p === '' || coresDaPaleta(p) !== null, 'paleta desconhecida').optional(),
  })
  .strict()
  .refine((p) => p.estilo || p.layout || p.lado || p.canto || p.pedido || p.paleta !== undefined, 'diga o que mudar (estilo, lugar ou pedido)');

@ApiTags('ai')
@Controller()
export class AnaliseController {
  constructor(
    private readonly proposta: PropostaService,
    private readonly prisma: PrismaService,
    private readonly animacoesDaFala: AnimacoesDaFalaService,
  ) {}

  /** Projetos com animações sendo criadas agora (um pedido por vez). */
  private readonly animando = new Set<string>();

  /**
   * As animações da fala sob demanda -- a mesma etapa do fim da montagem,
   * para um projeto que já está no editor. Leva minutos: roda em segundo
   * plano, e a tela acompanha pela nota do projeto (`animationNote`).
   */
  @Post('projects/:id/animar-fala')
  async animarFala(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);
    const projeto = await this.prisma.project.findUnique({ where: { id } });
    assertOwnership(tenant, projeto, 'projeto');
    if (!projeto) throw new BadRequestException('projeto não encontrado');
    if (this.animando.has(id)) return { ok: true, nota: NOTA_CRIANDO };

    this.animando.add(id);
    await this.prisma.project.update({ where: { id }, data: { animationNote: NOTA_CRIANDO } });
    void this.animacoesDaFala
      .criarNaMontagem(tenant, id)
      .catch(() => undefined)
      .finally(() => this.animando.delete(id));
    return { ok: true, nota: NOTA_CRIANDO };
  }

  /**
   * Refaz animações que já estão no vídeo (uma, várias ou todas): outro
   * estilo, outro lugar ou um pedido ("troca o azul pelo verde"). A IA
   * mantém o que cada uma explica. Em segundo plano, como a de cima.
   */
  @Post('projects/:id/animacoes-da-fala/refazer')
  async refazerAnimacoes(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() corpo: unknown) {
    assertCanWrite(tenant);
    const projeto = await this.prisma.project.findUnique({ where: { id } });
    assertOwnership(tenant, projeto, 'projeto');
    if (!projeto) throw new BadRequestException('projeto não encontrado');
    const p = pedidoDeRefazerSchema.safeParse(corpo);
    if (!p.success) throw new BadRequestException(p.error.issues[0]?.message ?? 'pedido inválido');
    if (this.animando.has(id)) return { ok: true, nota: NOTA_REFAZENDO };

    this.animando.add(id);
    await this.prisma.project.update({ where: { id }, data: { animationNote: NOTA_REFAZENDO } });
    const { camadas, ...opcoes } = p.data;
    void this.animacoesDaFala
      .refazerNoProjeto(tenant, id, camadas?.length ? camadas : 'todas', opcoes)
      .catch(() => undefined)
      .finally(() => this.animando.delete(id));
    return { ok: true, nota: NOTA_REFAZENDO };
  }

  /**
   * Síncrona, e não por fila, por uma razão concreta: a requisição
   * leva dezenas de segundos e o usuário está olhando a tela
   * esperando o resultado. Uma fila acrescentaria polling e um estado
   * intermediário para economizar um tempo que ninguém ganharia — ele
   * esperaria igual, só sem saber o que está acontecendo.
   */
  @Post('projects/:id/analyze')
  async analisar(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    assertCanWrite(tenant);

    const projeto = await this.prisma.project.findUnique({ where: { id } });
    assertOwnership(tenant, projeto, 'projeto');
    if (!projeto) throw new BadRequestException('projeto não encontrado');

    const resultado = await this.proposta.gerar(tenant.workspaceId, id, { animacoesEmSegundoPlano: true });

    if (!resultado.ok) {
      // Um projeto que ja tem proposta continua com ela: a falha de uma
      // NOVA analise nao pode tirar do usuario o que ele ja editou.
      if (!['PROPOSAL_READY', 'USER_EDITING', 'READY_TO_RENDER', 'COMPLETED'].includes(projeto.state)) {
        await this.prisma.project
          .update({ where: { id }, data: { state: 'FAILED_RETRYABLE', publicError: resultado.erro ?? null } })
          .catch(() => undefined);
      }
      throw new BadRequestException(resultado.erro ?? 'a análise falhou');
    }

    return {
      ok: true,
      origem: resultado.origem,
      confianca: resultado.confianca,
      avisos: resultado.avisos,
      problemas: resultado.problemas,
    };
  }
}
