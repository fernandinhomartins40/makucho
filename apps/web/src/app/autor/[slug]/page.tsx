import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ApiError, api, urlDaImagem } from '@/lib/api';
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
  const pagina = Math.max(1, Number(page) || 1);

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
      <header style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 28 }}>
        {avatar && (
          <Image
            src={avatar}
            alt={autor.name}
            width={84}
            height={84}
            style={{ borderRadius: '50%', objectFit: 'cover' }}
          />
        )}
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{autor.name}</h1>
          {autor.role && <p style={{ color: 'var(--texto-suave)' }}>{autor.role}</p>}
          {autor.bio && (
            <p style={{ marginTop: 6, maxWidth: '60ch', color: 'var(--texto-suave)' }}>
              {autor.bio}
            </p>
          )}
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
