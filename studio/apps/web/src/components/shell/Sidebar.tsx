'use client';

// ============================================================
// Navegação lateral.
//
// O diagnóstico do guia apontou a barra inferior como o primeiro
// problema: ela remete a aplicativo mobile, come altura útil e
// separa a navegação do contexto de trabalho. Num editor de vídeo,
// altura é o recurso mais escasso da tela.
//
// Dois modos, como o guia define:
//   232px  telas administrativas (Projetos, Roteiro, Marca)
//    72px  telas de foco (Gravar, Editor), onde o conteúdo manda
// ============================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Icon } from '@phosphor-icons/react';
import {
  IconeProjetos,
  IconeRoteiro,
  IconeGravar,
  IconeEditor,
  IconeMarca,
  IconeAjuda,
} from '../icones';

interface ItemDeNavegacao {
  href: string;
  rotulo: string;
  /** Tipo da própria biblioteca: aceita size, weight, color e mirrored. */
  Icone: Icon;
}

const ITENS: ItemDeNavegacao[] = [
  { href: '/', rotulo: 'Projetos', Icone: IconeProjetos },
  { href: '/roteiros', rotulo: 'Roteiro', Icone: IconeRoteiro },
  { href: '/gravar', rotulo: 'Gravar', Icone: IconeGravar },
  { href: '/editor', rotulo: 'Editor', Icone: IconeEditor },
  { href: '/marca', rotulo: 'Marca', Icone: IconeMarca },
];

/** As telas de foco usam a barra compacta. */
const TELAS_DE_FOCO = ['/gravar', '/editor'];

export function Sidebar() {
  const caminho = usePathname();
  const compacta = TELAS_DE_FOCO.some((rota) => caminho.startsWith(rota));

  return (
    <aside className={`sidebar${compacta ? ' sidebar--compacta' : ''}`}>
      <div className="sidebar__marca">
        <Link
          href="/"
          aria-label="MAKUCHO Studio — início"
          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        >
          {compacta ? (
            <Logotipo compacto />
          ) : (
            <>
              <Logotipo />
              <p
                className="texto-secundario"
                style={{ fontSize: 12, marginTop: 2 }}
              >
                Seus vídeos, editados por IA
              </p>
            </>
          )}
        </Link>
      </div>

      <nav className="sidebar__nav" aria-label="Navegação principal">
        {ITENS.map(({ href, rotulo, Icone }) => {
          const ativo = href === '/' ? caminho === '/' : caminho.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className="nav-item"
              aria-current={ativo ? 'page' : undefined}
              // Na barra compacta o rótulo some, então o nome
              // acessível vem do title e do aria-label.
              title={compacta ? rotulo : undefined}
              aria-label={compacta ? rotulo : undefined}
            >
              <span className="nav-item__icone" aria-hidden>
                <Icone size={20} />
              </span>
              <span className="nav-item__rotulo">{rotulo}</span>
            </Link>
          );
        })}
      </nav>

      {!compacta && (
        <div style={{ padding: 'var(--e3)' }}>
          <Link href="/ajuda" className="nav-item">
            <span className="nav-item__icone" aria-hidden>
              <IconeAjuda size={20} />
            </span>
            <span className="nav-item__rotulo">Ajuda</span>
          </Link>
        </div>
      )}
    </aside>
  );
}

/**
 * Logotipo desenhado em código.
 *
 * O manifesto dos assets é explícito: o logo vem do arquivo oficial
 * da marca, não extraído do mockup. Enquanto ele não chega, esta
 * marca tipográfica ocupa o lugar sem inventar um símbolo.
 */
function Logotipo({ compacto = false }: { compacto?: boolean }) {
  if (compacto) {
    return (
      <div
        style={{
          width: 40,
          height: 40,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 10,
          background: 'linear-gradient(135deg, var(--primary), var(--accent))',
          color: '#fff',
          fontWeight: 800,
          fontSize: 18,
          margin: '0 auto',
        }}
      >
        M
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 34,
          height: 34,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 9,
          background: 'linear-gradient(135deg, var(--primary), var(--accent))',
          color: '#fff',
          fontWeight: 800,
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        M
      </div>
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>
          MAKUCHO
        </div>
        <div style={{ fontSize: 12, color: 'var(--accent)' }}>Studio</div>
      </div>
    </div>
  );
}
