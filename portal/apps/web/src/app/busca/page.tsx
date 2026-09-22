import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { paginaDaUrl } from '@/lib/paginacao';
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

function FormularioBusca({ termo = '' }: { termo?: string }) {
  return (
    <form action="/busca" role="search" className="portal-busca-form">
      <label htmlFor="busca-pagina">O que você quer entender?</label>
      <div>
        <input id="busca-pagina" type="search" name="q" defaultValue={termo} minLength={2} required placeholder="Ex.: Selic, dólar, investimentos" />
        <button type="submit">Buscar</button>
      </div>
    </form>
  );
}

export default async function PaginaBusca({ searchParams }: Props) {
  const { q, page } = await searchParams;
  const termo = (q ?? '').trim();
  const pagina = paginaDaUrl(page);

  if (termo.length < 2) {
    return (
      <Moldura>
        <header className="cabecalho-pagina">
          <h1>Busca</h1>
        </header>
        <FormularioBusca termo={termo} />
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
        <FormularioBusca termo={termo} />
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

      <FormularioBusca termo={termo} />

      <Listagem
        resultado={resultado}
        base={`/busca?q=${encodeURIComponent(termo)}`}
        vazio={`Nenhum artigo encontrado para “${termo}”. Tente outras palavras.`}
      />
    </Moldura>
  );
}
