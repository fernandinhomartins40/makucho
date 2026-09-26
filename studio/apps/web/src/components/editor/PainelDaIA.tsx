'use client';

// ============================================================
// Painel "Trechos do vídeo" (a seleção da IA).
//
// O contexto mestre (seção 13) proíbe caixa preta: cada trecho vem
// com o motivo da escolha e com o ponto exato do original de onde
// saiu. Sem isso não há como discordar da IA de forma informada — e
// discordar é o ponto do produto.
//
// O toggle desliga o trecho sem apagá-lo, porque a mesma seção exige
// poder restaurar o que foi descartado.
// ============================================================

import { duracaoNaTimeline } from '@makucho/studio-contracts';
import { useState } from 'react';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { corDaFuncao, nomeDaFuncao, tempo } from './funcoes';
import { IconeAviso, IconeMenu } from '../icones';

interface Props {
  plan: EditPlanV1;
  selecionado: string | null;
  /** Trechos desligados pelo usuário, que continuam na lista. */
  desligados: Set<string>;
  onSelecionar: (clipId: string | null) => void;
  onAlternar: (clipId: string) => void;
  onOperacao: (op: TimelineOperation) => void;
}

export function PainelDaIA({
  plan,
  selecionado,
  desligados,
  onSelecionar,
  onAlternar,
  onOperacao,
}: Props) {
  const [menu, setMenu] = useState<string | null>(null);
  const minutos = Math.max(1, Math.round(plan.sourceDurationMs / 60_000));
  const ligados = plan.clips.filter((c) => !desligados.has(c.id)).length;

  // Sem "% de confiança": para quem não edita vídeo o número não diz o
  // que fazer. O que precisa de atenção aparece no próprio trecho
  // ("Revisar sentido").
  return (
    <>
      <header className="ia-secao__cabecalho">
        <h2 className="ia-secao__titulo">Trechos do vídeo</h2>
        <span className="ia-secao__meta">
          {ligados === plan.clips.length ? `${plan.clips.length} trechos` : `${ligados} de ${plan.clips.length} no vídeo`} · de {minutos} min gravados
        </span>
      </header>
      <p className="ia-secao__ajuda">Toque num trecho para vê-lo. A chave tira ou devolve o trecho ao vídeo.</p>

      <div className="painel__corpo pilha">
        {plan.clips.map((clipe, i) => {
          const ativo = clipe.id === selecionado;
          const ligado = !desligados.has(clipe.id);
          const segundos = duracaoNaTimeline(clipe) / 1000;

          return (
            <article
              key={clipe.id}
              className="trecho"
              data-ativo={ativo || undefined}
              data-desligado={!ligado || undefined}
              style={{ ['--cor-funcao' as string]: corDaFuncao(clipe.role) }}
            >
              {/* Miniatura: o quadro do meio do trecho. Enquanto o
                  proxy não existe, o gradiente da função ocupa o
                  lugar sem fingir um frame que não temos. */}
              <button
                type="button"
                className="trecho__miniatura"
                onClick={() => onSelecionar(ativo ? null : clipe.id)}
                aria-label={`Selecionar trecho ${i + 1}: ${nomeDaFuncao(clipe.role)}`}
                style={{
                  background: `linear-gradient(160deg, ${corDaFuncao(clipe.role)}, var(--surface-2))`,
                }}
              >
                <span className="trecho__duracao">{segundos.toFixed(1)}s</span>
              </button>

              <button
                type="button"
                className="trecho__texto"
                onClick={() => onSelecionar(ativo ? null : clipe.id)}
                aria-pressed={ativo}
              >
                <strong style={{ fontSize: 14 }}>
                  {i + 1}. {nomeDaFuncao(clipe.role)}
                </strong>
                <p className="trecho__motivo">{clipe.reason}</p>

                {/* De onde saiu na gravação: a promessa de integridade
                    editorial só é verificável se a origem estiver à
                    vista. */}
                <span className="trecho__origem">
                  Da gravação: {tempo(clipe.sourceStartMs)} – {tempo(clipe.sourceEndMs)}
                </span>

                {clipe.semanticRisk === 'high' && (
                  <span className="selo selo--aviso" style={{ marginTop: 'var(--e2)' }}>
                    <IconeAviso size={12} />
                    Revisar sentido
                  </span>
                )}
              </button>

              <span className="trecho__acoes">
                <button
                  type="button"
                  role="switch"
                  aria-checked={ligado}
                  aria-label={`${ligado ? 'Desligar' : 'Ligar'} o trecho ${nomeDaFuncao(clipe.role)}`}
                  className="chave"
                  onClick={() => onAlternar(clipe.id)}
                >
                  <span className="chave__bola" aria-hidden />
                </button>

                <span style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="botao-icone botao-icone--pequeno"
                    aria-label={`Mais opções do trecho ${i + 1}`}
                    aria-expanded={menu === clipe.id}
                    onClick={() => setMenu((m) => (m === clipe.id ? null : clipe.id))}
                  >
                    <IconeMenu size={16} />
                  </button>
                  {menu === clipe.id && (
                    <span className="menu" style={{ right: 0, left: 'auto' }}>
                      <button
                        type="button"
                        className="menu__item"
                        onClick={() => {
                          setMenu(null);
                          onOperacao({ op: 'duplicar_clipe', clipId: clipe.id });
                        }}
                      >
                        Duplicar trecho
                      </button>
                      <button
                        type="button"
                        className="menu__item menu__item--perigo"
                        onClick={() => {
                          setMenu(null);
                          onOperacao({ op: 'alternar_clipe', clipId: clipe.id, enabled: false });
                        }}
                      >
                        Remover da timeline
                      </button>
                    </span>
                  )}
                </span>
              </span>
            </article>
          );
        })}

      </div>
    </>
  );
}
