'use client';

// ============================================================
// Painel de refino — as chamadas #4 e #6.
//
// Duas ações sob demanda, abaixo da proposta: "Adicionar trecho com
// IA" procura o que ficou de fora, e "Aprimorar cortes" ajusta as
// bordas do que já está montado.
//
// NADA AQUI APLICA SOZINHO. Cada sugestão vira uma operação de
// timeline num clique, e o usuário vê o que muda antes de aceitar
// (plano, seção 26.3). Um aprimoramento que reescreve a timeline
// inteira tira a chance de discordar de uma parte só.
//
// Por que não rodam ao abrir: custam dinheiro e consomem o teto do
// mês. A #2 roda sozinha porque é barata e o roteiro muda a cada
// tecla; estas duas operam sobre uma timeline estável, e disparar
// sem pedir seria gastar o teto de quem só queria olhar o editor.
// ============================================================

import { useState } from 'react';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { ia as apiIa } from '../../lib/api';
import type { AjusteDaIa, CandidatoDaIa } from '../../lib/api';
import { nomeDaFuncao, corDaFuncao, tempo } from './funcoes';
import { IconeIA, IconeMais, IconeAviso, IconeCheck } from '../icones';

interface Props {
  projectId: string | null;
  plan: EditPlanV1;
  onOperacao: (op: TimelineOperation) => void;
}

