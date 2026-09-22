import type { HomepagePayload } from "@makucho/types";
import { api } from "@/lib/api";
import { Cabecalho } from "@/components/cabecalho";
import { Rodape } from "@/components/rodape";

/**
 * Cabecalho e rodape em volta do conteudo.
 *
 * Os dois precisam das editorias, do ticker, das redes e das
 * configuracoes, que vem do mesmo /api/homepage. Buscar aqui evita
 * repetir a chamada em cada pagina — e o fetch do Next deduplica dentro
 * da mesma requisicao.
 */
export async function Moldura({ children }: { children: React.ReactNode }) {
  let dados: HomepagePayload;

  try {
    dados = await api.homepage();
  } catch {
    // Um erro na API nao pode deixar a pagina sem cabecalho: melhor um
    // portal sem ticker do que uma tela branca.
    dados = {
      sections: [],
      categories: [],
      indicators: [],
      socials: [],
      mostRead: [],
      settings: {},
    };
  }

  const nomeDoSite = (dados.settings["site.name"] as string) ?? "MAKUCHO";

  return (
    <>
      <Cabecalho
        categorias={dados.categories}
        indicadores={dados.indicators}
        socials={dados.socials}
        nomeDoSite={nomeDoSite}
      />
      <main className="portal-main">
        <div className="portal-container">{children}</div>
      </main>
      <Rodape
        categorias={dados.categories}
        socials={dados.socials}
        settings={dados.settings}
      />
    </>
  );
}
