import Link from 'next/link';
import type { CategoryDto, MarketIndicatorDto } from '@makucho/types';

/**
 * Cabecalho com ticker e menu (secoes 19 e 20).
 *
 * Componente de servidor: nao envia JavaScript ao navegador. O unico
 * elemento interativo e o formulario de busca, que funciona por GET
 * nativo — sem JS, continua funcionando.
 */

function formatarValor(valor: number, unidade: string | null): string {
  const casas = Math.abs(valor) >= 1000 ? 0 : 2;
  const numero = valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
  return unidade === 'R$' || unidade === 'US$' ? `${unidade} ${numero}` : numero;
}

function Ticker({ indicadores }: { indicadores: MarketIndicatorDto[] }) {
  if (indicadores.length === 0) return null;

  return (
    <div className="ticker">
      <div className="container">
        <div className="ticker-lista">
          {indicadores.map((i) => {
            const variacao = i.changePercent ?? 0;
            const subindo = variacao > 0;
            const parado = variacao === 0;

            return (
              <div key={i.id} className="ticker-item">
                <strong>{i.label}</strong>
                <span className="ticker-valor">{formatarValor(i.value, i.unit)}</span>
                {!parado && (
                  <span className={`ticker-var ${subindo ? 'sobe' : 'desce'}`}>
                    {subindo ? '▲' : '▼'} {Math.abs(variacao).toFixed(2)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Cabecalho({
  categorias,
  indicadores,
  nomeDoSite = 'MAKUCHO',
}: {
  categorias: CategoryDto[];
  indicadores: MarketIndicatorDto[];
  nomeDoSite?: string;
}) {
  // O menu mostra so as editorias marcadas para aparecer, e no maximo
  // seis: alem disso a barra quebra em telas medias.
  const doMenu = categorias.filter((c) => c.showInMenu).slice(0, 6);

  return (
    <>
      <Ticker indicadores={indicadores} />

      <header className="cabecalho">
        <div className="container cabecalho-linha">
          <Link href="/" className="marca" aria-label={`${nomeDoSite}, página inicial`}>
            <span className="marca-sigla" aria-hidden="true">
              M
            </span>
            {nomeDoSite}
          </Link>

          <nav className="menu" aria-label="Editorias">
            {doMenu.map((c) => (
              <Link key={c.id} href={`/categoria/${c.slug}`}>
                {c.name}
              </Link>
            ))}
          </nav>

          <form className="busca-form" action="/busca" role="search">
            <label htmlFor="busca" className="so-leitor-de-tela">
              Buscar no portal
            </label>
            <input
              id="busca"
              className="busca-input"
              type="search"
              name="q"
              placeholder="Buscar…"
              minLength={2}
              required
            />
          </form>
        </div>
      </header>
    </>
  );
}
