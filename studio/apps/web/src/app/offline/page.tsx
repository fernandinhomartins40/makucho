// A página que o app mostra sem internet (o service worker a guarda na
// instalação). Estática e sem dados: é o que sobra quando nada responde.

export default function Offline() {
  return (
    <main className="offline">
      <div className="offline__caixa">
        <span className="sidebar__sigla" aria-hidden style={{ width: 56, height: 56, fontSize: 28 }}>
          M
        </span>
        <h1>Sem conexão</h1>
        <p className="texto-secundario" style={{ fontSize: 15, lineHeight: 1.5 }}>
          O Studio precisa de internet para enviar, editar e exportar vídeos. Assim que a conexão
          voltar, é só tentar de novo.
        </p>
        <a href="/" className="botao">
          Tentar de novo
        </a>
      </div>
    </main>
  );
}
