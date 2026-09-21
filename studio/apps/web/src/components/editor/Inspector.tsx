'use client';

// ============================================================
// Inspector contextual — direita do editor.
//
// Sem seleção: propriedades do vídeo. Com um trecho selecionado: as
// dele, e é aqui que o usuário discorda da IA.
//
// "Remover" desativa em vez de apagar: a seção 13 do contexto mestre
// exige poder restaurar um trecho descartado.
// ============================================================

import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { nomeDaFuncao, corDaFuncao, tempo } from './funcoes';
import { IconeIA, IconeAviso, IconeLixeira, IconeAvancar, IconeVoltar } from '../icones';

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

export function Inspector({ plan, clipId, onOperacao }: Props) {
  const clipe = plan.clips.find((c) => c.id === clipId);

  // ---------- Sem seleção: o vídeo inteiro ----------
  if (!clipe) {
    const duracao = plan.clips.reduce(
      (t, c) => t + (c.sourceEndMs - c.sourceStartMs),
      0,
    );
    const reducao = Math.round((1 - duracao / plan.sourceDurationMs) * 100);

    return (
      <div style={{ padding: 'var(--e4)' }}>
        <h2 className="rotulo-secao" style={{ marginBottom: 'var(--e3)' }}>
          Vídeo
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

        <div className="campo" style={{ marginTop: 'var(--e5)' }}>
          <span className="campo__rotulo">Legendas</span>
          <button
            type="button"
            className="botao botao--secundario botao--largo"
            onClick={() =>
              onOperacao({ op: 'trocar_estilo_legenda', styleId: plan.captions.styleId })
            }
          >
            {plan.captions.enabled ? 'Ativadas' : 'Desativadas'} ·{' '}
            {plan.captions.wordsPerBlock} palavras
          </button>
          <p className="campo__ajuda">
            Cada palavra acende no instante em que é falada.
          </p>
        </div>

        <p
          className="texto-secundario"
          style={{ marginTop: 'var(--e5)', fontSize: 12, lineHeight: 1.45 }}
        >
          Selecione um trecho para ajustá-lo.
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
    <div style={{ padding: 'var(--e4)' }}>
      <h2 className="rotulo-secao" style={{ marginBottom: 'var(--e2)' }}>
        Trecho {posicao + 1} de {plan.clips.length}
      </h2>

      <div className="linha" style={{ gap: 'var(--e2)', marginBottom: 'var(--e4)' }}>
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: corDaFuncao(clipe.role),
            flexShrink: 0,
          }}
        />
        <strong style={{ fontSize: 16 }}>{nomeDaFuncao(clipe.role)}</strong>
      </div>

      {/* Por que a IA escolheu. Sem o motivo, não há como discordar. */}
      <div className="cartao" style={{ padding: 'var(--e3)', marginBottom: 'var(--e4)' }}>
        <span
          className="rotulo-secao linha"
          style={{ gap: 'var(--e1)', marginBottom: 'var(--e2)' }}
        >
          <IconeIA size={12} weight="fill" color="var(--accent)" />
          Por que este trecho
        </span>
        <p style={{ fontSize: 13, lineHeight: 1.45 }}>{clipe.reason}</p>
      </div>

      {clipe.semanticRisk === 'high' && (
        <div className="aviso aviso--atencao" style={{ marginBottom: 'var(--e4)' }}>
          <IconeAviso size={16} />
          <span>Fora do contexto original, este trecho pode mudar de sentido.</span>
        </div>
      )}

      <Propriedade rotulo="Duração" valor={`${(duracaoMs / 1000).toFixed(1)}s`} />
      <Propriedade
        rotulo="No original"
        valor={`${tempo(clipe.sourceStartMs)} – ${tempo(clipe.sourceEndMs)}`}
      />

      <div className="campo" style={{ marginTop: 'var(--e4)' }}>
        <span className="campo__rotulo">Início</span>
        <div className="linha" style={{ gap: 'var(--e2)' }}>
          <Ajuste onClick={() => ajustar(true, -500)}>−0,5s</Ajuste>
          <Ajuste onClick={() => ajustar(true, 500)}>+0,5s</Ajuste>
        </div>
      </div>

      <div className="campo">
        <span className="campo__rotulo">Fim</span>
        <div className="linha" style={{ gap: 'var(--e2)' }}>
          <Ajuste onClick={() => ajustar(false, -500)}>−0,5s</Ajuste>
          <Ajuste onClick={() => ajustar(false, 500)}>+0,5s</Ajuste>
        </div>
      </div>

      <div className="campo">
        <span className="campo__rotulo">Posição</span>
        <div className="linha" style={{ gap: 'var(--e2)' }}>
          <Ajuste disabled={posicao === 0} onClick={() => trocarCom(posicao - 1)}>
            <IconeVoltar size={13} />
            Antes
          </Ajuste>
          <Ajuste
            disabled={posicao === plan.clips.length - 1}
            onClick={() => trocarCom(posicao + 1)}
          >
            Depois
            <IconeAvancar size={13} />
          </Ajuste>
        </div>
      </div>

      <button
        type="button"
        className="botao botao--perigo botao--largo"
        disabled={ultimo}
        onClick={() => onOperacao({ op: 'alternar_clipe', clipId: clipe.id, enabled: false })}
        style={{ marginTop: 'var(--e5)' }}
      >
        <IconeLixeira size={16} />
        Remover trecho
      </button>
      {ultimo && <p className="campo__ajuda">O vídeo precisa de ao menos um trecho.</p>}
    </div>
  );
}

function Propriedade({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="linha entre" style={{ fontSize: 13, padding: '5px 0' }}>
      <span className="texto-secundario">{rotulo}</span>
      <span>{valor}</span>
    </div>
  );
}

function Ajuste({
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
      className="botao botao--secundario botao--pequeno"
      style={{ flex: 1 }}
    >
      {children}
    </button>
  );
}
