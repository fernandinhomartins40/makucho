'use client';

// ============================================================
// Painel "Seleção da IA".
//
// O contexto mestre (seção 13) proíbe caixa preta: cada trecho vem
// com o motivo da escolha e com o ponto exato do original de onde
// saiu. Sem isso não há como discordar da IA de forma informada — e
// discordar é o ponto do produto.
//
// O toggle desliga o trecho sem apagá-lo, porque a mesma seção exige
// poder restaurar o que foi descartado.
// ============================================================

import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { corDaFuncao, nomeDaFuncao, tempo } from './funcoes';
import { IconeIA, IconeAviso, IconeArrastar, IconeMenu } from '../icones';

interface Props {
  plan: EditPlanV1;
  selecionado: string | null;
  /** Trechos desligados pelo usuário, que continuam na lista. */
  desligados: Set<string>;
  onSelecionar: (clipId: string | null) => void;
  onAlternar: (clipId: string) => void;
  onOperacao: (op: TimelineOperation) => void;
}

/**
 * Confiança da proposta.
 *
 * Deriva do risco semântico dos trechos: é a informação que o modelo
 * realmente produz. Um número inventado aqui seria pior que nenhum —
 * daria autoridade a um palpite.
 */
function confianca(plan: EditPlanV1): number {
  const peso = { low: 1, medium: 0.7, high: 0.35 } as const;
  const soma = plan.clips.reduce(
    (t, c) => t + (peso[c.semanticRisk as keyof typeof peso] ?? 0.5),
    0,
  );
  return Math.round((soma / Math.max(1, plan.clips.length)) * 100);
}

export function PainelDaIA({
  plan,
  selecionado,
  desligados,
  onSelecionar,
  onAlternar,
}: Props) {
  const minutos = Math.round(plan.sourceDurationMs / 60_000);
  const pct = confianca(plan);

  return (
    <>
      <header className="painel__cabecalho">
        <span className="linha" style={{ gap: 'var(--e2)' }}>
          <IconeIA size={20} weight="fill" color="var(--accent)" />
          <strong style={{ fontSize: 17 }}>Seleção da IA</strong>
        </span>

        <span className="selo selo--sucesso">
          <span className="selo__ponto" aria-hidden />
          {pct}% de confiança
        </span>
      </header>

      <p
        className="texto-secundario"
        style={{ padding: '0 var(--e4) var(--e3)', fontSize: 13, flexShrink: 0 }}
      >
        {plan.clips.length} trechos selecionados de {minutos} min de gravação
      </p>

      <div className="painel__corpo pilha">
        {plan.clips.map((clipe, i) => {
          const ativo = clipe.id === selecionado;
          const ligado = !desligados.has(clipe.id);
          const segundos = (clipe.sourceEndMs - clipe.sourceStartMs) / 1000;

          return (
            <article
              key={clipe.id}
              className="trecho"
              data-ativo={ativo || undefined}
              data-desligado={!ligado || undefined}
              style={{ ['--cor-funcao' as string]: corDaFuncao(clipe.role) }}
            >
              {/* A reordenação por arraste entra junto com o arraste
                  na timeline; por ora a alça é o ponto de agarre
                  visual e a ordem muda pelo inspector. */}
              <span className="trecho__alca" aria-hidden>
                <IconeArrastar size={16} />
              </span>

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

                {/* De onde saiu no bruto: a promessa de integridade
                    editorial só é verificável se a origem estiver à
                    vista. */}
                <span className="trecho__origem">
                  {tempo(clipe.sourceStartMs)} – {tempo(clipe.sourceEndMs)} no original
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

                <button
                  type="button"
                  className="botao-icone botao-icone--pequeno"
                  aria-label={`Mais opções do trecho ${i + 1}`}
                >
                  <IconeMenu size={16} />
                </button>
              </span>
            </article>
          );
        })}

        <button type="button" className="botao botao--tracejado">
          <IconeIA size={16} weight="fill" />
          Adicionar trecho com IA
        </button>
      </div>
    </>
  );
}
