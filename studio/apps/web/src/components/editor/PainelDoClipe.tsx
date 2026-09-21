'use client';

// ============================================================
// Painel do trecho selecionado.
//
// A tela de sugestao que o plano descreve na secao 14.1: o que a IA
// escolheu, POR QUE escolheu, e de onde no original aquilo veio.
//
// Explicar a decisao e requisito, nao enfeite -- o contexto mestre
// (secao 13) e explicito: "nao criar uma caixa preta".
// ============================================================

import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';

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
  clipId: string | null;
  onOperacao: (op: TimelineOperation) => void;
  onFechar: () => void;
}

function formatarTempo(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function PainelDoClipe({ plan, clipId, onOperacao, onFechar }: Props) {
  const clipe = plan.clips.find((c) => c.id === clipId);

  if (!clipe) {
    return (
      <div className="vazio" style={{ padding: '24px 16px' }}>
        <div className="vazio-icone">✂</div>
        <p style={{ fontSize: 13 }}>Toque em um trecho da timeline para ajustá-lo.</p>
      </div>
    );
  }

  const duracaoMs = clipe.sourceEndMs - clipe.sourceStartMs;
  const posicao = plan.clips.findIndex((c) => c.id === clipe.id);
  const ultimo = plan.clips.length === 1;

  const trocarCom = (outroIndice: number) => {
    const ordem = plan.clips.map((c) => c.id);
    const atual = ordem[posicao];
    const outro = ordem[outroIndice];
    if (!atual || !outro) return;
    ordem[posicao] = outro;
    ordem[outroIndice] = atual;
    onOperacao({ op: 'reordenar', clipIds: ordem });
  };

  // Encurtar pelas bordas em passos de meio segundo. Ajuste fino
  // quadro a quadro exigiria precisao que nao se tem no toque.
  const ajustar = (ladoInicio: boolean, deltaMs: number) => {
    const inicio = ladoInicio ? clipe.sourceStartMs + deltaMs : clipe.sourceStartMs;
    const fim = ladoInicio ? clipe.sourceEndMs : clipe.sourceEndMs + deltaMs;

    // Menos de 1s nao e um trecho: e um tique.
    if (fim - inicio < 1000) return;
    if (inicio < 0 || fim > plan.sourceDurationMs) return;

    onOperacao({
      op: 'ajustar_corte',
      clipId: clipe.id,
      sourceStartMs: Math.round(inicio),
      sourceEndMs: Math.round(fim),
    });
  };

  return (
    <div style={{ padding: 16 }}>
      <div className="linha entre" style={{ marginBottom: 12 }}>
        <div className="linha">
          <strong style={{ fontSize: 15 }}>
            {NOME_DA_FUNCAO[clipe.role] ?? clipe.role}
          </strong>
          {clipe.semanticRisk === 'high' && (
            <span className="etiqueta" style={{ color: '#f97316' }}>
              risco alto
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar painel"
          className="botao botao-secundario"
          style={{ minHeight: 32, padding: '0 10px', fontSize: 13 }}
        >
          ✕
        </button>
      </div>

      {/* Por que a IA escolheu este trecho. Sem isto a edicao vira
          caixa preta -- o que o contexto mestre proibe. */}
      <div className="cartao" style={{ marginBottom: 12, padding: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 4 }}>
          POR QUE ESTE TRECHO
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.5 }}>{clipe.reason}</p>
      </div>

      {/* De onde veio no original: e o que torna a fala rastreavel. */}
      <div className="linha entre" style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 16 }}>
        <span>
          Original: {formatarTempo(clipe.sourceStartMs)} – {formatarTempo(clipe.sourceEndMs)}
        </span>
        <span>{(duracaoMs / 1000).toFixed(1)}s</span>
      </div>

      {clipe.semanticRisk === 'high' && (
        <div className="aviso aviso-atencao">
          Este trecho pode mudar de sentido fora do contexto original. Confira antes
          de finalizar.
        </div>
      )}

      {/* ---------- Ajuste do corte ---------- */}
      <div className="campo-rotulo">Início do trecho</div>
      <div className="linha" style={{ marginBottom: 14 }}>
        <button type="button" className="botao botao-secundario" onClick={() => ajustar(true, -500)}>
          −0,5s
        </button>
        <button type="button" className="botao botao-secundario" onClick={() => ajustar(true, 500)}>
          +0,5s
        </button>
      </div>

      <div className="campo-rotulo">Fim do trecho</div>
      <div className="linha" style={{ marginBottom: 20 }}>
        <button type="button" className="botao botao-secundario" onClick={() => ajustar(false, -500)}>
          −0,5s
        </button>
        <button type="button" className="botao botao-secundario" onClick={() => ajustar(false, 500)}>
          +0,5s
        </button>
      </div>

      {/* ---------- Ordem ---------- */}
      <div className="campo-rotulo">Posição no vídeo</div>
      <div className="linha" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className="botao botao-secundario"
          disabled={posicao === 0}
          onClick={() => trocarCom(posicao - 1)}
        >
          ↑ Antes
        </button>
        <button
          type="button"
          className="botao botao-secundario"
          disabled={posicao === plan.clips.length - 1}
          onClick={() => trocarCom(posicao + 1)}
        >
          ↓ Depois
        </button>
        <span style={{ fontSize: 12, color: 'var(--texto-suave)', marginLeft: 'auto' }}>
          {posicao + 1} de {plan.clips.length}
        </span>
      </div>

      {/* Remover e "desativar": o contexto mestre (secao 13) exige
          poder restaurar um trecho descartado. */}
      <button
        type="button"
        className="botao botao-largo botao-secundario"
        disabled={ultimo}
        onClick={() => onOperacao({ op: 'alternar_clipe', clipId: clipe.id, enabled: false })}
        style={{ color: ultimo ? undefined : 'var(--vermelho)' }}
      >
        Remover do vídeo
      </button>
      {ultimo && (
        <p className="campo-ajuda">O vídeo precisa de ao menos um trecho.</p>
      )}
    </div>
  );
}
