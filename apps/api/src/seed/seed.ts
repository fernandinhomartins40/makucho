import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request } from 'express';

import { AppModule } from '../app.module';
import { PrismaService } from '../modules/prisma/prisma.service';
import { MediaService } from '../modules/media/media.service';
import { CategoriesService } from '../modules/categories/categories.service';
import { TagsService } from '../modules/tags/tags.service';
import { AuthorsService } from '../modules/authors/authors.service';
import { PostsService } from '../modules/posts/posts.service';
import { VideosService } from '../modules/videos/videos.service';
import { MarketService } from '../modules/market/market.service';
import { SettingsService } from '../modules/settings/settings.service';
import { AuthService } from '../modules/auth/auth.service';
import { gerarImagemPlaceholder } from './placeholder';
import {
  AUTORES,
  CATEGORIAS,
  CONFIGURACOES,
  INDICADORES,
  PAUTAS,
  REDES_SOCIAIS,
  SECOES_HOME,
  TAGS,
  VIDEOS,
} from './conteudo';

/**
 * Popula o portal com conteudo realista (secao 42).
 *
 * Roda dentro do contexto do Nest e usa os proprios services da aplicacao:
 * as imagens entram pelo mesmo pipeline Sharp do upload do CMS, com recorte,
 * variantes e envio ao bucket. Um seed que escrevesse direto no banco
 * deixaria de exercitar justamente a parte mais fragil do sistema.
 *
 * E idempotente: reexecutar nao duplica nada.
 */

const logger = new Logger('Seed');

/** O service exige um Request para a auditoria; no seed nao ha um. */
const requisicaoFicticia = {
  headers: { 'user-agent': 'makucho-seed' },
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
} as unknown as Request;