export function PainelDeRefino({ projectId, plan, onOperacao }: Props) {
  const [candidatos, setCandidatos] = useState<CandidatoDaIa[] | null>(null);
  const [ajustes, setAjustes] = useState<AjusteDaIa[] | null>(null);
  const [silencios, setSilencios] = useState(0);
  const [carregando, setCarregando] = useState<'candidatos' | 'refino' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const buscarCandidatos = async () => {
    if (!projectId) return;
    setCarregando('candidatos');
    setErro(null);
    try {
      const r = await apiIa.candidatos(projectId);
      setCandidatos(r.candidatos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível buscar trechos.');
    } finally {
      setCarregando(null);
    }
  };

  const buscarRefino = async () => {
    if (!projectId) return;
    setCarregando('refino');
    setErro(null);
    try {
      const r = await apiIa.refinar(projectId);
      setAjustes(r.ajustes);
      setSilencios(r.silenciosRemoviveis);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível analisar os cortes.');
    } finally {
      setCarregando(null);
    }
  };

  /**
   * Aplica um candidato: vira `inserir`, a operação de sempre.
   *
   * Some da lista depois de aplicado. Uma sugestão que continua
   * visível convida a clicar de novo, e o segundo clique inseriria o
   * mesmo trecho duas vezes.
   */
  const inserir = (c: CandidatoDaIa) => {
    onOperacao({
      op: 'inserir',
      sourceStartMs: c.sourceStartMs,
      sourceEndMs: c.sourceEndMs,
      role: c.role as never,
      transcriptSegmentIds: c.transcriptSegmentIds,
      reason: c.reason,
      semanticRisk: c.semanticRisk as never,
      // `apos` vem como índice; a operação quer o id, que é o que
      // sobrevive a uma reordenação.
      aposClipId: c.apos !== undefined ? plan.clips[c.apos]?.id : undefined,
    });
    setCandidatos((atual) => (atual ?? []).filter((x) => x !== c));
  };

  /** Aplica um ajuste: vira `ajustar_corte`, reversível num desfazer. */
  const ajustar = (a: AjusteDaIa) => {
    const alvo = plan.clips[a.clipIndex];
    if (!alvo) return;

    onOperacao({
      op: 'ajustar_corte',
      clipId: alvo.id,
      sourceStartMs: a.sourceStartMs,
      sourceEndMs: a.sourceEndMs,
    });
    setAjustes((atual) => (atual ?? []).filter((x) => x !== a));
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--e4)', padding: 'var(--e3)' }}>
      {erro && (
        <p className="linha" style={{ gap: 'var(--e2)', fontSize: 12, color: 'var(--danger)' }}>
          <IconeAviso size={13} />
          {erro}
        </p>
      )}

      {/* ---------- #4: adicionar trecho ---------- */}
      <div>
        <button
          type="button"
          className="botao botao--secundario botao--largo"
          disabled={!projectId || carregando !== null}
          onClick={() => void buscarCandidatos()}
        >
          <IconeMais size={15} />
          {carregando === 'candidatos' ? 'Procurando…' : 'Adicionar trecho com IA'}
        </button>

        {candidatos !== null && candidatos.length === 0 && (
          <p className="texto-secundario" style={{ fontSize: 12, marginTop: 'var(--e2)' }}>
            Nenhum trecho que valha a pena acrescentar — o corte já pegou o que
            havia de melhor.
          </p>
        )}

        {candidatos !== null && candidatos.length > 0 && (
          <div className="pilha" style={{ marginTop: 'var(--e3)' }}>
            {candidatos.map((c, i) => (
              <div key={i} className="sugestao" style={{ alignItems: 'start' }}>
                <span
                  aria-hidden
                  style={{
                    width: 3,
                    alignSelf: 'stretch',
                    borderRadius: 2,
                    background: corDaFuncao(c.role),
                  }}
                />
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <span className="linha" style={{ gap: 'var(--e2)', fontSize: 12 }}>
                    <strong>{nomeDaFuncao(c.role)}</strong>
                    <span className="texto-secundario" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {tempo(c.sourceStartMs)} – {tempo(c.sourceEndMs)}
                    </span>
                    {/* Risco alto nunca entra em silêncio: o selo
                        aparece antes de o usuário aceitar. */}
                    {c.semanticRisk !== 'low' && (
                      <span
                        className="linha"
                        style={{ gap: 3, color: 'var(--warning)', fontSize: 11 }}
                      >
                        <IconeAviso size={11} />
                        Revisar sentido
                      </span>
                    )}
                  </span>
                  <span className="texto-secundario" style={{ fontSize: 12, lineHeight: 1.4 }}>
                    {c.reason}
                  </span>
                </div>
                <button
                  type="button"
                  className="botao botao--pequeno"
                  onClick={() => inserir(c)}
                >
                  Inserir
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- #6: aprimorar cortes ---------- */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--e3)' }}>
        <button
          type="button"
          className="botao botao--secundario botao--largo"
          disabled={!projectId || carregando !== null}
          onClick={() => void buscarRefino()}
        >
          <IconeIA size={15} />
          {carregando === 'refino' ? 'Analisando…' : 'Aprimorar cortes'}
        </button>

        {silencios > 0 && (
          /* Os silêncios vêm de MEDIÇÃO, não do modelo: já foram
             detectados na transcrição, pelo FFmpeg. Dizer isso evita
             que o número pareça mais um palpite da IA. */
          <p className="texto-secundario" style={{ fontSize: 12, marginTop: 'var(--e2)' }}>
            {silencios} {silencios === 1 ? 'pausa detectada' : 'pausas detectadas'} na
            gravação, por medição do áudio.
          </p>
        )}

        {ajustes !== null && ajustes.length === 0 && (
          <p
            className="linha"
            style={{ gap: 'var(--e2)', fontSize: 12, marginTop: 'var(--e2)' }}
          >
            <IconeCheck size={13} color="var(--success)" />
            <span className="texto-secundario">
              Os cortes já caem em boas fronteiras — nada a ajustar.
            </span>
          </p>
        )}

        {ajustes !== null && ajustes.length > 0 && (
          <div className="pilha" style={{ marginTop: 'var(--e3)' }}>
            {ajustes.map((a, i) => {
              const alvo = plan.clips[a.clipIndex];
              if (!alvo) return null;

              // O quanto cada borda se move, para o usuário ver o
              // tamanho da mudança antes de aceitar.
              const dInicio = a.sourceStartMs - alvo.sourceStartMs;
              const dFim = a.sourceEndMs - alvo.sourceEndMs;
              const sinal = (ms: number) =>
                `${ms > 0 ? '+' : ''}${(ms / 1000).toFixed(1)}s`;

              return (
                <div key={i} className="sugestao" style={{ alignItems: 'start' }}>
                  <IconeIA size={14} color="var(--accent)" />
                  <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 12 }}>
                      <strong>Trecho {a.clipIndex + 1}</strong>{' '}
                      <span
                        className="texto-secundario"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {dInicio !== 0 && `início ${sinal(dInicio)}`}
                        {dInicio !== 0 && dFim !== 0 && ' · '}
                        {dFim !== 0 && `fim ${sinal(dFim)}`}
                      </span>
                    </span>
                    <span className="texto-secundario" style={{ fontSize: 12, lineHeight: 1.4 }}>
                      {a.reason}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="botao botao--pequeno"
                    onClick={() => ajustar(a)}
                  >
                    Aplicar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
