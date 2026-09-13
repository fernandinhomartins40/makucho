import Link from 'next/link';

export default function NaoEncontrado() {
  return (
    <main className="container" style={{ padding: '80px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--borda)' }}>404</p>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 10 }}>
        Página não encontrada
      </h1>
      <p style={{ color: 'var(--texto-suave)', marginBottom: 24 }}>
        O endereço que você procurou não existe ou foi movido.
      </p>
      <Link href="/" className="botao botao-primario" style={{ display: 'inline-block' }}>
        Voltar para a home
      </Link>
    </main>
  );
}
