'use client';

// ============================================================
// Editor — quatro zonas.
//
// O guia define a anatomia: rail de ferramentas 72px, painel
// "Seleção da IA" 280px, preview 9:16 ao centro, inspector
// contextual à direita e timeline na base.
//
// A diferença de fundo para o OpenCut (ADR 0009) está no painel
// esquerdo: lá são os arquivos que a pessoa importou; aqui é a
// análise da IA — os trechos que ela achou no bruto, com o motivo de
// cada escolha. O usuário começa de uma proposta pronta, não de uma
// timeline vazia.
// ============================================================

import { useCallback, useMemo, useState } from 'react';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { aplicarOperacao } from '@makucho/studio-contracts';
import { Topbar } from '../../components/shell/Topbar';
import { RailDeFerramentas, type AbaDoEditor } from '../../components/editor/RailDeFerramentas';
import { PainelDaIA } from '../../components/editor/PainelDaIA';
import { PainelVazio } from '../../components/editor/PainelVazio';
import { Inspector } from '../../components/editor/Inspector';
import { Palco } from '../../components/editor/Palco';
import { Timeline } from '../../components/timeline/Timeline';
import {
  IconeDesfazer,
  IconeRefazer,
  IconeExportar,
  IconeOlho,
  IconeAviso,
  IconeMidia,
  IconeTexto,
  IconeAudio,
  IconeMarca,
} from '../../components/icones';

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
  const [aba, setAba] = useState<AbaDoEditor>('ia');

  // Duas pilhas: desfazer empilha o passado, refazer o que foi
  // desfeito. Uma edição nova limpa o futuro — é o comportamento que
  // todo editor tem, e quebrá-lo confunde.
  const [passado, setPassado] = useState<EditPlanV1[]>([]);
  const [futuro, setFuturo] = useState<EditPlanV1[]>([]);

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

      setPassado((h) => [...h, plano]);
      setFuturo([]);
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
    setPassado((h) => {
      const anterior = h[h.length - 1];
      if (!anterior) return h;
      setFuturo((f) => [plano, ...f]);
      setPlano(anterior);
      setErro(null);
      return h.slice(0, -1);
    });
  }, [plano]);

  const refazer = useCallback(() => {
    setFuturo((f) => {
      const proximo = f[0];
      if (!proximo) return f;
      setPassado((h) => [...h, plano]);
      setPlano(proximo);
      setErro(null);
      return f.slice(1);
    });
  }, [plano]);

  const reducao = Math.round((1 - duracaoMs / plano.sourceDurationMs) * 100);

  return (
    <>
      <Topbar
        trilha={['Projetos', 'Atendimento no WhatsApp']}
        estado="salvo"
      >
        <span
          className="texto-secundario"
          style={{ fontSize: 12, marginRight: 'var(--e2)' }}
        >
          {Math.round(plano.sourceDurationMs / 60_000)} min → {(duracaoMs / 1000).toFixed(0)}s
          {reducao > 0 && ` · −${reducao}%`}
        </span>

        <button
          type="button"
          className="botao-icone"
          onClick={desfazer}
          disabled={passado.length === 0}
          aria-label="Desfazer"
          title="Desfazer"
        >
          <IconeDesfazer size={18} />
        </button>
        <button
          type="button"
          className="botao-icone"
          onClick={refazer}
          disabled={futuro.length === 0}
          aria-label="Refazer"
          title="Refazer"
        >
          <IconeRefazer size={18} />
        </button>

        <button type="button" className="botao botao--secundario botao--pequeno">
          <IconeOlho size={16} />
          Pré-visualizar
        </button>
        <button
          type="button"
          className="botao botao--pequeno"
          onClick={() => setErro('O render entra na Fase 7. A proposta já está pronta.')}
        >
          <IconeExportar size={16} />
          Exportar vídeo
        </button>
      </Topbar>

      {erro && (
        <div
          role="alert"
          className="aviso aviso--erro"
          style={{ margin: 'var(--e3) var(--e4) 0', flexShrink: 0 }}
        >
          <IconeAviso size={16} />
          <span>{erro}</span>
        </div>
      )}

      <div className="editor">
        <RailDeFerramentas aba={aba} onTrocar={setAba} />

        <section className="editor__ia" aria-label="Painel de conteúdo">
          {aba === 'ia' && (
            <PainelDaIA
              plan={plano}
              selecionado={selecionado}
              onSelecionar={setSelecionado}
            />
          )}
          {aba === 'midia' && (
            <PainelVazio
              Icone={IconeMidia}
              titulo="Mídia do projeto"
              texto="A gravação enviada e os cortes gerados aparecem aqui."
            />
          )}
          {aba === 'texto' && (
            <PainelVazio
              Icone={IconeTexto}
              titulo="Títulos e legendas"
              texto="As legendas seguem a transcrição. Estilos entram na composição final."
            />
          )}
          {aba === 'audio' && (
            <PainelVazio
              Icone={IconeAudio}
              titulo="Trilha e efeitos"
              texto="Música de fundo e efeitos, com o volume ajustado à sua voz."
            />
          )}
          {aba === 'marca' && (
            <PainelVazio
              Icone={IconeMarca}
              titulo="Kit de marca"
              texto="Logo, cores e fontes cadastrados em Marca aparecem aqui."
            />
          )}
        </section>

        <main className="editor__palco">
          <Palco plan={plano} posicaoMs={posicaoMs} onPosicao={setPosicaoMs} />
        </main>

        <aside className="editor__inspector" aria-label="Propriedades">
          <Inspector plan={plano} clipId={selecionado} onOperacao={executar} />
        </aside>

        <section className="editor__timeline" aria-label="Linha do tempo">
          <Timeline
            plan={plano}
            posicaoMs={posicaoMs}
            onSeek={setPosicaoMs}
            onOperacao={executar}
            clipeSelecionado={selecionado}
            onSelecionar={setSelecionado}
          />
        </section>
      </div>
    </>
  );
}
