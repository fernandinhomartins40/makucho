import Link from 'next/link';
import type { Metadata } from 'next';
import { Moldura } from '@/components/moldura';

export const metadata: Metadata = {
  title: 'Página não encontrada',
};

export default function NaoEncontrado() {
  return (
    <Moldura>
      <div className="portal-erro-pagina">
        <div>
          <span className="hub-eyebrow">Erro 404</span>
          <h1>Página não encontrada</h1>
          <p>O endereço pode ter mudado. Continue pela página inicial ou procure o assunto que deseja entender.</p>
          <div className="hub-actions">
            <Link href="/" className="hub-primary">Voltar ao início</Link>
            <Link href="/busca" className="hub-secondary">Buscar conteúdo</Link>
          </div>
        </div>
      </div>
    </Moldura>
  );
}
