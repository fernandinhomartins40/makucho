'use client';

// ============================================================
// Editor simples: o que o leigo precisa, e nada mais.
//
// Abaixo do vídeo: pedir à IA (o caminho principal), os trechos numa
// tira (tocar leva o vídeo até ele; a chave tira ou devolve) e cinco
// botões grandes para o que mais se muda -- legenda, texto, imagens,
// música e estilo. Cada botão abre UM painel. A timeline completa, as
// faixas e as propriedades ficam no modo avançado, a um toque.
// ============================================================

import type { Icon } from '@phosphor-icons/react';
import type { EditPlanV1 } from '@makucho/studio-contracts';
import { agendaDoPlano } from '@makucho/studio-contracts';
import { PedirAIa, type RespostaDaIa } from './PedirAIa';
import { corDaFuncao, nomeDaFuncao } from './funcoes';
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
  quadros?: (sourceMs: number) => string | null;
  semIa: boolean;
  onPedir: (texto: string, anterior?: { pedido: string; resposta: string }) => Promise<RespostaDaIa | null>;
  onIrPara: (ms: number) => void;
  onAlternarTrecho: (clipId: string) => void;
  onAbrir: (d: DestinoSimples) => void;
  /** Avisos e cards da IA (mídias separadas, montagem sem IA) acima de tudo. */
  topo?: React.ReactNode;
}

export function EditorSimples({ plan, desligados, posicaoMs, quadros, semIa, onPedir, onIrPara, onAlternarTrecho, onAbrir, topo }: Props) {
  // Posição de cada trecho (os desligados ficam na lista, apagados).
  const agenda = agendaDoPlano(plan, [...desligados]);
  const inicioDe = new Map(agenda.trechos.map((t) => [t.clip.id, t]));

  return (
    <section className="editor-simples" aria-label="Editar o vídeo">
      {topo}
      {!semIa && <PedirAIa onEnviar={onPedir} />}

      <div className="editor-simples__trechos" role="list" aria-label="Trechos do vídeo">
        {plan.clips.map((c) => {
          const t = inicioDe.get(c.id);
          const ligado = !desligados.has(c.id);
          const atual = t && posicaoMs >= t.inicioMs && posicaoMs < t.inicioMs + t.duracaoMs;
          const capa = quadros?.((c.sourceStartMs + c.sourceEndMs) / 2);
          return (
            <div key={c.id} role="listitem" className="trecho-simples" data-ligado={ligado || undefined} data-atual={atual || undefined}>
              <button type="button" className="trecho-simples__capa" onClick={() => t && onIrPara(t.inicioMs)} aria-label={`Ver ${nomeDaFuncao(c.role)}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {capa ? <img src={capa} alt="" /> : <span style={{ background: corDaFuncao(c.role) }} />}
                <b style={{ background: corDaFuncao(c.role) }}>{nomeDaFuncao(c.role)}</b>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={ligado}
                className="trecho-simples__chave"
                onClick={() => onAlternarTrecho(c.id)}
                aria-label={ligado ? `Tirar ${nomeDaFuncao(c.role)} do vídeo` : `Devolver ${nomeDaFuncao(c.role)} ao vídeo`}
              >
                {ligado ? 'No vídeo' : 'Fora'}
              </button>
            </div>
          );
        })}
      </div>

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