/** Documento TipTap a partir dos parágrafos da pauta. */
function montarDocumento(pauta: (typeof PAUTAS)[number]) {
  const conteudo: unknown[] = [];

  pauta.paragrafos.forEach((texto, i) => {
    // O intertitulo entra antes do ultimo paragrafo, como na diagramacao.
    if (pauta.intertitulo && i === pauta.paragrafos.length - 1) {
      conteudo.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: pauta.intertitulo }],
      });
    }
    conteudo.push({ type: 'paragraph', content: [{ type: 'text', text: texto }] });
  });

  return { type: 'doc', content: conteudo };
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const media = app.get(MediaService);
  const categories = app.get(CategoriesService);
  const tags = app.get(TagsService);
  const authors = app.get(AuthorsService);
  const posts = app.get(PostsService);
  const videos = app.get(VideosService);
  const market = app.get(MarketService);
  const settings = app.get(SettingsService);
  const auth = app.get(AuthService);

  try {
    // ---------- administrador ----------
    const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@makucho.com.br';
    const senha = process.env.SEED_ADMIN_PASSWORD;

    if (!senha) {
      throw new Error('Defina SEED_ADMIN_PASSWORD antes de rodar o seed');
    }

    const admin = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: process.env.SEED_ADMIN_NAME ?? 'Administrador MAKUCHO',
        role: 'SUPER_ADMIN',
        passwordHash: await auth.gerarHashSenha(senha),
        // Senha definida por variavel de ambiente e conhecida por quem
        // instalou: obrigamos a troca no primeiro acesso.
        mustChangePassword: true,
      },
    });
    logger.log(`Administrador: ${admin.email}`);

    const usuario = { id: admin.id, role: 'SUPER_ADMIN' as const };

    // ---------- configurações e redes ----------
    await settings.atualizar(
      CONFIGURACOES.map((c) => ({ key: c.key, value: c.value })),
      admin.id,
      requisicaoFicticia,
    );
    // O upsert do service nao carrega rotulo e grupo; completamos aqui para
    // que a tela de configuracoes saiba onde exibir cada chave.
    for (const c of CONFIGURACOES) {
      await prisma.siteSetting.update({
        where: { key: c.key },
        data: { group: c.group, label: c.label },
      });
    }
    logger.log(`${CONFIGURACOES.length} configurações gravadas`);

    for (const rede of REDES_SOCIAIS) {
      await settings.salvarRedeSocial(rede as never, admin.id, requisicaoFicticia);
    }
    logger.log(`${REDES_SOCIAIS.length} perfis sociais`);

    // ---------- ticker ----------
    for (const [i, indicador] of INDICADORES.entries()) {
      await market.salvar({ ...indicador, position: i, isActive: true }, admin.id, requisicaoFicticia);
    }
    logger.log(`${INDICADORES.length} indicadores de mercado`);

    // ---------- categorias ----------
    const categoriaPorNome = new Map<string, string>();
    for (const [i, cat] of CATEGORIAS.entries()) {
      const existente = await prisma.category.findFirst({
        where: { name: cat.nome, deletedAt: null },
        select: { id: true },
      });

      if (existente) {
        categoriaPorNome.set(cat.nome, existente.id);
        continue;
      }

      // Capa da editoria, gerada e processada pelo pipeline real.
      const capa = await media.enviar({
        buffer: await gerarImagemPlaceholder({
          largura: 1600,
          altura: 900,
          titulo: cat.nome,
          etiqueta: 'Editoria',
          semTexto: true,
        }),
        originalFilename: `categoria-${cat.nome}.jpg`,
        mimeType: 'image/jpeg',
        preset: 'CATEGORY',
        alt: `Capa da editoria ${cat.nome}`,
        userId: admin.id,
        request: requisicaoFicticia,
      });

      const criada = await categories.criar(
        {
          name: cat.nome,
          description: cat.descricao,
          color: cat.cor,
          icon: cat.icone,
          coverMediaId: capa.id,
          position: i,
          showInMenu: true,
          showInHomepage: true,
          isActive: true,
        },
        admin.id,
        requisicaoFicticia,
      );
      categoriaPorNome.set(cat.nome, criada.id);
    }
    logger.log(`${categoriaPorNome.size} editorias`);

    // ---------- tags ----------
    const tagPorNome = new Map<string, string>();
    for (const nome of TAGS) {
      const existente = await prisma.tag.findFirst({ where: { name: nome }, select: { id: true } });
      if (existente) {
        tagPorNome.set(nome, existente.id);
        continue;
      }
      const criada = await tags.criar({ name: nome }, admin.id, requisicaoFicticia);
      tagPorNome.set(nome, criada.id);
    }
    logger.log(`${tagPorNome.size} tags`);

    // ---------- autores ----------
    const autorPorNome = new Map<string, string>();
    for (const autor of AUTORES) {
      const existente = await prisma.author.findFirst({
        where: { name: autor.nome, deletedAt: null },
        select: { id: true },
      });
      if (existente) {
        autorPorNome.set(autor.nome, existente.id);
        continue;
      }

      const avatar = await media.enviar({
        buffer: await gerarImagemPlaceholder({
          largura: 512,
          altura: 512,
          titulo: autor.nome,
          semTexto: true,
        }),
        originalFilename: `autor-${autor.nome}.jpg`,
        mimeType: 'image/jpeg',
        preset: 'AVATAR',
        alt: `Foto de ${autor.nome}`,
        userId: admin.id,
        request: requisicaoFicticia,
      });

      const criado = await authors.criar(
        {
          name: autor.nome,
          role: autor.funcao,
          bio: autor.bio,
          avatarMediaId: avatar.id,
          instagram: autor.instagram ?? null,
          linkedin: autor.linkedin ?? null,
          twitter: autor.twitter ?? null,
          isActive: true,
        },
        admin.id,
        requisicaoFicticia,
      );
      autorPorNome.set(autor.nome, criado.id);
    }
    logger.log(`${autorPorNome.size} autores`);

    // ---------- artigos ----------
    const idsAutores = [...autorPorNome.values()];
    let criados = 0;

    for (const [i, pauta] of PAUTAS.entries()) {
      const existente = await prisma.post.findFirst({
        where: { title: pauta.titulo, deletedAt: null },
        select: { id: true },
      });
      if (existente) continue;

      const capa = await media.enviar({
        buffer: await gerarImagemPlaceholder({
          largura: 1600,
          altura: 900,
          titulo: pauta.titulo,
          etiqueta: pauta.categoria,
        }),
        originalFilename: `artigo-${i}.jpg`,
        mimeType: 'image/jpeg',
        preset: 'HERO',
        alt: pauta.titulo,
        credit: 'Arte MAKUCHO',
        userId: admin.id,
        request: requisicaoFicticia,
      });

      await posts.criar(
        {
          title: pauta.titulo,
          subtitle: pauta.subtitulo ?? null,
          content: montarDocumento(pauta),
          categoryId: categoriaPorNome.get(pauta.categoria),
          authorId: idsAutores[i % idsAutores.length],
          coverImageId: capa.id,
          tagIds: pauta.tags.map((t) => tagPorNome.get(t)).filter(Boolean),
          status: 'PUBLISHED',
          publishedAt: new Date(Date.now() - pauta.diasAtras * 86400000),
          isFeatured: pauta.destaque ?? false,
          isTrending: pauta.emAlta ?? false,
          isPinned: pauta.fixado ?? false,
          // O card do layout traz um botao "Assistir no <plataforma>";
          // ele depende destes dois campos no artigo.
          videoPlatform: pauta.plataformaVideo ?? null,
          videoUrl: pauta.urlVideo ?? null,
        },
        usuario,
        requisicaoFicticia,
      );
      criados += 1;
    }
    logger.log(`${criados} artigos publicados`);

    // ---------- vídeos ----------
    let videosCriados = 0;
    for (const [i, video] of VIDEOS.entries()) {
      const existente = await prisma.video.findFirst({
        where: { title: video.titulo, deletedAt: null },
        select: { id: true },
      });
      if (existente) continue;

      const capa = await media.enviar({
        buffer: await gerarImagemPlaceholder({
          largura: 1280,
          altura: 720,
          titulo: video.titulo,
          etiqueta: video.plataforma,
        }),
        originalFilename: `video-${i}.jpg`,
        mimeType: 'image/jpeg',
        preset: 'VIDEO_THUMBNAIL',
        alt: video.titulo,
        userId: admin.id,
        request: requisicaoFicticia,
      });

      await videos.criar(
        {
          title: video.titulo,
          platform: video.plataforma,
          url: video.url,
          durationSeconds: video.duracao,
          categoryId: categoriaPorNome.get(video.categoria),
          thumbnailId: capa.id,
          isPublished: true,
          isFeatured: video.destaque ?? false,
          position: i,
        },
        admin.id,
        requisicaoFicticia,
      );
      videosCriados += 1;
    }
    logger.log(`${videosCriados} vídeos`);

    // ---------- home ----------
    const jaTemSecoes = await prisma.homepageSection.count();
    if (jaTemSecoes === 0) {
      for (const secao of SECOES_HOME) {
        await prisma.homepageSection.create({
          data: {
            type: secao.type,
            title: secao.title,
            subtitle: 'subtitle' in secao ? (secao.subtitle as string) : null,
            position: secao.position,
            isVisible: true,
            config: secao.config as never,
          },
        });
      }
      logger.log(`${SECOES_HOME.length} seções da home`);
    } else {
      logger.log('Home já configurada; seções preservadas');
    }

    logger.log('Seed concluído');
  } finally {
    await app.close();
  }
}

main().catch((erro) => {
  logger.error(erro instanceof Error ? erro.message : String(erro));
  if (erro instanceof Error && erro.stack) logger.error(erro.stack);
  process.exit(1);
});
