import assert from 'node:assert/strict';
import { AdsService } from '../src/modules/ads/ads.service';

async function executar() {
  const inicio = new Date('2026-09-22T12:00:00.000Z');
  const fim = new Date('2026-09-23T12:00:00.000Z');
  let atualizacoes = 0;
  let filtroExibicao: Record<string, unknown> = {};
  const service = new AdsService(
    { advertisement: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        filtroExibicao = where;
        return [];
      },
      findFirst: async () => ({ id: 'ad', status: 'DRAFT', mediaId: null, startsAt: inicio, endsAt: fim }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        atualizacoes += 1;
        return {
          id: 'ad', name: 'Campanha', advertiser: null, media: { id: 'midia' }, mobileMediaId: null,
          targetUrl: 'https://example.com', alt: 'Campanha', openInNewTab: true,
          linkRel: 'sponsored', status: data.status ?? 'DRAFT', device: 'ALL', priority: 0,
          widthPx: null, heightPx: null, placements: [], startsAt: inicio, endsAt: data.endsAt ?? fim,
          impressions: 0, clicks: 0,
        };
      },
    } } as never,
    { registrar: async () => undefined } as never,
    { paraDto: (midia: unknown) => midia } as never,
    {} as never,
  );

  await assert.rejects(() => service.criar({ status: 'ACTIVE', mediaId: null, placements: ['HOME_MIDDLE'] }, 'editor', {} as never));
  await assert.rejects(() => service.atualizar('ad', { startsAt: new Date('2026-09-24T12:00:00.000Z') }, 'editor', {} as never));
  await assert.rejects(() => service.atualizar('ad', { status: 'ACTIVE' }, 'editor', {} as never));
  assert.equal(atualizacoes, 0);

  const atualizado = await service.atualizar('ad', {
    status: 'ACTIVE', mediaId: 'midia', endsAt: new Date('2026-09-24T12:00:00.000Z'),
  }, 'editor', {} as never);
  assert.equal(atualizado.status, 'ACTIVE');
  assert.equal(atualizacoes, 1);

  await service.paraExibicao('HOME_MIDDLE');
  assert.deepEqual(filtroExibicao.mediaId, { not: null });

  console.log('5 regras de veiculação passaram');
}

executar().catch((erro: unknown) => {
  console.error(erro);
  process.exitCode = 1;
});
