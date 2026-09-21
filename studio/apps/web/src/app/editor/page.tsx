'use client';

// ============================================================
// Editor — a tela de sugestão do plano (seção 14.1).
//
// Mostra o que a IA propôs, por que propôs, e deixa ajustar. O que
// o plano pede nessa tela: duração original e sugerida, sequência de
// blocos, motivo de cada escolha, avisos semânticos, preview e as
// ações de aceitar, trocar e editar.
//
// A IA dirige; o usuário corrige. Toda mudança passa pelo mesmo
// schema do EditPlan — a timeline não tem caminho mais permissivo
// que o da proposta automática.
// ============================================================

import { useCallback, useMemo, useState } from 'react';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { aplicarOperacao } from '@makucho/studio-contracts';
import { Timeline } from '../../components/timeline/Timeline';
import { Preview } from '../../components/editor/Preview';
import { PainelDoClipe } from '../../components/editor/PainelDoClipe';

// Exemplo da seção 4 do contexto mestre: o bruto de oito minutos que
// vira um Reel de ~17s. Some quando a Fase 5 trouxer a proposta real.
const PLANO_DEMO: EditPlanV1 = {
  schemaVersion: '1.0',
  projectId: 'demo',
  sourceMediaId: 'demo-media',
  sourceDurationMs: 480_000,
  fps: 30,
  canvas: { aspectRatio: '9:16', width: 1080, height: 1920 },
  targetDurationMs: 17_400,
  framework: 'authority_education',
  clips: [
    {
      id: 'c1', sourceStartMs: 138_200, sourceEndMs: 144_900, timelineStartMs: 0,
      role: 'hook', transcriptSegmentIds: ['s1'], semanticRisk: 'low',
      reason: 'Frase direta, com consequência financeira e curiosidade — segura os primeiros segundos.',
    },
    {
      id: 'c2', sourceStartMs: 271_100, sourceEndMs: 277_600, timelineStartMs: 6_700,
      role: 'authority', transcriptSegmentIds: ['s2'], semanticRisk: 'low',
      reason: 'Demonstra experiência recorrente antes de qualquer apresentação pessoal.',
    },
    {
      id: 'c3', sourceStartMs: 370_000, sourceEndMs: 374_200, timelineStartMs: 13_200,
      role: 'cta', transcriptSegmentIds: ['s3'], semanticRisk: 'low',
      reason: 'Fechamento com ação clara e verificável.',
    },
  ],
  captions: {
    enabled: true, styleId: 'padrao', wordsPerBlock: 3,
    position: 'bottom', highlightActiveWord: true,
  },
  overlays: [],
  soundEffects: [],
  transitions: [],
  render: {
    fps: 30, videoCodec: 'h264', audioCodec: 'aac',
    crf: 23, audioBitrateKbps: 128, loudnessTargetLufs: -14,
  },
};

export default function EditorPage() {
  const [plano, setPlano] = useState<EditPlanV1>(PLANO_DEMO);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [posicaoMs, setPosicaoMs] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [historico, setHistorico] = useState<EditPlanV1[]>([]);

  const duracaoMs = useMemo(
    () => plano.clips.reduce((t, c) => t + (c.sourceEndMs - c.sourceStartMs), 0),
    [plano.clips],
  );

  const executar = useCallback(
    (operacao: TimelineOperation) => {
      const resultado = aplicarOperacao(plano, operacao);

      if (!resultado.ok || !resultado.plan) {
        // A recusa vem com o motivo: o usuário precisa saber POR QUE
        // o ajuste não foi aceito, não apenas que falhou.
        setErro(resultado.erro ?? 'não foi possível aplicar o ajuste');
        return;
      }

      setHistorico((h) => [...h, plano]);
      setPlano(resultado.plan);
      setErro(null);

      // O trecho removido deixa de existir: manter a seleção mostraria
      // um painel de algo que não está mais no vídeo.
      if (operacao.op === 'alternar_clipe' && !operacao.enabled) {
        setSelecionado(null);
      }
    },
    [plano],
  );

  const desfazer = useCallback(() => {
    setHistorico((h) => {
      const anterior = h[h.length - 1];
      if (!anterior) return h;
      setPlano(anterior);
      setErro(null);
      return h.slice(0, -1);
    });
  }, []);

  const reducao = Math.round((1 - duracaoMs / plano.sourceDurationMs) * 100);
  const temRiscoAlto = plano.clips.some((c) => c.semanticRisk === 'high');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {/* ---------- Cabeçalho ---------- */}
      <header
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--borda)',
          flexShrink: 0,
        }}
      >
        <div className="linha entre">
          <div>
            <h1 style={{ fontSize: 17, marginBottom: 2 }}>Sugestão da IA</h1>
            <div style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
              {(plano.sourceDurationMs / 60_000).toFixed(0)}min → {(duracaoMs / 1000).toFixed(0)}s
              {reducao > 0 && ` · ${reducao}% mais curto`}
            </div>
          </div>

          <button
            type="button"
            onClick={desfazer}
            disabled={historico.length === 0}
            className="botao botao-secundario"
            style={{ minHeight: 40, padding: '0 14px', fontSize: 13 }}
          >
            ↩ Desfazer
          </button>
        </div>
      </header>

      {/* ---------- Área rolável ---------- */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {erro && (
          <div className="aviso aviso-erro" role="alert">
            {erro}
          </div>
        )}

        {temRiscoAlto && (
          <div className="aviso aviso-atencao">
            Há trechos que podem mudar de sentido fora do contexto original.
            Confira antes de finalizar.
          </div>
        )}

        <Preview plan={plano} posicaoMs={posicaoMs} onPosicao={setPosicaoMs} />

        {/* Sequência de blocos, como o plano pede na seção 14.1. */}
        <div style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 13, color: 'var(--texto-suave)', marginBottom: 8 }}>
            ESTRUTURA DO VÍDEO
          </h2>
          <div className="pilha">
            {plano.clips.map((clipe, i) => {
              const dur = (clipe.sourceEndMs - clipe.sourceStartMs) / 1000;
              const ativo = clipe.id === selecionado;
              return (
                <button
                  key={clipe.id}
                  type="button"
                  onClick={() => setSelecionado(ativo ? null : clipe.id)}
                  className="cartao cartao-clicavel"
                  style={{
                    textAlign: 'left',
                    marginBottom: 0,
                    padding: 12,
                    borderColor: ativo ? 'var(--azul)' : undefined,
                    cursor: 'pointer',
                    font: 'inherit',
                    color: 'inherit',
                    width: '100%',
                  }}
                >
                  <div className="linha entre">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {i + 1}. {clipe.role}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
                      {dur.toFixed(1)}s
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--texto-suave)',
                      marginTop: 4,
                      lineHeight: 1.4,
                    }}
                  >
                    {clipe.reason}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {selecionado && (
          <div className="cartao" style={{ marginTop: 16, padding: 0 }}>
            <PainelDoClipe
              plan={plano}
              clipId={selecionado}
              onOperacao={executar}
              onFechar={() => setSelecionado(null)}
            />
          </div>
        )}

        <button
          type="button"
          className="botao botao-largo"
          style={{ marginTop: 20 }}
          onClick={() => setErro('O render entra na Fase 7. A proposta já está pronta.')}
        >
          Gerar vídeo
        </button>
      </div>

      {/* ---------- Timeline ---------- */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--borda)' }}>
        <Timeline
          plan={plano}
          posicaoMs={posicaoMs}
          onSeek={setPosicaoMs}
          onOperacao={executar}
          clipeSelecionado={selecionado}
          onSelecionar={setSelecionado}
        />
      </div>
    </div>
  );
}
