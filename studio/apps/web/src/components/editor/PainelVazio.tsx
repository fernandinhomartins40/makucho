'use client';

// ============================================================
// Abas ainda não ligadas do rail.
//
// Um estado vazio que diz o que virá e o que fazer agora vale mais
// que uma tela em branco — o diagnóstico do guia apontou áreas mudas
// como um dos problemas do editor antigo.
// ============================================================

import type { Icon } from '@phosphor-icons/react';

interface Props {
  Icone: Icon;
  titulo: string;
  texto: string;
}

export function PainelVazio({ Icone, titulo, texto }: Props) {
  return (
    <div className="vazio" style={{ padding: 'var(--e6) var(--e4)' }}>
      <div className="vazio__icone">
        <Icone size={26} />
      </div>
      <div>
        <h3 style={{ marginBottom: 4 }}>{titulo}</h3>
        <p className="texto-secundario" style={{ fontSize: 13 }}>
          {texto}
        </p>
      </div>
    </div>
  );
}
