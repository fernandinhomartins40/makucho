// ============================================================
// Créditos de IA de dentro do Studio (FusAI, "Créditos da sua conta").
//
// Com a chave da FusAI cadastrada nas Configurações, a IA do Studio sai
// do saldo pré-pago da organização do dono na FusAI. Aqui ele vê o saldo
// e coloca créditos com Pix sem sair do Studio: o servidor fala com a
// FusAI com a MESMA chave da IA (cifrada no banco, nunca vai para a
// tela) -- a tela só fala com estas rotas, protegidas pelo login.
//
// Rotas da FusAI: GET /v1/balance, GET /v1/topup-options, POST /v1/topups
// (gera o Pix) e GET /v1/topups/:id (status; RECEIVED = o saldo já
// entrou). O Pix vale 60 min e vai de R$ 5 a R$ 10.000.
// ============================================================

import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CryptoService } from '../../common/crypto.service';
import { PrismaService } from '../../common/prisma.service';
import { URL_DA_FUSAI, mensagemDaFusai } from './fusai.provedor';

export interface SituacaoDosCreditos {
  /** A IA do workspace usa a FusAI? Sem ela não há créditos para mostrar. */
  usaFusai: boolean;
  /** Saldo disponível, em micro-reais (texto: sem arredondamento). */
  saldoMicros?: string;
  minimoCentavos?: number;
  maximoCentavos?: number;
  /** A taxa da recarga, em % (o Pix cobra; o crédito é o valor menos a taxa). */
  taxaPct?: number;
  /** A recarga está liberada (a organização tem CPF/CNPJ cadastrado). */
  recargaDisponivel?: boolean;
  /** O que a IA gastou neste mês, em micro-reais (o cobrado pela FusAI, exato). */
  gastoDoMesMicros?: string;
  chamadasDoMes?: number;
  erro?: string;
}

export interface Recarga {
  id: string;
  status: string;
  valorCentavos: number;
  creditoMicros?: string;
  copiaECola?: string;
  qrBase64?: string;
  urlDePagamento?: string;
  expiraEm?: string;
}

@Injectable()
export class CreditosDeIaService {
  private readonly log = new Logger(CreditosDeIaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async situacao(workspaceId: string): Promise<SituacaoDosCreditos> {
    const chave = await this.chaveDaFusai(workspaceId);
    if (!chave) return { usaFusai: false };
    try {
      // O mês corrente (UTC, como o período do Studio), do dia 1º até agora.
      const inicioDoMes = `${new Date().toISOString().slice(0, 7)}-01`;
      const [saldo, opcoes, uso] = await Promise.all([
        this.pedir<{ available_micros?: string }>(chave, '/balance'),
        this.pedir<{ minAmountCents?: number; maxAmountCents?: number; feePct?: number | string; available?: boolean }>(chave, '/topup-options').catch(() => null),
        this.pedir<{ total?: { requests?: number; charged_micros?: string } }>(chave, `/usage?from=${inicioDoMes}`).catch(() => null),
      ]);
      return {
        usaFusai: true,
        saldoMicros: String(saldo.available_micros ?? '0'),
        ...(uso?.total ? { gastoDoMesMicros: String(uso.total.charged_micros ?? '0'), chamadasDoMes: Number(uso.total.requests ?? 0) } : {}),
        minimoCentavos: opcoes?.minAmountCents ?? 500,
        maximoCentavos: opcoes?.maxAmountCents ?? 1_000_000,
        taxaPct: Number(opcoes?.feePct ?? 0) || 0,
        recargaDisponivel: opcoes?.available ?? true,
      };
    } catch (e) {
      return { usaFusai: true, erro: e instanceof Error ? e.message : 'não foi possível ler o saldo na FusAI.' };
    }
  }

  async recarregar(workspaceId: string, valorCentavos: number): Promise<Recarga> {
    const chave = await this.chaveDaFusai(workspaceId);
    if (!chave) throw new BadRequestException('A IA deste workspace não usa a FusAI: cadastre a chave da FusAI em Configurações → IA.');
    if (!Number.isInteger(valorCentavos) || valorCentavos < 500 || valorCentavos > 1_000_000) {
      throw new BadRequestException('A recarga vai de R$ 5,00 a R$ 10.000,00.');
    }
    const r = await this.pedir<Record<string, unknown>>(chave, '/topups', {
      method: 'POST',
      // A mesma recarga não vira duas se a requisição for repetida.
      headers: { 'Idempotency-Key': `studio-${workspaceId}-${randomUUID()}` },
      body: JSON.stringify({ amountCents: valorCentavos }),
    });
    this.log.log(`recarga de IA (FusAI) de R$ ${(valorCentavos / 100).toFixed(2)} gerada no workspace ${workspaceId}`);
    return recargaDe(r);
  }

  async recarga(workspaceId: string, id: string): Promise<Recarga> {
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(id)) throw new BadRequestException('recarga inválida');
    const chave = await this.chaveDaFusai(workspaceId);
    if (!chave) throw new BadRequestException('A IA deste workspace não usa a FusAI.');
    return recargaDe(await this.pedir<Record<string, unknown>>(chave, `/topups/${encodeURIComponent(id)}`));
  }

