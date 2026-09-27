'use client';

// ============================================================
// Editor simples: o que o leigo precisa, e nada mais.
//
// Entre o vídeo e a timeline: pedir à IA (o caminho principal) e seis
// botões para o que mais se muda -- legenda, texto, imagens, música,
// estilo e narração. Cada botão abre UM painel. Tocar num elemento da
// timeline abre a etiqueta dele (EtiquetaDoItem). As colunas, as abas
// e as propriedades fixas ficam no modo avançado.
// ============================================================

import type { Icon } from '@phosphor-icons/react';
import type { EditPlanV1 } from '@makucho/studio-contracts';
import { PedirAIa, type RespostaDaIa } from './PedirAIa';
import { IconeLegenda, IconeTexto, IconeMidia, IconeTrilha, IconeCor, IconeMicrofone } from '../icones';

export type DestinoSimples = 'legendas' | 'texto' | 'imagens' | 'musica' | 'estilo' | 'narracao';

const BOTOES: Array<{ id: DestinoSimples; rotulo: string; Icone: Icon }> = [
  { id: 'legendas', rotulo: 'Legenda', Icone: IconeLegenda },
  { id: 'texto', rotulo: 'Texto', Icone: IconeTexto },
  { id: 'imagens', rotulo: 'Imagens', Icone: IconeMidia },
  { id: 'musica', rotulo: 'Música', Icone: IconeTrilha },
  { id: 'estilo', rotulo: 'Estilo', Icone: IconeCor },
  { id: 'narracao', rotulo: 'Narrar', Icone: IconeMicrofone },
];

interface Props {
  plan: EditPlanV1;
  desligados: ReadonlySet<string>;
  posicaoMs: number;
  quadros?: import('../../lib/quadrosDoVideo').QuadrosDoVideo;
  semIa: boolean;
  onPedir: (texto: string, anterior?: { pedido: string; resposta: string }) => Promise<RespostaDaIa | null>;
  onIrPara: (ms: number) => void;
  onAlternarTrecho: (clipId: string) => void;
  onAbrir: (d: DestinoSimples) => void;
  /** Avisos e cards da IA (mídias separadas, montagem sem IA) acima de tudo. */
  topo?: React.ReactNode;
}

export function EditorSimples({ semIa, onPedir, onAbrir, topo }: Props) {
  return (
    <section className="editor-simples" aria-label="Editar o vídeo">
      {topo}
      {!semIa && <PedirAIa onEnviar={onPedir} />}

      <nav className="editor-simples__botoes" aria-label="O que mudar">
        {BOTOES.map(({ id, rotulo, Icone }) => (
          <button key={id} type="button" onClick={() => onAbrir(id)}>
            <Icone size={24} />
            <span>{rotulo}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
