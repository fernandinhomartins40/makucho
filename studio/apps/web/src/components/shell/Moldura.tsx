'use client';

// ============================================================
// Moldura do app.
//
// Duas formas, e a rota decide qual:
//
//   navegação  Projetos, Roteiro, Gravar e Marca — sidebar de 232px
//              à esquerda, idêntica em todas;
//   foco       o Editor — a sidebar sai e o rail de ferramentas
//              ocupa o lugar dela, porque ali a coluna esquerda
//              pertence ao trabalho, não à navegação. A volta fica
//              na seta da topbar.
//
// Sem essa distinção, o editor teria duas colunas de ícones lado a
// lado disputando a mesma função.
// ============================================================

import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';

/** Telas de foco: ocupam a largura toda, sem sidebar. */
const TELAS_DE_FOCO = ['/editor'];

export function Moldura({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const foco = TELAS_DE_FOCO.some((rota) => caminho.startsWith(rota));

  if (foco) {
    return <div className="principal">{children}</div>;
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="principal">{children}</div>
    </div>
  );
}
