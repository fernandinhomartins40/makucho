'use client';

// ============================================================
// Congela uma parte da tela enquanto ela não está à vista.
//
// Com `ativo` falso, o React pula o redesenho dela (o estado continua,
// nada é desmontado); quando volta a ativo, redesenha com o que há de
// novo. Serve às folhas fechadas do celular: durante o vídeo o editor
// se atualiza várias vezes por segundo, e redesenhar painéis que
// ninguém vê roubava o processador da prévia.
// ============================================================

import { memo, type ReactNode } from 'react';

export const Congelado = memo(
  function Congelado({ children }: { ativo: boolean; children: ReactNode }) {
    return <>{children}</>;
  },
  (_antes, depois) => !depois.ativo,
);
