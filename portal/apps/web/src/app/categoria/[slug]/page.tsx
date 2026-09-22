import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { paginaDaUrl } from '@/lib/paginacao';
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
    const categorias = await api.categorias();
    const cat = categorias.find((c) => c.slug === slug);
    if (!cat) return { title: 'Editoria não encontrada' };

    return {
      title: cat.name,
      description: cat.description ?? undefined,
      alternates: { canonical: `/categoria/${cat.slug}` },
    };
  } catch {
    return { title: 'Editoria' };
  }
}

export default async function PaginaCategoria({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page } = await searchParams;
  const pagina = paginaDaUrl(page);

  const categorias = await api.categorias();
  const categoria = categorias.find((c) => c.slug === slug);

  if (!categoria) notFound();

  let resultado;
  try {
    resultado = await api.posts({ categorySlug: slug, page: pagina, perPage: 12 });
  } catch (erro) {
    if (erro instanceof ApiError && erro.status === 404) notFound();
    throw erro;
  }

  return (
    <Moldura>
      <header className="cabecalho-pagina">
        <h1>{categoria.name}</h1>
        {categoria.description && <p>{categoria.description}</p>}
        <p>{resultado.meta.total} artigo(s) publicado(s)</p>
      </header>

      <Listagem
        resultado={resultado}
        base={`/categoria/${slug}`}
        vazio={`Ainda não há artigos publicados em ${categoria.name}.`}
      />
    </Moldura>
  );
}
