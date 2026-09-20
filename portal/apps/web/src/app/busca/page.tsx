import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { Moldura } from '@/components/moldura';
import { Listagem } from '@/components/listagem';

// Resultado de busca nunca se cacheia: o termo muda a cada visita.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Busca',
  // Paginas de resultado nao devem entrar no indice: geram infinitas
  // URLs sem conteudo proprio.
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export default async function PaginaBusca({ searchParams }: Props) {
  const { q, page } = await searchParams;
  const termo = (q ?? '').trim();
  const pagina = Math.max(1, Number(page) || 1);

  if (termo.length < 2) {
    return (
      <Moldura>
        <header className="cabecalho-pagina">
          <h1>Busca</h1>
        </header>
        <p className="vazio">Digite ao menos dois caracteres para buscar.</p>
      </Moldura>
    );
  }

  const resultado = await api.busca(termo, pagina).catch(() => null);

  if (!resultado) {
    return (
      <Moldura>
        <header className="cabecalho-pagina">
          <h1>Busca</h1>
        </header>
        <p className="vazio">Não foi possível buscar agora. Tente novamente em instantes.</p>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <header className="cabecalho-pagina">
        <h1>Resultados para “{termo}”</h1>
        <p>
          {resultado.meta.total} resultado{resultado.meta.total === 1 ? '' : 's'} encontrado
          {resultado.meta.total === 1 ? '' : 's'}
        </p>
      </header>

      <Listagem
        resultado={resultado}
        base={`/busca?q=${encodeURIComponent(termo)}`}
        vazio={`Nenhum artigo encontrado para “${termo}”. Tente outras palavras.`}
      />
    </Moldura>
  );
}
