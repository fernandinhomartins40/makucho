import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { paginaDaUrl } from '@/lib/paginacao';
import { Moldura } from '@/components/moldura';
import { CabecalhoPagina } from '@/components/hub';
import { Listagem } from '@/components/listagem';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Análises e conteúdos',
  description: 'Todas as análises, notícias e artigos publicados no MAKUCHO.',
  alternates: { canonical: '/conteudos' },
};

type Props = { searchParams: Promise<{ page?: string }> };

/** Lista de tudo o que foi publicado: destino de "Ver todos" e de "Análises". */
export default async function PaginaConteudos({ searchParams }: Props) {
  const { page } = await searchParams;
  const resultado = await api.posts({ page: paginaDaUrl(page), perPage: 12 });

  return (
    <Moldura>
      <CabecalhoPagina rotulo="Análises" titulo="Tudo o que publicamos">
        <p>Análises, notícias e artigos sobre economia, mercado e finanças, do mais recente ao mais antigo.</p>
        <p className="cabecalho-pagina-total">{resultado.meta.total} publicação(ões)</p>
      </CabecalhoPagina>

      <Listagem resultado={resultado} base="/conteudos" vazio="Ainda não há publicações." />
    </Moldura>
  );
}
