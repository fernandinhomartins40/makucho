import assert from 'node:assert/strict';
import { PostsService } from '../src/modules/posts/posts.service';
import { VideosService } from '../src/modules/videos/videos.service';

const post = (id: string) => ({
  id,
  title: id,
  slug: id,
  subtitle: null,
  excerpt: null,
  status: 'PUBLISHED',
  readingTimeMinutes: 1,
  coverImage: null,
  thumbnail: null,
  category: { id: 'c', name: 'Economia', slug: 'economia', color: null },
  author: null,
  videoPlatform: null,
  videoUrl: null,
  isFeatured: false,
  isTrending: false,
  viewCount: 0,
  publishedAt: null,
});

async function executar() {
  let filtroPosts: Record<string, unknown> = {};
  const posts = new PostsService(
    { post: { findMany: async ({ where }: { where: Record<string, unknown> }) => {
      filtroPosts = where;
      return [post('a'), post('b')];
    } } } as never,
    {} as never,
    {} as never,
  );
  const selecionados = await posts.listarPorIds(['b', 'a', 'removido']);
  assert.deepEqual(selecionados.map((item) => item.id), ['b', 'a']);
  assert.equal(filtroPosts.status, 'PUBLISHED');
  assert.equal(filtroPosts.deletedAt, null);
  assert.ok(filtroPosts.publishedAt && typeof filtroPosts.publishedAt === 'object');

  let filtroVideo: Record<string, unknown> = {};
  const videos = new VideosService(
    { video: { findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      filtroVideo = where;
      return null;
    } } } as never,
    {} as never,
    {} as never,
  );
  await assert.rejects(() => videos.buscarPublicadoPorId('rascunho'));
  assert.equal(filtroVideo.isPublished, true);
  assert.equal(filtroVideo.deletedAt, null);
  assert.ok(Array.isArray(filtroVideo.OR));
  await assert.rejects(() => videos.buscarPorSlug('agendado'));
  assert.equal(filtroVideo.slug, 'agendado');
  assert.ok(Array.isArray(filtroVideo.OR));

  const rascunho = videos.paraDto({
    id: 'rascunho', title: 'Rascunho', slug: 'rascunho', description: null,
    platform: 'YOUTUBE', url: 'https://www.youtube.com/watch?v=abc', embedId: 'abc',
    durationSeconds: null, thumbnail: null, category: null, post: null,
    isFeatured: false, isPublished: false, viewCount: 0, publishedAt: null,
  });
  assert.equal(rascunho.isPublished, false);

  let dadosCriacao: Record<string, unknown> = {};
  const videosComPersistencia = new VideosService(
    { video: {
      findMany: async () => [],
      findFirst: async () => ({ url: 'https://www.youtube.com/watch?v=abc', platform: 'YOUTUBE', isPublished: false }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        dadosCriacao = data;
        return { ...rascunho, ...data, id: 'novo', thumbnail: null, category: null, post: null, viewCount: 0 };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        ...rascunho, ...data, thumbnail: null, category: null, post: null, viewCount: 0,
      }),
    } } as never,
    { registrar: async () => undefined } as never,
    {} as never,
  );
  const criado = await videosComPersistencia.criar({
    title: 'Vídeo novo', platform: 'YOUTUBE', url: 'https://www.youtube.com/watch?v=abc',
    isPublished: false,
  }, 'editor', {} as never);
  assert.equal(dadosCriacao.publishedAt, null);
  assert.equal(criado.isPublished, false);

  const publicado = await videosComPersistencia.atualizar('novo', { isPublished: true }, 'editor', {} as never);
  assert.equal(publicado.isPublished, true);
  assert.ok(publicado.publishedAt);

  console.log('6 verificações de publicação/seleção passaram');
}

executar().catch((erro: unknown) => {
  console.error(erro);
  process.exitCode = 1;
});
