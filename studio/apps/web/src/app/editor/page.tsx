'use client';

// ============================================================
// Editor.
//
// Anatomia da referência: rail de ferramentas na coluna esquerda —
// no lugar da sidebar de navegação, porque ali a coluna pertence ao
// trabalho —, painel "Seleção da IA", preview 9:16 ao centro,
// inspector contextual à direita e timeline na base. A volta fica na
// seta da topbar.
//
// A diferença de fundo para o OpenCut (ADR 0009) está no painel
// esquerdo: lá são os arquivos que a pessoa importou; aqui é a
// análise da IA — os trechos que ela achou no bruto, com o motivo de
// cada escolha. O usuário começa de uma proposta pronta, não de uma
// timeline vazia.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { aplicarOperacao } from '@makucho/studio-contracts';
import { RailDeFerramentas, type AbaDoEditor } from '../../components/editor/RailDeFerramentas';
import { PainelDaIA } from '../../components/editor/PainelDaIA';
import { PainelVazio } from '../../components/editor/PainelVazio';
import { Inspector } from '../../components/editor/Inspector';
import { Palco } from '../../components/editor/Palco';
import { Timeline } from '../../components/timeline/Timeline';
import { planos as apiPlanos, projetos as apiProjetos, urlDoVideo } from '../../lib/api';
import {
  IconeDesfazer,
  IconeRefazer,
  IconeExportar,
  IconeTocar,
  IconeAviso,
  IconeVoltar,
  IconeRenomear,
  IconeSalvo,
  IconeAbrir,
  IconeMidia,
  IconeTexto,
  IconeAudio,
  IconeMarca,
  IconeLegenda,
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

// Legendas da demonstração. Vêm da transcrição na Fase 5.
const LEGENDAS = {
  c1: { texto: 'Atender bem no WhatsApp', destaque: 'pode dobrar suas vendas.' },
  c2: { texto: 'Isso não é teoria, é o que vejo', destaque: 'nos meus clientes.' },
  c3: { texto: 'Implemente hoje e veja', destaque: 'o resultado.' },
};

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="conteudo" />}>
      <Editor />
    </Suspense>
  );
}

