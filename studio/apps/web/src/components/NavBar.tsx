'use client';

// ============================================================
// Navegacao principal.
//
// Barra inferior, nao lateral: a experiencia principal e o celular
// segurado na mao, e o polegar alcanca a base da tela com folga --
// o topo exige reposicionar o aparelho.
// ============================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Item {
  href: string;
  rotulo: string;
  icone: string;
}

const ITENS: Item[] = [
  { href: '/', rotulo: 'Projetos', icone: '▤' },
  { href: '/roteiros', rotulo: 'Roteiro', icone: '✎' },
  { href: '/teleprompter', rotulo: 'Gravar', icone: '●' },
  { href: '/editor', rotulo: 'Editar', icone: '✂' },
  { href: '/marca', rotulo: 'Marca', icone: '◈' },
];

export function NavBar() {
  const caminho = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      style={{
        position: 'sticky',
        bottom: 0,
        display: 'flex',
        borderTop: '1px solid var(--borda)',
        background: 'var(--superficie)',
        // Respeita a barra de gestos do iPhone.
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 40,
      }}
    >
      {ITENS.map((item) => {
        const ativo =
          item.href === '/' ? caminho === '/' : caminho.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? 'page' : undefined}
            style={{
              flex: 1,
              // 56px de altura: alvo confortavel para o polegar.
              minHeight: 56,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: '8px 4px',
              textDecoration: 'none',
              color: ativo ? 'var(--azul)' : 'var(--texto-suave)',
              fontSize: 10,
              borderTop: ativo ? '2px solid var(--azul)' : '2px solid transparent',
              marginTop: -1,
            }}
          >
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
              {item.icone}
            </span>
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
