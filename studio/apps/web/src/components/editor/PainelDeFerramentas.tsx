'use client';

// ============================================================
// Painel esquerdo — mídia, marca e elementos.
//
// Equivale ao AssetsPanel do OpenCut: abas no topo, conteúdo abaixo.
// A diferença é o que fica na primeira aba: lá são os arquivos que a
// pessoa importou; aqui é a ANÁLISE da IA — os trechos que ela achou
// no bruto, com o motivo de cada escolha.
//
// Isso resume a diferença entre os dois produtos. No OpenCut o
// usuário começa de uma timeline vazia; aqui ele começa de uma
// proposta pronta e corrige o que discordar.
// ============================================================

import { useState } from 'react';
import type { EditPlanV1 } from '@makucho/studio-contracts';

type Aba = 'analise' | 'marca' | 'elementos';

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: 'analise', rotulo: 'Análise' },
  { id: 'marca', rotulo: 'Marca' },
  { id: 'elementos', rotulo: 'Elementos' },
];

const NOME_DA_FUNCAO: Record<string, string> = {
  hook: 'Hook',
  problem: 'Problema',
  context: 'Contexto',
  curiosity_gap: 'Curiosidade',
  authority: 'Autoridade',
  introduction: 'Apresentação',
  proof: 'Prova',
  insight: 'Insight',
  solution: 'Solução',
  pattern_interrupt: 'Quebra de padrão',
  payoff: 'Payoff',
  offer: 'Oferta',
  cta: 'CTA',
};

interface Props {
  plan: EditPlanV1;
  selecionado: string | null;
  onSelecionar: (clipId: string | null) => void;
}

export function PainelDeFerramentas({ plan, selecionado, onSelecionar }: Props) {
  const [aba, setAba] = useState<Aba>('analise');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        role="tablist"
        style={{ display: 'flex', borderBottom: '1px solid var(--borda)', flexShrink: 0 }}
      >
        {ABAS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={aba === item.id}
            onClick={() => setAba(item.id)}
            style={{
              flex: 1,
              minHeight: 38,
              border: 'none',
              background: 'transparent',
              color: aba === item.id ? 'var(--texto)' : 'var(--texto-suave)',
              borderBottom: aba === item.id ? '2px solid var(--azul)' : '2px solid transparent',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {aba === 'analise' && (
          <>
            <p style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 10, lineHeight: 1.4 }}>
              {plan.clips.length} trechos escolhidos de{' '}
              {Math.round(plan.sourceDurationMs / 60_000)} min de gravação.
            </p>

            <div className="pilha">
              {plan.clips.map((clipe, i) => {
                const ativo = clipe.id === selecionado;
                const dur = (clipe.sourceEndMs - clipe.sourceStartMs) / 1000;

                return (
                  <button
                    key={clipe.id}
                    type="button"
                    onClick={() => onSelecionar(ativo ? null : clipe.id)}
                    style={{
                      textAlign: 'left',
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${ativo ? 'var(--azul)' : 'var(--borda)'}`,
                      background: ativo ? 'var(--superficie-alta)' : 'transparent',
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'inherit',
                      width: '100%',
                    }}
                  >
                    <div className="linha entre" style={{ marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        {i + 1}. {NOME_DA_FUNCAO[clipe.role] ?? clipe.role}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
                        {dur.toFixed(1)}s
                      </span>
                    </div>

                    {/* O motivo da escolha. Sem ele a edicao vira caixa
                        preta -- o contexto mestre (secao 13) proibe. */}
                    <p style={{ fontSize: 11, color: 'var(--texto-suave)', lineHeight: 1.35 }}>
                      {clipe.reason}
                    </p>

                    {clipe.semanticRisk === 'high' && (
                      <span
                        className="etiqueta"
                        style={{ marginTop: 5, color: '#f97316', fontSize: 10 }}
                      >
                        revisar sentido
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {aba === 'marca' && (
          <div className="vazio" style={{ padding: '32px 12px' }}>
            <div className="vazio-icone" style={{ fontSize: 28 }}>◈</div>
            <p style={{ fontSize: 12 }}>
              Logo, cores e trilhas aparecem aqui depois de cadastrados em Marca.
            </p>
          </div>
        )}

        {aba === 'elementos' && (
          <div className="vazio" style={{ padding: '32px 12px' }}>
            <div className="vazio-icone" style={{ fontSize: 28 }}>✦</div>
            <p style={{ fontSize: 12 }}>
              Títulos, legendas animadas e chamadas entram na composição final.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
