'use client';

// ============================================================
// "O vídeo termina concluindo o assunto?" -- no editor, ao vivo.
//
// A mesma verificação da análise da IA (analisarFechamento), refeita a
// cada edição: aparar o último trecho pode deixá-lo no meio da frase, e
// a pessoa precisa saber antes de exportar. As saídas usam só o que foi
// gravado: estender até o fim da frase, terminar com outro trecho que
// fecha a ideia, ou gravar um fecho. "Manter assim" também é escolha.
// ============================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { analisarFechamento } from '@makucho/studio-contracts';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { IconeAviso } from '../icones';

interface Props {
  plano: EditPlanV1;
  segmentos: Array<{ id: string; startMs: number; endMs: number; texto: string }>;
  desligados: readonly string[];
  onOperacao: (op: TimelineOperation) => void;
}

export function AvisoDeFechamento({ plano, segmentos, desligados, onOperacao }: Props) {
  const analise = useMemo(
    () =>
      analisarFechamento(
        plano,
        segmentos.map((s) => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, text: s.texto })),
        desligados,
      ),
    [plano, segmentos, desligados],
  );
  // "Manter assim" vale para ESTE final: mudou o último trecho, o aviso
  // volta se o problema continuar.
  const ultimo = plano.clips.filter((c) => !desligados.includes(c.id)).at(-1);
  const assinatura = `${analise.problema}-${ultimo?.id}-${ultimo?.sourceEndMs}`;
  const [dispensado, setDispensado] = useState<string | null>(null);

  if (!analise.problema || dispensado === assinatura) return null;

  return (
    <div className="aviso aviso--atencao fechamento" role="status">
      <IconeAviso size={18} />
      <div className="fechamento__corpo">
        <strong>{analise.mensagem}</strong>
        <div className="fechamento__opcoes">
          {analise.estender && (
            <button
              type="button"
              className="botao botao--pequeno"
              title={analise.estender.acrescimo ? `Entra: “${analise.estender.acrescimo}”` : undefined}
              onClick={() =>
                onOperacao({
                  op: 'ajustar_corte',
                  clipId: analise.estender!.clipId,
                  sourceStartMs: analise.estender!.sourceStartMs,
                  sourceEndMs: analise.estender!.sourceEndMs,
                })
              }
            >
              Estender até o fim da frase
            </button>
          )}
          {analise.candidatos.map((c) => (
            <button
              key={c.segmentIds.join('-')}
              type="button"
              className="botao botao--secundario botao--pequeno fechamento__candidato"
              title={c.texto}
              onClick={() =>
                onOperacao({
                  op: 'inserir',
                  sourceStartMs: c.startMs,
                  sourceEndMs: c.endMs,
                  role: 'payoff',
                  transcriptSegmentIds: c.segmentIds,
                  reason: 'Final escolhido para concluir o assunto',
                  semanticRisk: 'low',
                })
              }
            >
              Terminar com: “{c.texto.length > 60 ? `${c.texto.slice(0, 58)}…` : c.texto}”
            </button>
          ))}
          <Link href="/gravar" className="botao botao--fantasma botao--pequeno" title="Grave um fecho curto num vídeo novo">
            Gravar um fecho
          </Link>
          <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => setDispensado(assinatura)}>
            Manter assim
          </button>
        </div>
      </div>
    </div>
  );
}
