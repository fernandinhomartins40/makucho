import type { MarketIndicatorDto } from "@makucho/types";
import { SetaAlta, SetaBaixa } from "@/components/icones";

function valorDoIndicador(item: MarketIndicatorDto) {
  const casas = item.unit === "R$" ? 2 : 0;
  const numero = item.value.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
  return item.unit === "R$" || item.unit === "US$"
    ? `${item.unit} ${numero}`
    : numero;
}

/** Faixa "Radar do mercado" logo abaixo do cabeçalho, em todas as páginas. */
export function Radar({ indicadores }: { indicadores: MarketIndicatorDto[] }) {
  const prioridade = ["IBOV", "USD", "BTC"];
  const itens = prioridade
    .map((simbolo) =>
      indicadores.find((item) => item.symbol.toUpperCase().includes(simbolo)),
    )
    .filter((item): item is MarketIndicatorDto => item !== undefined);
  if (!itens.length) return null;
  return (
    <aside className="hub-radar" aria-label="Radar do mercado">
      <div className="hub-container hub-radar-inner">
        <span className="hub-radar-label">Radar do mercado</span>
        <div className="hub-radar-lista">
          {itens.map((item) => {
            const variacao = item.changePercent ?? 0;
            const direcao =
              variacao > 0 ? "alta" : variacao < 0 ? "baixa" : "estavel";
            return (
              <div className={`hub-radar-item ${direcao}`} key={item.id}>
                {variacao < 0 ? <SetaBaixa /> : <SetaAlta />}
                <span className="hub-radar-dados">
                  <span className="hub-radar-nome">{item.label}</span>
                  <span className="hub-radar-valor">
                    <strong>{valorDoIndicador(item)}</strong>
                    <span className="hub-radar-change">
                      {variacao > 0 ? "+" : variacao < 0 ? "−" : ""}
                      {Math.abs(variacao).toFixed(2).replace(".", ",")}%
                    </span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <span className="hub-radar-nota">
          Informação para
          <br /> você decidir melhor.
        </span>
      </div>
    </aside>
  );
}
