import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Página não encontrada',
};

export default function NaoEncontrado() {
  return (
    <main className="portal-main portal-erro-pagina">
      <div className="portal-container">
        <span className="hub-eyebrow">Erro 404</span>
        <h1>Página não encontrada</h1>
        <p>O endereço pode ter mudado. Continue pela página inicial ou procure o assunto que deseja entender.</p>
        <div className="hub-actions">
          <Link href="/" className="hub-primary">Voltar ao início</Link>
          <Link href="/busca" className="hub-secondary">Buscar conteúdo</Link>
        </div>
      </div>
    </main>
  );
}
