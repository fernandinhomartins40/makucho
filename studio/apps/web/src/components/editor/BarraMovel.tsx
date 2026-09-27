'use client';

// ============================================================
// A barra de baixo do editor no celular (o jeito do CapCut).
//
// Um nível de cada vez: as categorias (Editar, Áudio, Texto, Legendas,
// Imagens...) rolam para o lado; tocar numa categoria troca a barra
// pelas ações dela, com "<" para voltar. Cada ação faz a coisa ou abre
// uma gaveta com título e X. Com um trecho selecionado, a barra já
// mostra as ações de editar o trecho (sair desmarca).
//
// Muitas funções, mas nunca todas de uma vez: é o que deixa o editor
// compreensível sem esconder nada.
// ============================================================

import { useEffect, useState } from 'react';
import type { Icon } from '@phosphor-icons/react';
import {
  IconeCortar,
  IconeTrilha,
  IconeTexto,
  IconeLegenda,
  IconeMidia,
  IconeEfeito,
  IconeSticker,
  IconeFiltro,
  IconeMaisFerramentas,
  IconeCelular,
  IconeMarca,
  IconeDividir,
  IconeCopiar,
  IconeVelocidade,
  IconeVolume,
  IconeCor,
  IconeRecorte,
  IconeLixeira,
  IconeParametros,
  IconeSom,
  IconeMicrofone,
  IconeMudo,
  IconeIA,
  IconeMais,
  IconeRenomear,
  IconeOlho,
  IconeOlhoFechado,
  IconeTransicao,
  IconeVoltar,
} from '../icones';

export type AcaoMovel =
  | 'imagens' | 'enfeites' | 'filtros' | 'estilos' | 'formato' | 'marca'
  | 'dividir' | 'cortar' | 'duplicar' | 'velocidade' | 'som' | 'cor' | 'preencher' | 'excluir' | 'ajustes'
  | 'musica' | 'sons' | 'narrar' | 'silenciar' | 'silencios'
  | 'novo-texto' | 'modelos-texto'
  | 'legenda-estilo' | 'legenda-corrigir' | 'nova-legenda' | 'legenda-onoff'
  | 'efeitos' | 'transicoes';

type Nivel = 'raiz' | 'editar' | 'audio' | 'texto' | 'legendas' | 'efeitos';
type Item = { id: string; rotulo: string; Icone: Icon; abre?: Nivel; acao?: AcaoMovel; perigo?: boolean };

interface Props {
  /** Trecho selecionado: a barra abre nas ações dele. */
  trechoSelecionado: boolean;
  onDesmarcarTrecho: () => void;
  onAcao: (a: AcaoMovel) => void;
  legendasLigadas: boolean;
  somOriginalMudo: boolean;
}

