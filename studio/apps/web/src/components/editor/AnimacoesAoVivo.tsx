'use client';

// ============================================================
// Animações em HTML (HyperFrames) na prévia: cada uma num iframe isolado
// (só scripts, sem acesso a esta página nem à rede), do tamanho do quadro
// 1080x1920 e escalado para o palco. A agulha da timeline manda o
// instante e o documento faz `tl.seek` -- a mesma página que o servidor
// fotografa quadro a quadro para o vídeo final.
//
// Também pede ao servidor o vídeo com transparência de cada animação
// (para exportar), assim que ela aparece ou muda.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CamadaDeMidia } from '@makucho/studio-contracts';
import { PREFIXO_DA_LEGENDA_HF, componentesDaComposicao, documentoDaComposicao } from '@makucho/studio-contracts';
import { ouvirPosicao } from '../../lib/relogioAoVivo';
import { animacoes as apiAnimacoes } from '../../lib/api';
import type { PecaDaAnimacao } from './EdicaoNoPalco';

interface Props {
  projectId?: string;
  camadas: readonly CamadaDeMidia[];
  posicaoMs: number;
  corDaMarca?: string;
  /** A animação sendo editada no palco: ela informa onde estão as peças e recebe o ajuste ao vivo. */
  editando?: { id: string; css: string | null; onPecas: (pecas: PecaDaAnimacao[]) => void } | null;
}

/**
 * Os fontes dos componentes do catálogo do HyperFrames (~270 KB): num
 * pedaço próprio do bundle, carregado só quando uma animação usa componente.
 */
let fontesDosComponentes: Promise<Record<string, string>> | null = null;
function carregarComponentes(): Promise<Record<string, string>> {
  fontesDosComponentes ??= import('@makucho/studio-contracts/componentes-hyperframes').then((m) => m.FONTES_DOS_COMPONENTES);
  return fontesDosComponentes;
}

function Animacao({ camada, origem, corDaMarca, posicaoMs, escala, editando }: { camada: CamadaDeMidia; origem: string; corDaMarca?: string | undefined; posicaoMs: number; escala: number; editando?: Props['editando'] }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [visivel, setVisivel] = useState(false);
  const usaComponentes = !!camada.composicao && componentesDaComposicao(camada.composicao.html).length > 0;
  const [componentes, setComponentes] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (!usaComponentes || componentes) return;
    let vivo = true;
    void carregarComponentes().then((c) => vivo && setComponentes(c));
    return () => {
      vivo = false;
    };
  }, [usaComponentes, componentes]);
  const doc = useMemo(
    () =>
      camada.composicao && (!usaComponentes || componentes)
        ? documentoDaComposicao(camada.composicao, {
            duracaoMs: camada.durationMs,
            gsap: `${origem}/hyperframes/gsap.min.js`,
            fontes: `${origem}/fonts/`,
            origens: origem,
            previa: true,
            ...(componentes ? { componentes } : {}),
            ...(corDaMarca ? { corDaMarca } : {}),
          })
        : '',
    [camada.composicao, camada.durationMs, origem, corDaMarca, usaComponentes, componentes],
  );

  const ultimo = useRef(posicaoMs);
  const mandar = (ms: number) => {
    ultimo.current = ms;
    const dentro = ms >= camada.timelineStartMs && ms < camada.timelineStartMs + camada.durationMs;
    setVisivel((v) => (v === dentro ? v : dentro));
    if (!dentro) return;
    ref.current?.contentWindow?.postMessage({ hfT: (ms - camada.timelineStartMs) / 1000 }, '*');
  };
  useEffect(() => mandar(posicaoMs), [posicaoMs, camada.timelineStartMs, camada.durationMs]);

  // Edição no palco: liga o relato das peças e passa o ajuste ao vivo; ouve só o próprio iframe.
  const editandoEsta = editando?.id === camada.id;
  const aoReceber = useRef(editando?.onPecas);
  aoReceber.current = editando?.onPecas;
  useEffect(() => {
    ref.current?.contentWindow?.postMessage({ hfEditar: editandoEsta }, '*');
    if (!editandoEsta) return;
    const ouvir = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || !e.data || !Array.isArray(e.data.hfEd)) return;
      aoReceber.current?.(e.data.hfEd as PecaDaAnimacao[]);
    };
    window.addEventListener('message', ouvir);
    return () => window.removeEventListener('message', ouvir);
  }, [editandoEsta, doc]);
  const cssAoVivo = editandoEsta ? editando?.css ?? null : null;
  useEffect(() => {
    if (cssAoVivo !== null) ref.current?.contentWindow?.postMessage({ hfCss: cssAoVivo }, '*');
  }, [cssAoVivo]);
  useEffect(() => ouvirPosicao(mandar), [camada.timelineStartMs, camada.durationMs]);

  return (
    <iframe
      ref={ref}
      title={camada.composicao?.titulo ?? 'Animação'}
      className="palco__animacao"
      sandbox="allow-scripts"
      srcDoc={doc}
      onLoad={() => {
        if (editandoEsta) ref.current?.contentWindow?.postMessage({ hfEditar: true }, '*');
        mandar(ultimo.current);
      }}
      style={{ transform: `scale(${escala})`, visibility: visivel ? 'visible' : 'hidden', opacity: camada.opacity ?? 1 }}
      aria-hidden
      tabIndex={-1}
    />
  );
}

/** Um resumo curto de um texto (para notar que o CSS mudou sem guardar o CSS inteiro). */
function resumo(t: string): string {
  let h = 2166136261;
  for (let i = 0; i < t.length; i += 1) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function AnimacoesAoVivo({ projectId, camadas, posicaoMs, corDaMarca, editando }: Props) {
  const html = camadas.filter((c) => c.kind === 'html' && c.composicao);
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.3);
  const [origem, setOrigem] = useState('');
  useEffect(() => setOrigem(window.location.origin), []);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(el.clientWidth / 1080);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [html.length > 0, origem]);

  // O vídeo com transparência de cada animação, para exportar: pedido
  // quando ela aparece ou muda (um pouco depois, para não pedir a cada tecla).
  // O CSS entra (o ajuste de posição e tamanho mora nele): aplicar refaz o vídeo da animação.
  const assinatura = html.map((c) => `${c.id}:${c.durationMs}:${c.composicao!.html.length}:${c.composicao!.script.length}:${c.composicao!.layout}:${resumo(c.composicao!.css)}`).join('|');
  useEffect(() => {
    if (!projectId || !html.length) return;
    // A legenda do HyperFrames muda a cada ajuste de texto ou posição e cada
    // pedaço é um render pesado: só é pedida depois de 20 s sem mudança.
    const legenda = html.filter((c) => c.id.startsWith(PREFIXO_DA_LEGENDA_HF));
    const animacoes = html.filter((c) => !c.id.startsWith(PREFIXO_DA_LEGENDA_HF));
    const pedir = (lista: typeof html) => {
      for (const c of lista) void apiAnimacoes.preparar(projectId, c.composicao!, c.durationMs).catch(() => undefined);
    };
    const t1 = setTimeout(() => pedir(animacoes), 1500);
    const t2 = setTimeout(() => pedir(legenda), 20_000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [projectId, assinatura]);

  if (!html.length || !origem) return null;
  return (
    <div ref={caixa} className="palco__animacoes" aria-hidden>
      {html.map((c) => (
        <Animacao key={c.id} camada={c} origem={origem} corDaMarca={corDaMarca} posicaoMs={posicaoMs} escala={escala} editando={editando} />
      ))}
    </div>
  );
}
