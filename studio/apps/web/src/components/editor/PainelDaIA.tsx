'use client';

// ============================================================
// Painel "Seleção da IA" — 280px.
//
// O contexto mestre (seção 13) proíbe caixa preta: cada trecho vem
// com o motivo da escolha e com o ponto exato do original de onde
// saiu. Sem isso não há como discordar da IA de forma informada — e
// discordar é o ponto do produto.
// ============================================================

import type { EditPlanV1 } from '@makucho/studio-contracts';
import { corDaFuncao, nomeDaFuncao, tempo } from './funcoes';
import { IconeIA, IconeAviso, IconeRelogio } from '../icones';

interface Props {
  plan: EditPlanV1;
  selecionado: string | null;
  onSelecionar: (clipId: string | null) => void;
}

export function PainelDaIA({ plan, selecionado, onSelecionar }: Props) {
  const duracaoMs = plan.clips.reduce(
    (t, c) => t + (c.sourceEndMs - c.sourceStartMs),
    0,
  );
  const minutos = Math.round(plan.sourceDurationMs / 60_000);

  return (
    <>
      <header className="painel__cabecalho">
        <span className="linha" style={{ gap: 'var(--e2)' }}>
          <IconeIA size={16} weight="fill" color="var(--accent)" />
          <strong style={{ fontSize: 14 }}>Seleção da IA</strong>
        </span>
        <span className="texto-secundario" style={{ fontSize: 12 }}>
          {plan.clips.length}
        </span>
      </header>

      <div
        className="texto-secundario"
        style={{
          padding: 'var(--e3) var(--e4)',
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
          lineHeight: 1.45,
          flexShrink: 0,
        }}
      >
        {plan.clips.length} trechos de {minutos} min de gravação, somando{' '}
        {(duracaoMs / 1000).toFixed(0)}s.
      </div>

      <div
        className="pilha"
        style={{ padding: 'var(--e3)', overflowY: 'auto', flex: 1, minHeight: 0 }}
      >
        {plan.clips.map((clipe, i) => {
          const ativo = clipe.id === selecionado;
          const segundos = (clipe.sourceEndMs - clipe.sourceStartMs) / 1000;

          return (
            <button
              key={clipe.id}
              type="button"
              className="trecho"
              aria-pressed={ativo}
              onClick={() => onSelecionar(ativo ? null : clipe.id)}
              style={{ ['--cor-funcao' as string]: corDaFuncao(clipe.role) }}
            >
              <span className="linha entre">
                <strong style={{ fontSize: 13 }}>
                  {i + 1}. {nomeDaFuncao(clipe.role)}
                </strong>
                <span className="texto-secundario" style={{ fontSize: 12 }}>
                  {segundos.toFixed(1)}s
                </span>
              </span>

              <p className="trecho__motivo">{clipe.reason}</p>

              {/* De onde saiu no bruto: a promessa de integridade
                  editorial só é verificável se a origem estiver à
                  vista. */}
              <span
                className="texto-secundario linha"
                style={{ fontSize: 11, gap: 4, marginTop: 'var(--e2)' }}
              >
                <IconeRelogio size={11} />
                {tempo(clipe.sourceStartMs)} – {tempo(clipe.sourceEndMs)} no original
              </span>

              {clipe.semanticRisk === 'high' && (
                <span
                  className="selo selo--aviso"
                  style={{ marginTop: 'var(--e2)', fontSize: 11 }}
                >
                  <IconeAviso size={12} />
                  Revisar sentido
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