export function BarraMovel({ trechoSelecionado, onDesmarcarTrecho, onAcao, legendasLigadas, somOriginalMudo }: Props) {
  const [nivel, setNivel] = useState<Nivel>('raiz');
  useEffect(() => {
    if (trechoSelecionado) setNivel('editar');
    else setNivel((n) => (n === 'editar' ? 'raiz' : n));
  }, [trechoSelecionado]);

  const NIVEIS: Record<Nivel, Item[]> = {
    raiz: [
      { id: 'editar', rotulo: 'Editar', Icone: IconeCortar, abre: 'editar' },
      { id: 'audio', rotulo: 'Áudio', Icone: IconeTrilha, abre: 'audio' },
      { id: 'texto', rotulo: 'Texto', Icone: IconeTexto, abre: 'texto' },
      { id: 'legendas', rotulo: 'Legendas', Icone: IconeLegenda, abre: 'legendas' },
      { id: 'imagens', rotulo: 'Imagens', Icone: IconeMidia, acao: 'imagens' },
      { id: 'efeitos', rotulo: 'Efeitos', Icone: IconeEfeito, abre: 'efeitos' },
      { id: 'enfeites', rotulo: 'Enfeites', Icone: IconeSticker, acao: 'enfeites' },
      { id: 'filtros', rotulo: 'Filtros', Icone: IconeFiltro, acao: 'filtros' },
      { id: 'estilos', rotulo: 'Estilos', Icone: IconeMaisFerramentas, acao: 'estilos' },
      { id: 'formato', rotulo: 'Formato', Icone: IconeCelular, acao: 'formato' },
      { id: 'marca', rotulo: 'Marca', Icone: IconeMarca, acao: 'marca' },
    ],
    editar: [
      { id: 'dividir', rotulo: 'Dividir', Icone: IconeDividir, acao: 'dividir' },
      { id: 'cortar', rotulo: 'Cortar início', Icone: IconeCortar, acao: 'cortar' },
      { id: 'duplicar', rotulo: 'Duplicar', Icone: IconeCopiar, acao: 'duplicar' },
      { id: 'velocidade', rotulo: 'Velocidade', Icone: IconeVelocidade, acao: 'velocidade' },
      { id: 'som', rotulo: 'Volume', Icone: IconeVolume, acao: 'som' },
      { id: 'cor', rotulo: 'Cor', Icone: IconeCor, acao: 'cor' },
      { id: 'preencher', rotulo: 'Preencher', Icone: IconeRecorte, acao: 'preencher' },
      { id: 'ajustes', rotulo: 'Ajustes', Icone: IconeParametros, acao: 'ajustes' },
      { id: 'excluir', rotulo: 'Excluir', Icone: IconeLixeira, acao: 'excluir', perigo: true },
    ],
    audio: [
      { id: 'musica', rotulo: 'Música', Icone: IconeTrilha, acao: 'musica' },
      { id: 'sons', rotulo: 'Sons', Icone: IconeSom, acao: 'sons' },
      { id: 'narrar', rotulo: 'Narrar', Icone: IconeMicrofone, acao: 'narrar' },
      { id: 'silenciar', rotulo: somOriginalMudo ? 'Ligar som' : 'Silenciar som', Icone: somOriginalMudo ? IconeVolume : IconeMudo, acao: 'silenciar' },
      { id: 'silencios', rotulo: 'Cortar silêncios', Icone: IconeIA, acao: 'silencios' },
    ],
    texto: [
      { id: 'novo-texto', rotulo: 'Novo texto', Icone: IconeMais, acao: 'novo-texto' },
      { id: 'modelos-texto', rotulo: 'Modelos', Icone: IconeTexto, acao: 'modelos-texto' },
    ],
    legendas: [
      { id: 'legenda-estilo', rotulo: 'Estilo', Icone: IconeLegenda, acao: 'legenda-estilo' },
      { id: 'legenda-corrigir', rotulo: 'Corrigir palavras', Icone: IconeRenomear, acao: 'legenda-corrigir' },
      { id: 'nova-legenda', rotulo: 'Nova legenda', Icone: IconeMais, acao: 'nova-legenda' },
      { id: 'legenda-onoff', rotulo: legendasLigadas ? 'Esconder' : 'Mostrar', Icone: legendasLigadas ? IconeOlhoFechado : IconeOlho, acao: 'legenda-onoff' },
    ],
    efeitos: [
      { id: 'efeitos', rotulo: 'Efeitos', Icone: IconeEfeito, acao: 'efeitos' },
      { id: 'transicoes', rotulo: 'Transições', Icone: IconeTransicao, acao: 'transicoes' },
    ],
  };

  const voltar = () => {
    if (nivel === 'editar' && trechoSelecionado) onDesmarcarTrecho();
    setNivel('raiz');
  };

  return (
    <nav className="barra-movel" aria-label={nivel === 'raiz' ? 'Ferramentas' : `Ferramentas: ${NIVEIS.raiz.find((i) => i.abre === nivel)?.rotulo ?? ''}`} data-nivel={nivel}>
      {nivel !== 'raiz' && (
        <button type="button" className="barra-movel__voltar" onClick={voltar} aria-label="Voltar">
          <IconeVoltar size={20} />
        </button>
      )}
      <div className="barra-movel__itens" key={nivel}>
        {NIVEIS[nivel].map((i) => (
          <button
            key={i.id}
            type="button"
            className="barra-movel__item"
            data-perigo={i.perigo || undefined}
            onClick={() => (i.abre ? setNivel(i.abre) : i.acao && onAcao(i.acao))}
          >
            <i.Icone size={24} />
            <span>{i.rotulo}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
