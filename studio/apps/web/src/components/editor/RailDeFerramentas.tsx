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
//
// No celular o rail vira a barra de abas do rodapé: cada ferramenta
// abre o painel numa folha que sobe de baixo, e "Ajustes" abre as
// propriedades do trecho (o inspector, que no computador fica à
// direita).
// ============================================================

import type { Icon } from '@phosphor-icons/react';
import {
  IconeIA,
  IconeMidia,
  IconeLegenda,
  IconeMarca,
  IconeParametros,
  IconeBiblioteca,
} from '../icones';

export type AbaDoEditor = 'ia' | 'biblioteca' | 'midia' | 'texto' | 'legendas' | 'marca' | 'audio';

// A ordem do trabalho: o que a IA fez, o que dá para acrescentar, o
// texto da fala, os arquivos e a marca.
const ABAS: Array<{ id: AbaDoEditor; rotulo: string; Icone: Icon }> = [
  { id: 'ia', rotulo: 'IA', Icone: IconeIA },
  { id: 'biblioteca', rotulo: 'Biblioteca', Icone: IconeBiblioteca },
  { id: 'legendas', rotulo: 'Legendas', Icone: IconeLegenda },
  { id: 'midia', rotulo: 'Mídia', Icone: IconeMidia },
  { id: 'marca', rotulo: 'Marca', Icone: IconeMarca },
];

interface Props {
  aba: AbaDoEditor;
  onTrocar: (aba: AbaDoEditor) => void;
  /** Só no celular: abre as propriedades do trecho. */
  onAjustes?: () => void;
  ajustesAbertos?: boolean;
}

export function RailDeFerramentas({ aba, onTrocar, onAjustes, ajustesAbertos }: Props) {
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
      {onAjustes && (
        <button
          type="button"
          className="ferramenta ferramenta--ajustes so-celular"
          aria-pressed={Boolean(ajustesAbertos)}
          onClick={onAjustes}
        >
          <IconeParametros size={22} weight={ajustesAbertos ? 'fill' : 'regular'} />
          <span className="ferramenta__rotulo">Ajustes</span>
        </button>
      )}
    </nav>
  );
}
