'use client';

// ============================================================
// "Proporção" no canto do vídeo (computador), como no CapCut online:
// um botão pequeno que abre os formatos (9:16, 4:5, 1:1, 16:9).
// ============================================================

import { useEffect, useState } from 'react';
import type { FormatoDoVideo } from '@makucho/studio-contracts';
import { SeletorDeFormato } from './Inspector';
import { IconeCelular } from '../icones';

export function ProporcaoDoVideo({ formato, onEscolher }: { formato: FormatoDoVideo; onEscolher: (f: FormatoDoVideo) => void }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.proporcao')) setAberto(false);
    };
    window.addEventListener('pointerdown', fechar);
    return () => window.removeEventListener('pointerdown', fechar);
  }, [aberto]);
  return (
    <div className="proporcao so-largo">
      <button type="button" className="proporcao__botao" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} title="Proporção do vídeo">
        <IconeCelular size={18} />
        <span>{formato}</span>
      </button>
      {aberto && (
        <div className="proporcao__menu" role="dialog" aria-label="Proporção do vídeo">
          <strong>Proporção</strong>
          <SeletorDeFormato
            atual={formato}
            onEscolher={(f) => {
              setAberto(false);
              onEscolher(f);
            }}
          />
        </div>
      )}
    </div>
  );
}
