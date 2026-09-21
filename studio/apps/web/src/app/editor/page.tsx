'use client';

// ============================================================
// Editor — layout de três painéis.
//
// A organização segue o OpenCut (ADR 0009): um grupo vertical
// (conteúdo em cima, timeline embaixo) e, dentro dele, um horizontal
// com ferramentas, preview e propriedades. As divisas são
// arrastáveis e o tamanho é lembrado entre visitas.
//
// A diferença de fundo está no painel esquerdo: lá são os arquivos
// que a pessoa importou; aqui é a análise da IA — os trechos que ela
// achou no bruto, com o motivo de cada escolha. O usuário começa de
// uma proposta pronta, não de uma timeline vazia.
// ============================================================

import { useCallback, useMemo, useState } from 'react';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { aplicarOperacao } from '@makucho/studio-contracts';
import { PainelRedimensionavel } from '../../components/editor/PainelRedimensionavel';
import { PainelDeFerramentas } from '../../components/editor/PainelDeFerramentas';
import { PainelDePropriedades } from '../../components/editor/PainelDePropriedades';
import { Preview } from '../../components/editor/Preview';
import { Timeline } from '../../components/timeline/Timeline';

// Exemplo da seção 4 do contexto mestre: o bruto de oito minutos que
// vira um Reel. Substituído pela proposta real na Fase 5.
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
      // propriedades de algo que não está mais no vídeo.
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {/* ---------- Barra superior ---------- */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 14px',
          borderBottom: '1px solid var(--borda)',
          flexShrink: 0,
          minHeight: 48,
        }}
      >
        <strong style={{ fontSize: 14 }}>Editor</strong>

        <span style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
          {Math.round(plano.sourceDurationMs / 60_000)} min → {(duracaoMs / 1000).toFixed(0)}s
          {reducao > 0 && ` · −${reducao}%`}
        </span>

        <div className="linha" style={{ marginLeft: 'auto', gap: 8 }}>
          <button
            type="button"
            onClick={desfazer}
            disabled={historico.length === 0}
            className="botao botao-secundario"
            style={{ minHeight: 34, padding: '0 12px', fontSize: 12 }}
          >
            ↩ Desfazer
          </button>
          <button
            type="button"
            className="botao"
            style={{ minHeight: 34, padding: '0 16px', fontSize: 12 }}
            onClick={() => setErro('O render entra na Fase 7. A proposta já está pronta.')}
          >
            Gerar vídeo
          </button>
        </div>
      </header>

      {erro && (
        <div
          role="alert"
          className="aviso aviso-erro"
          style={{ margin: '10px 14px 0', flexShrink: 0 }}
        >
          {erro}
        </div>
      )}

      {/* ---------- Conteúdo | Timeline ---------- */}
      <div style={{ flex: 1, minHeight: 0, padding: 10 }}>
        <PainelRedimensionavel
          direcao="vertical"
          tamanhosIniciais={[65, 35]}
          minimos={[30, 15]}
          id="editor-vertical"
        >
          {/* Ferramentas | Preview | Propriedades */}
          <PainelRedimensionavel
            direcao="horizontal"
            tamanhosIniciais={[24, 50, 26]}
            minimos={[15, 30, 15]}
            id="editor-horizontal"
          >
            <div className="cartao" style={{ height: '100%', padding: 0, margin: 0, overflow: 'hidden' }}>
              <PainelDeFerramentas
                plan={plano}
                selecionado={selecionado}
                onSelecionar={setSelecionado}
              />
            </div>

            <div
              style={{
                height: '100%',
                display: 'grid',
                placeItems: 'center',
                padding: 10,
                minWidth: 0,
              }}
            >
              <Preview plan={plano} posicaoMs={posicaoMs} onPosicao={setPosicaoMs} />
            </div>

            <div className="cartao" style={{ height: '100%', padding: 0, margin: 0, overflow: 'hidden' }}>
              <PainelDePropriedades
                plan={plano}
                clipId={selecionado}
                onOperacao={executar}
              />
            </div>
          </PainelRedimensionavel>

          <div
            className="cartao"
            style={{ height: '100%', padding: 0, margin: 0, overflow: 'hidden' }}
          >
            <Timeline
              plan={plano}
              posicaoMs={posicaoMs}
              onSeek={setPosicaoMs}
              onOperacao={executar}
              clipeSelecionado={selecionado}
              onSelecionar={setSelecionado}
            />
          </div>
        </PainelRedimensionavel>
      </div>
    </div>
  );
}
