import assert from 'node:assert/strict';
import { PostsService } from '../src/modules/posts/posts.service';

async function executar() {
  let gravacoes = 0;
  const service = new PostsService(
    { post: {
      findFirst: async () => ({ id: 'artigo', createdById: 'autor', status: 'DRAFT', title: 'Artigo', publishedAt: null }),
      create: async () => { gravacoes++; return {}; },
      update: async () => { gravacoes++; return {}; },
    } } as never,
    {} as never,
    {} as never,
  );
  const autor = { id: 'autor', role: 'AUTHOR' as const };
  const editor = { id: 'editor', role: 'EDITOR' as const };
  const futuro = new Date(Date.now() + 86_400_000);

  await assert.rejects(() => service.criar({ title: 'Novo artigo', status: 'SCHEDULED', scheduledFor: futuro }, autor, {} as never));
  await assert.rejects(() => service.atualizar('artigo', { status: 'SCHEDULED', scheduledFor: futuro }, autor, {} as never));
  await assert.rejects(() => service.atualizar('artigo', { status: 'SCHEDULED' }, editor, {} as never));
  await assert.rejects(() => service.atualizar('artigo', { status: 'SCHEDULED', scheduledFor: new Date(Date.now() - 60_000) }, editor, {} as never));
  assert.equal(gravacoes, 0);
  const agendado = new PostsService(
    { post: { findFirst: async () => ({ id: 'artigo', createdById: 'autor', status: 'SCHEDULED', title: 'Artigo', publishedAt: null }) } } as never,
    {} as never,
    {} as never,
  );
  await assert.rejects(() => agendado.atualizar('artigo', { scheduledFor: futuro }, autor, {} as never));
  console.log('6 regras de publicação/agendamento passaram');
}

executar().catch((erro: unknown) => {
  console.error(erro);
  process.exitCode = 1;
});
