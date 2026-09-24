'use client';

// ============================================================
// Rail de ferramentas — extrema esquerda do editor.
//
// Troca o que o painel ao lado mostra. É o equivalente ao rail do
// OpenCut, com uma diferença: a primeira aba não é "mídia
// importada", é a proposta da IA. O trabalho começa dela.
//
// Rótulo sob o ícone: o guia pede que ícone sozinho só apareça onde
// o significado é universal. "Elementos" e "Marca" não são.
// ============================================================

import type { Icon } from '@phosphor-icons/react';
import {
  IconeIA,
  IconeMidia,
  IconeLegenda,
  IconeMarca,
} from '../icones';

export type AbaDoEditor = 'ia' | 'midia' | 'texto' | 'legendas' | 'marca' | 'audio';

const ABAS: Array<{ id: AbaDoEditor; rotulo: string; Icone: Icon }> = [
  { id: 'ia', rotulo: 'Ferramentas', Icone: IconeIA },
  { id: 'midia', rotulo: 'Mídia', Icone: IconeMidia },
  { id: 'legendas', rotulo: 'Legendas', Icone: IconeLegenda },
  { id: 'marca', rotulo: 'Marca', Icone: IconeMarca },
];

interface Props {
  aba: AbaDoEditor;
  onTrocar: (aba: AbaDoEditor) => void;
}

export function RailDeFerramentas({ aba, onTrocar }: Props) {
  return (
    <nav className="editor__rail" aria-label="Ferramentas do editor">
      {ABAS.map(({ id, rotulo, Icone }) => (
        <button
          key={id}
          type="button"
          className="ferramenta"
          aria-pressed={aba === id}
          onClick={() => onTrocar(id)}
        >
          <Icone size={22} weight={aba === id ? 'fill' : 'regular'} />
          <span className="ferramenta__rotulo">{rotulo}</span>
        </button>
      ))}
    </nav>
  );
}
