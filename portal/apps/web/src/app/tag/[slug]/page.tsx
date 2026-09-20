import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { Moldura } from '@/components/moldura';
import { Listagem } from '@/components/listagem';

export const dynamic = 'force-dynamic';
export const revalidate = 120;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const tag = await api.tag(slug);
    return {
      title: `#${tag.name}`,
      description: `Artigos sobre ${tag.name} no MAKUCHO.`,
      alternates: { canonical: `/tag/${tag.slug}` },
    };
  } catch {
    return { title: 'Assunto' };
  }
}

export default async function PaginaTag({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page } = await searchParams;
  const pagina = Math.max(1, Number(page) || 1);

  let tag;
  try {
    tag = await api.tag(slug);
  } catch (erro) {
    if (erro instanceof ApiError && erro.status === 404) notFound();
    throw erro;
  }

  const resultado = await api.posts({ tagSlug: slug, page: pagina, perPage: 12 });

  return (
    <Moldura>
      <header className="cabecalho-pagina">
        <h1>#{tag.name}</h1>
        <p>{resultado.meta.total} artigo(s) sobre este assunto</p>
      </header>

      <Listagem
        resultado={resultado}
        base={`/tag/${slug}`}
        vazio={`Ainda não há artigos marcados com ${tag.name}.`}
      />
    </Moldura>
  );
}
