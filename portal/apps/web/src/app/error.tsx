'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Falha ao carregar a página', error);
  }, [error]);

  return (
    <main className="portal-erro" role="alert">
      <Image
        src="/brand/makucho-logo-horizontal-metallic.webp"
        alt="MAKUCHO"
        width={1262}
        height={220}
        className="portal-erro-logo"
      />
      <span className="hub-eyebrow">Não foi possível carregar</span>
      <h1>O conteúdo está temporariamente indisponível.</h1>
      <p>Sua ação não foi confirmada. Tente novamente; se o problema continuar, volte ao início.</p>
      <div className="hub-actions">
        <button type="button" className="hub-primary" onClick={reset}>Tentar novamente</button>
        <Link href="/" className="hub-secondary">Voltar ao início</Link>
      </div>
    </main>
  );
}
