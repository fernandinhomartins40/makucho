'use client';

// ============================================================
// Painel direito — propriedades do que está selecionado.
//
// Equivale ao PropertiesPanel do OpenCut. Sem seleção, mostra as
// propriedades do vídeo inteiro; com um trecho selecionado, mostra
// as dele.
//
// É aqui que o usuário discorda da IA: ajusta o corte, muda a ordem,
// tira o trecho. A proposta chega pronta, mas não é imposta.
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

const NOME_DO_FRAMEWORK: Record<string, string> = {
  authority_education: 'Autoridade educacional',
  viral_education: 'Viral educativo',
  storytelling: 'Storytelling',
  pas: 'Problema → Agitação → Solução',
  sales: 'Venda',
};

interface Props {
  plan: EditPlanV1;
  clipId: string | null;
  onOperacao: (op: TimelineOperation) => void;
}

function tempo(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function PainelDePropriedades({ plan, clipId, onOperacao }: Props) {
  const clipe = plan.clips.find((c) => c.id === clipId);

  // ---------- Sem seleção: o vídeo inteiro ----------
  if (!clipe) {
    const duracao = plan.clips.reduce(
      (t, c) => t + (c.sourceEndMs - c.sourceStartMs),
      0,
    );
    const reducao = Math.round((1 - duracao / plan.sourceDurationMs) * 100);

    return (
      <div style={{ padding: 12, height: '100%', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 12 }}>
          VÍDEO
        </h2>

        <Propriedade rotulo="Duração" valor={`${(duracao / 1000).toFixed(1)}s`} />
        <Propriedade
          rotulo="Gravação original"
          valor={`${Math.round(plan.sourceDurationMs / 60_000)} min`}
        />
        <Propriedade rotulo="Redução" valor={`${reducao}%`} />
        <Propriedade rotulo="Trechos" valor={String(plan.clips.length)} />
        <Propriedade
          rotulo="Estrutura"
          valor={NOME_DO_FRAMEWORK[plan.framework] ?? plan.framework}
        />
        <Propriedade rotulo="Formato" valor="1080 × 1920 · 30 fps" />

        <div style={{ marginTop: 18 }}>
          <label className="campo-rotulo">Legendas</label>
          <button
            type="button"
            className="botao botao-secundario botao-largo"
            style={{ minHeight: 40, fontSize: 13 }}
            onClick={() =>
              onOperacao({
                op: 'trocar_estilo_legenda',
                styleId: plan.captions.styleId,
              })
            }
          >
            {plan.captions.enabled ? 'Ativadas' : 'Desativadas'} ·{' '}
            {plan.captions.wordsPerBlock} palavras
          </button>
          <p className="campo-ajuda">
            Cada palavra acende no instante em que é falada.
          </p>
        </div>

        <p
          style={{
            marginTop: 20,
            fontSize: 11,
            color: 'var(--texto-suave)',
            lineHeight: 1.45,
          }}
        >
          Selecione um trecho na timeline para ajustá-lo.
        </p>
      </div>
    );
  }

  // ---------- Com seleção: o trecho ----------
  const duracaoMs = clipe.sourceEndMs - clipe.sourceStartMs;
  const posicao = plan.clips.findIndex((c) => c.id === clipe.id);
  const ultimo = plan.clips.length === 1;

  const trocarCom = (outro: number) => {
    const ordem = plan.clips.map((c) => c.id);
    const a = ordem[posicao];
    const b = ordem[outro];
    if (!a || !b) return;
    ordem[posicao] = b;
    ordem[outro] = a;
    onOperacao({ op: 'reordenar', clipIds: ordem });
  };

  // Passos de meio segundo: ajuste quadro a quadro exigiria uma
  // precisão que o mouse não entrega numa timeline compacta.
  const ajustar = (ladoInicio: boolean, deltaMs: number) => {
    const inicio = ladoInicio ? clipe.sourceStartMs + deltaMs : clipe.sourceStartMs;
    const fim = ladoInicio ? clipe.sourceEndMs : clipe.sourceEndMs + deltaMs;

    // Abaixo de 1s não é um trecho: é um tique.
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
    <div style={{ padding: 12, height: '100%', overflowY: 'auto' }}>
      <h2 style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 10 }}>
        TRECHO {posicao + 1}
      </h2>

      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
        {NOME_DA_FUNCAO[clipe.role] ?? clipe.role}
      </div>

      {/* Por que a IA escolheu. O contexto mestre (seção 13) proíbe
          caixa preta: sem o motivo, não há como discordar. */}
      <div
        style={{
          padding: 10,
          borderRadius: 8,
          background: 'var(--azul-profundo)',
          border: '1px solid var(--borda)',
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 10, color: 'var(--texto-suave)', marginBottom: 4 }}>
          POR QUE ESTE TRECHO
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.45 }}>{clipe.reason}</p>
      </div>

      {clipe.semanticRisk === 'high' && (
        <div className="aviso aviso-atencao" style={{ fontSize: 11, padding: 10 }}>
          Fora do contexto original, este trecho pode mudar de sentido.
        </div>
      )}

      <Propriedade rotulo="Duração" valor={`${(duracaoMs / 1000).toFixed(1)}s`} />
      <Propriedade
        rotulo="No original"
        valor={`${tempo(clipe.sourceStartMs)} – ${tempo(clipe.sourceEndMs)}`}
      />

      <div style={{ marginTop: 16 }}>
        <label className="campo-rotulo">Início</label>
        <div className="linha" style={{ gap: 6 }}>
          <BotaoPequeno onClick={() => ajustar(true, -500)}>−0,5s</BotaoPequeno>
          <BotaoPequeno onClick={() => ajustar(true, 500)}>+0,5s</BotaoPequeno>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="campo-rotulo">Fim</label>
        <div className="linha" style={{ gap: 6 }}>
          <BotaoPequeno onClick={() => ajustar(false, -500)}>−0,5s</BotaoPequeno>
          <BotaoPequeno onClick={() => ajustar(false, 500)}>+0,5s</BotaoPequeno>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="campo-rotulo">Posição</label>
        <div className="linha" style={{ gap: 6 }}>
          <BotaoPequeno disabled={posicao === 0} onClick={() => trocarCom(posicao - 1)}>
            ↑ Antes
          </BotaoPequeno>
          <BotaoPequeno
            disabled={posicao === plan.clips.length - 1}
            onClick={() => trocarCom(posicao + 1)}
          >
            ↓ Depois
          </BotaoPequeno>
        </div>
      </div>

      {/* "Remover" desativa: a seção 13 exige poder restaurar um
          trecho descartado. */}
      <button
        type="button"
        className="botao botao-secundario botao-largo"
        disabled={ultimo}
        onClick={() =>
          onOperacao({ op: 'alternar_clipe', clipId: clipe.id, enabled: false })
        }
        style={{
          marginTop: 18,
          minHeight: 40,
          fontSize: 13,
          color: ultimo ? undefined : 'var(--vermelho)',
        }}
      >
        Remover trecho
      </button>
      {ultimo && <p className="campo-ajuda">O vídeo precisa de ao menos um trecho.</p>}
    </div>
  );
}

function Propriedade({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="linha entre" style={{ fontSize: 12, padding: '5px 0' }}>
      <span style={{ color: 'var(--texto-suave)' }}>{rotulo}</span>
      <span>{valor}</span>
    </div>
  );
}

function BotaoPequeno({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        minHeight: 36,
        borderRadius: 8,
        border: '1px solid var(--borda)',
        background: 'transparent',
        color: disabled ? 'var(--texto-suave)' : 'var(--texto)',
        fontSize: 12,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
