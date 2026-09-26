'use client';

// ============================================================
// As duas colunas ao lado do vídeo, no celular.
//
// Esquerda: o que ACRESCENTAR (mídia, áudio, texto, stickers, efeitos,
// transições, filtros) -- cada botão abre a biblioteca já na categoria.
// Direita: o formato e a resolução no topo e o que AJUSTAR no trecho
// sob o cursor (enquadrar, velocidade, cor, volume, recorte).
//
// Os dois lados ficam à mão do polegar e ao lado do que mudam: o vídeo
// continua à vista enquanto se escolhe. No computador as mesmas coisas
// estão nos painéis laterais, então as colunas só existem aqui.
// ============================================================

import type { Icon } from '@phosphor-icons/react';
import {
  IconeMidia,
  IconeTrilha,
  IconeTexto,
  IconeSticker,
  IconeEfeito,
  IconeTransicao,
  IconeFiltro,
  IconeMaisFerramentas,
  IconeEnquadrar,
  IconeVelocidade,
  IconeCor,
  IconeVolume,
  IconeRecorte,
  IconeMaisOpcoes,
  IconeAbrir,
} from '../icones';

export type FerramentaDoPalco = 'midia' | 'audio' | 'texto' | 'stickers' | 'efeitos' | 'transicoes' | 'filtros' | 'mais';
export type AcaoDoPalco = 'ajustar' | 'velocidade' | 'cor' | 'volume' | 'recorte' | 'mais';

const FERRAMENTAS: Array<{ id: FerramentaDoPalco; rotulo: string; Icone: Icon }> = [
  { id: 'midia', rotulo: 'Mídia', Icone: IconeMidia },
  { id: 'audio', rotulo: 'Áudio', Icone: IconeTrilha },
  { id: 'texto', rotulo: 'Texto', Icone: IconeTexto },
  { id: 'stickers', rotulo: 'Stickers', Icone: IconeSticker },
  { id: 'efeitos', rotulo: 'Efeitos', Icone: IconeEfeito },
  { id: 'transicoes', rotulo: 'Transições', Icone: IconeTransicao },
  { id: 'filtros', rotulo: 'Filtros', Icone: IconeFiltro },
  { id: 'mais', rotulo: 'Mais', Icone: IconeMaisFerramentas },
];

const ACOES: Array<{ id: AcaoDoPalco; rotulo: string; Icone: Icon }> = [
  { id: 'ajustar', rotulo: 'Ajustar', Icone: IconeEnquadrar },
  { id: 'velocidade', rotulo: 'Velocidade', Icone: IconeVelocidade },
  { id: 'cor', rotulo: 'Cor', Icone: IconeCor },
  { id: 'volume', rotulo: 'Volume', Icone: IconeVolume },
  { id: 'recorte', rotulo: 'Recorte', Icone: IconeRecorte },
  { id: 'mais', rotulo: 'Mais', Icone: IconeMaisOpcoes },
];

export function FerramentasDoPalco({ ativa, onEscolher }: { ativa?: FerramentaDoPalco | null; onEscolher: (f: FerramentaDoPalco) => void }) {
  return (
    <nav className="palco-lateral palco-lateral--esquerda so-celular" aria-label="Acrescentar ao vídeo">
      {FERRAMENTAS.map(({ id, rotulo, Icone }) => (
        <button key={id} type="button" className="palco-lateral__botao" aria-pressed={ativa === id} onClick={() => onEscolher(id)}>
          <Icone size={22} weight={ativa === id ? 'fill' : 'regular'} />
          <span>{rotulo}</span>
        </button>
      ))}
    </nav>
  );
}

export function AcoesDoPalco({
  formato,
  resolucao,
  onFormato,
  onResolucao,
  onAcao,
  semVelocidade,
}: {
  formato: string;
  resolucao: string;
  onFormato: () => void;
  onResolucao: () => void;
  onAcao: (a: AcaoDoPalco) => void;
  /** Enquanto a velocidade não existe no plano, o botão fica de fora. */
  semVelocidade?: boolean;
}) {
  return (
    <div className="palco-lateral palco-lateral--direita so-celular">
      <button type="button" className="palco-lateral__seletor" onClick={onFormato} aria-label={`Formato do vídeo: ${formato}`}>
        {formato} <IconeAbrir size={12} />
      </button>
      <button type="button" className="palco-lateral__seletor" onClick={onResolucao} aria-label={`Resolução da exportação: ${resolucao}`}>
        {resolucao} <IconeAbrir size={12} />
      </button>
      <nav className="palco-lateral__grupo" aria-label="Ajustar o trecho">
        {ACOES.filter((a) => !(semVelocidade && a.id === 'velocidade')).map(({ id, rotulo, Icone }) => (
          <button key={id} type="button" className="palco-lateral__botao" onClick={() => onAcao(id)}>
            <Icone size={21} />
            <span>{rotulo}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
