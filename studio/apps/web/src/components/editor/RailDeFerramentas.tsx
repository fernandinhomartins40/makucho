'use client';

// ============================================================
// Coluna de categorias — extrema esquerda do editor (computador).
//
// O jeito do CapCut online: cada categoria (IA, Imagens, Texto,
// Legendas, Música...) abre o painel dela logo ao lado; tocar de novo
// na categoria aberta recolhe o painel e o vídeo ganha a largura. Uma
// categoria por coisa: a biblioteca não repete as abas por dentro.
//
// No celular a coluna não aparece: a barra de baixo (BarraMovel) faz o
// mesmo papel, com níveis.
// ============================================================

import type { Icon } from '@phosphor-icons/react';
import {
  IconeIA,
  IconeMidia,
  IconeLegenda,
  IconeMarca,
  IconeTexto,
  IconeTrilha,
  IconeSom,
  IconeEfeito,
  IconeTransicao,
  IconeFiltro,
  IconeSticker,
  IconeMaisFerramentas,
  IconeParametros,
} from '../icones';

export type AbaDoEditor = 'ia' | 'biblioteca' | 'midia' | 'texto' | 'legendas' | 'marca' | 'audio' | 'ajustes';

/** O que cada botão da coluna abre (a biblioteca, numa categoria). */
export type CategoriaDaColuna = 'ia' | 'midia' | 'textos' | 'legendas' | 'trilha' | 'sons' | 'efeitos' | 'transicoes' | 'cor' | 'stickers' | 'estilos' | 'marca' | 'ajustes';

const ITENS: Array<{ id: CategoriaDaColuna; rotulo: string; Icone: Icon }> = [
  { id: 'ia', rotulo: 'IA', Icone: IconeIA },
  { id: 'midia', rotulo: 'Imagens', Icone: IconeMidia },
  { id: 'textos', rotulo: 'Texto', Icone: IconeTexto },
  { id: 'legendas', rotulo: 'Legendas', Icone: IconeLegenda },
  { id: 'trilha', rotulo: 'Música', Icone: IconeTrilha },
  { id: 'sons', rotulo: 'Sons', Icone: IconeSom },
  { id: 'efeitos', rotulo: 'Efeitos', Icone: IconeEfeito },
  { id: 'transicoes', rotulo: 'Transições', Icone: IconeTransicao },
  { id: 'cor', rotulo: 'Filtros', Icone: IconeFiltro },
  { id: 'stickers', rotulo: 'Enfeites', Icone: IconeSticker },
  { id: 'estilos', rotulo: 'Estilos', Icone: IconeMaisFerramentas },
  { id: 'marca', rotulo: 'Marca', Icone: IconeMarca },
  { id: 'ajustes', rotulo: 'Ajustes', Icone: IconeParametros },
];

interface Props {
  ativa: CategoriaDaColuna | null;
  onEscolher: (c: CategoriaDaColuna) => void;
}

export function RailDeFerramentas({ ativa, onEscolher }: Props) {
  return (
    <nav className="editor__rail" aria-label="Categorias do editor">
      {ITENS.map(({ id, rotulo, Icone }) => {
        const ligada = ativa === id;
        return (
        <button key={id} type="button" className="ferramenta" aria-pressed={ligada} onClick={() => onEscolher(id)} title={rotulo}>
          <Icone size={21} weight={ligada ? 'fill' : 'regular'} />
          <span className="ferramenta__rotulo">{rotulo}</span>
        </button>
        );
      })}
    </nav>
  );
}