  /** A chave da FusAI do workspace (decifrada só agora, só no servidor), ou null. */
  private async chaveDaFusai(workspaceId: string): Promise<string | null> {
    const c = await this.prisma.aiCredential.findUnique({ where: { workspaceId } });
    if (!c || !c.isActive || c.provider !== 'fusai') return null;
    return this.crypto.decifrar({ encryptedKey: c.encryptedKey, iv: c.iv, authTag: c.authTag });
  }

  private async pedir<T>(chave: string, caminho: string, init: RequestInit = {}): Promise<T> {
    let resposta: Response;
    try {
      resposta = await fetch(`${URL_DA_FUSAI}${caminho}`, {
        ...init,
        headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      this.log.warn(`FusAI ${caminho} sem resposta: ${(e as Error).message}`);
      throw new BadGatewayException('Não foi possível falar com a FusAI agora. Tente de novo em instantes.');
    }
    const texto = await resposta.text().catch(() => '');
    if (!resposta.ok) {
      let codigo = '';
      let detalhe = '';
      try {
        const lido = JSON.parse(texto) as { error?: { code?: string; message?: string } };
        codigo = lido.error?.code ?? '';
        detalhe = (lido.error?.message ?? '').slice(0, 200);
      } catch {
        // Sem corpo legível.
      }
      this.log.warn(`FusAI ${caminho} respondeu ${resposta.status} ${codigo}: ${detalhe}`);
      // O que a pessoa pode resolver (CPF/CNPJ, escopo, chave) vai como veio.
      const publico = codigo === 'insufficient_scope'
        ? 'A chave da FusAI não tem permissão para ver o saldo ou gerar recargas (escopos billing:read e checkout). Crie uma chave nova no painel da FusAI.'
        : detalhe && resposta.status < 500
          ? `FusAI: ${detalhe}`
          : mensagemDaFusai(resposta.status, codigo, detalhe);
      throw resposta.status < 500 ? new BadRequestException(publico) : new BadGatewayException(publico);
    }
    try {
      return JSON.parse(texto) as T;
    } catch {
      throw new BadGatewayException('A FusAI devolveu uma resposta ilegível.');
    }
  }
}

function recargaDe(r: Record<string, unknown>): Recarga {
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    id: String(r.checkoutId ?? r.id ?? ''),
    status: String(r.status ?? 'PENDING'),
    valorCentavos: Number(r.amountCents ?? 0),
    ...(texto(r.creditMicros) ? { creditoMicros: texto(r.creditMicros) } : {}),
    ...(texto(r.copyPaste) ? { copiaECola: texto(r.copyPaste) } : {}),
    ...(texto(r.qrBase64) ? { qrBase64: texto(r.qrBase64) } : {}),
    ...(texto(r.hostedUrl) ? { urlDePagamento: texto(r.hostedUrl) } : {}),
    ...(texto(r.expiresAt) ? { expiraEm: texto(r.expiresAt) } : {}),
  };
}
