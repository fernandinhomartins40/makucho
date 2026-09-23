import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ApiError, api, urlDaImagem } from '@/lib/api';
import { paginaDaUrl } from '@/lib/paginacao';
import { Moldura } from '@/components/moldura';
import { Listagem } from '@/components/listagem';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const autor = await api.autor(slug);
    return {
      title: autor.name,
      description: autor.bio ?? `Artigos de ${autor.name} no MAKUCHO.`,
      alternates: { canonical: `/autor/${autor.slug}` },
    };
  } catch {
    return { title: 'Autor' };
  }
}

export default async function PaginaAutor({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page } = await searchParams;
  const pagina = paginaDaUrl(page);

  let autor;
  try {
    autor = await api.autor(slug);
  } catch (erro) {
    if (erro instanceof ApiError && erro.status === 404) notFound();
    throw erro;
  }

  const resultado = await api.posts({ authorId: autor.id, page: pagina, perPage: 12 });
  const avatar = urlDaImagem(autor.avatar, 'THUMBNAIL');

  return (
    <Moldura>
      <header className="cabecalho-pagina cabecalho-autor">
        <span className="hub-avatar hub-avatar-grande" aria-hidden="true">
          <Image
            src={avatar ?? '/brand/makucho-symbol-white.webp'}
            alt=""
            width={84}
            height={84}
            className={avatar ? 'hub-avatar-foto' : undefined}
          />
        </span>
        <div>
          <span className="hub-eyebrow">Autor</span>
          <h1>{autor.name}</h1>
          {autor.role && <p className="cabecalho-pagina-total">{autor.role}</p>}
          {autor.bio && <p>{autor.bio}</p>}
        </div>
      </header>

      <Listagem
        resultado={resultado}
        base={`/autor/${slug}`}
        vazio={`${autor.name} ainda não assina artigos publicados.`}
      />
    </Moldura>
  );
}
