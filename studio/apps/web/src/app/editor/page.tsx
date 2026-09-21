'use client';

// ============================================================
// Editor — timeline sobre a proposta da IA (ADR 0008).
//
// A IA propoe; o usuario ajusta. As operacoes passam pelo mesmo
// schema do EditPlan, entao a timeline nao tem caminho mais
// permissivo que o da IA.
//
// Por ora com um plano de demonstracao: ligar a API entra junto com
// a Fase 5, quando houver proposta de verdade para exibir.
// ============================================================

import { useCallback, useState } from 'react';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { aplicarOperacao } from '@makucho/studio-contracts';
import { Timeline } from '../../components/timeline/Timeline';

// Baseado no exemplo da secao 4 do contexto mestre: o bruto de oito
// minutos que vira um Reel de ~55s.
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
      reason: 'Frase direta com consequência financeira',
    },
    {
      id: 'c2', sourceStartMs: 271_100, sourceEndMs: 277_600, timelineStartMs: 6_700,
      role: 'authority', transcriptSegmentIds: ['s2'], semanticRisk: 'low',
      reason: 'Demonstra experiência recorrente',
    },
    {
      id: 'c3', sourceStartMs: 370_000, sourceEndMs: 374_200, timelineStartMs: 13_200,
      role: 'cta', transcriptSegmentIds: ['s3'], semanticRisk: 'low',
      reason: 'Fechamento com ação clara',
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
  // Guarda os planos anteriores: cada operacao vira uma versao, e
  // desfazer e requisito da secao 13 do contexto mestre.
  const [historico, setHistorico] = useState<EditPlanV1[]>([]);

  const executar = useCallback(
    (operacao: TimelineOperation) => {
      const resultado = aplicarOperacao(plano, operacao);

      if (!resultado.ok || !resultado.plan) {
        // A recusa vem com o motivo: o usuario precisa saber por que
        // o ajuste nao foi aceito, nao so que falhou.
        setErro(resultado.erro ?? 'não foi possível aplicar o ajuste');
        return;
      }

      setHistorico((h) => [...h, plano]);
      setPlano(resultado.plan);
      setErro(null);
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

  const clipe = plano.clips.find((c) => c.id === selecionado);

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--borda)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 16, color: 'var(--azul)' }}>Editor</h1>
        <button
          type="button"
          onClick={desfazer}
          disabled={historico.length === 0}
          style={{
            marginLeft: 'auto',
            height: 36,
            padding: '0 14px',
            borderRadius: 8,
            border: '1px solid var(--borda)',
            background: 'transparent',
            color: historico.length === 0 ? 'var(--texto-suave)' : 'var(--texto)',
            cursor: historico.length === 0 ? 'default' : 'pointer',
            fontSize: 13,
          }}
        >
          ↩ Desfazer
        </button>
      </header>

      {erro && (
        <div
          role="alert"
          style={{
            margin: 16,
            padding: 12,
            borderRadius: 8,
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid #ef4444',
            fontSize: 13,
          }}
        >
          {erro}
        </div>
      )}

      {/* Preview entra aqui quando o proxy existir (Fase 4). */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--texto-suave)',
          fontSize: 13,
        }}
      >
        {clipe
          ? `${clipe.role} — ${(clipe.sourceStartMs / 1000).toFixed(1)}s a ${(clipe.sourceEndMs / 1000).toFixed(1)}s do original`
          : 'selecione um trecho na timeline'}
      </div>

      <Timeline
        plan={plano}
        posicaoMs={posicaoMs}
        onSeek={setPosicaoMs}
        onOperacao={executar}
        clipeSelecionado={selecionado}
        onSelecionar={setSelecionado}
      />
    </main>
  );
}