function Editor() {
  const parametros = useSearchParams();
  const projectId = parametros.get('projeto');

  const [plano, setPlano] = useState<EditPlanV1>(PLANO_DEMO);
  const [carregando, setCarregando] = useState(Boolean(projectId));
  const [salvando, setSalvando] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [posicaoMs, setPosicaoMs] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<AbaDoEditor>('ia');
  const [titulo, setTitulo] = useState('Atendimento no WhatsApp');
  const [proxyUrl, setProxyUrl] = useState<string | undefined>(undefined);
  const [editandoTitulo, setEditandoTitulo] = useState(false);

  // Trechos desligados continuam na lista: a seção 13 exige poder
  // restaurar o que foi descartado.
  const [desligados, setDesligados] = useState<Set<string>>(new Set());

  // Duas pilhas: desfazer empilha o passado, refazer o que foi
  // desfeito. Uma edição nova limpa o futuro — é o comportamento que
  // todo editor tem, e quebrá-lo confunde.
  const [passado, setPassado] = useState<EditPlanV1[]>([]);
  const [futuro, setFuturo] = useState<EditPlanV1[]>([]);

  const duracaoMs = useMemo(
    () => plano.clips.reduce((t, c) => t + (c.sourceEndMs - c.sourceStartMs), 0),
    [plano.clips],
  );

  // ---------- Carregar do servidor ----------
  useEffect(() => {
    if (!projectId) return;

    let cancelado = false;

    void (async () => {
      try {
        const projeto = await apiProjetos.obter(projectId);
        if (cancelado) return;

        setTitulo(projeto.title);
        // O proxy só existe depois que o worker de mídia rodou. Antes
        // disso o palco mostra o estado vazio em vez de um <video>
        // apontando para 404.
        if (projeto.state !== 'DRAFT' && projeto.state !== 'UPLOADING') {
          setProxyUrl(urlDoVideo(projectId));
        }

        const versao = await apiPlanos.atual(projectId);
        if (!cancelado) setPlano(versao.document as EditPlanV1);
      } catch (e) {
        // Projeto sem proposta ainda é o caso normal de quem acabou de
        // enviar o vídeo: a IA entra na Fase 5. O editor abre com o
        // exemplo em vez de uma tela de erro.
        if (!cancelado && e instanceof Error && !e.message.includes('proposta')) {
          setErro(e.message);
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [projectId]);

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

      // O servidor valida de novo e cria a versão. Se recusar, a tela
      // volta ao plano anterior: aceitar local e recusar remoto
      // deixaria os dois lados discordando sobre o que está salvo.
      if (projectId) {
        const anterior = plano;
        setSalvando(true);
        void apiPlanos
          .operar(projectId, operacao)
          .catch((e: unknown) => {
            setPlano(anterior);
            setPassado((h) => h.slice(0, -1));
            setErro(e instanceof Error ? e.message : 'não foi possível salvar o ajuste.');
          })
          .finally(() => setSalvando(false));
      }

      // O trecho removido deixa de existir: manter a seleção mostraria
      // propriedades de algo que não está mais no vídeo.
      if (operacao.op === 'alternar_clipe' && !operacao.enabled) {
        setSelecionado(null);
      }
    },
    [plano, projectId],
  );

  const alternarTrecho = useCallback((clipId: string) => {
    setDesligados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(clipId)) proximo.delete(clipId);
      else proximo.add(clipId);
      return proximo;
    });
  }, []);

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
      <header className="topbar">
        <Link href="/" className="botao-icone" aria-label="Voltar para Projetos">
          <IconeVoltar size={20} />
        </Link>

        {editandoTitulo ? (
          <input
            className="campo__entrada"
            value={titulo}
            autoFocus
            aria-label="Nome do projeto"
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={() => setEditandoTitulo(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditandoTitulo(false)}
            style={{ maxWidth: 320, fontSize: 19, fontWeight: 600 }}
          />
        ) : (
          <button
            type="button"
            className="linha"
            onClick={() => setEditandoTitulo(true)}
            aria-label={`Renomear o projeto ${titulo}`}
            style={{
              gap: 'var(--e2)',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'text',
              fontSize: 19,
              fontWeight: 600,
              padding: 0,
            }}
          >
            {titulo}
            <IconeRenomear size={16} color="var(--text-secondary)" />
          </button>
        )}

        <span className="linha texto-secundario" style={{ gap: 'var(--e1)', fontSize: 14 }}>
          <IconeSalvo size={17} />
          Salvo
          <IconeAbrir size={13} />
        </span>

        <span
          className="texto-secundario auto"
          style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
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
          <IconeDesfazer size={19} />
        </button>
        <button
          type="button"
          className="botao-icone"
          onClick={refazer}
          disabled={futuro.length === 0}
          aria-label="Refazer"
          title="Refazer"
        >
          <IconeRefazer size={19} />
        </button>

        <button type="button" className="botao botao--secundario">
          <IconeTocar size={16} />
          Pré-visualizar
        </button>
        <button
          type="button"
          className="botao"
          onClick={() => setErro('O render entra na Fase 7. A proposta já está pronta.')}
        >
          <IconeExportar size={16} />
          Exportar vídeo
        </button>
      </header>

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

        {carregando && (
          <div
            className="editor__carregando"
            role="status"
            aria-live="polite"
          >
            <span className="esqueleto" style={{ width: 200, height: 14 }} />
            <span className="texto-secundario">Carregando o projeto…</span>
          </div>
        )}

        <section className="editor__ia" aria-label="Painel de conteúdo">
          {aba === 'ia' && (
            <PainelDaIA
              plan={plano}
              selecionado={selecionado}
              desligados={desligados}
              onSelecionar={setSelecionado}
              onAlternar={alternarTrecho}
              onOperacao={executar}
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
              titulo="Títulos e chamadas"
              texto="Textos sobrepostos ao vídeo, com a fonte do seu kit de marca."
            />
          )}
          {aba === 'legendas' && (
            <PainelVazio
              Icone={IconeLegenda}
              titulo="Legendas"
              texto="Seguem a transcrição. O estilo se ajusta no painel de propriedades."
            />
          )}
          {aba === 'marca' && (
            <PainelVazio
              Icone={IconeMarca}
              titulo="Kit de marca"
              texto="Logo, cores e fontes cadastrados em Marca aparecem aqui."
            />
          )}
          {aba === 'audio' && (
            <PainelVazio
              Icone={IconeAudio}
              titulo="Trilha e efeitos"
              texto="Música de fundo e efeitos, com o volume ajustado à sua voz."
            />
          )}
        </section>

        <main className="editor__palco">
          <Palco
            plan={plano}
            proxyUrl={proxyUrl}
            posicaoMs={posicaoMs}
            onPosicao={setPosicaoMs}
            legendas={LEGENDAS}
          />
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
