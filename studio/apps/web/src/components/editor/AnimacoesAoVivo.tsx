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
import { componentesDaComposicao, documentoDaComposicao } from '@makucho/studio-contracts';
import { ouvirPosicao } from '../../lib/relogioAoVivo';
import { animacoes as apiAnimacoes } from '../../lib/api';

interface Props {
  projectId?: string;
  camadas: readonly CamadaDeMidia[];
  posicaoMs: number;
  corDaMarca?: string;
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

function Animacao({ camada, origem, corDaMarca, posicaoMs, escala }: { camada: CamadaDeMidia; origem: string; corDaMarca?: string | undefined; posicaoMs: number; escala: number }) {
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
  useEffect(() => ouvirPosicao(mandar), [camada.timelineStartMs, camada.durationMs]);

  return (
    <iframe
      ref={ref}
      title={camada.composicao?.titulo ?? 'Animação'}
      className="palco__animacao"
      sandbox="allow-scripts"
      srcDoc={doc}
      onLoad={() => mandar(ultimo.current)}
      style={{ transform: `scale(${escala})`, visibility: visivel ? 'visible' : 'hidden', opacity: camada.opacity ?? 1 }}
      aria-hidden
      tabIndex={-1}
    />
  );
}

export function AnimacoesAoVivo({ projectId, camadas, posicaoMs, corDaMarca }: Props) {
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
  const assinatura = html.map((c) => `${c.id}:${c.durationMs}:${c.composicao!.html.length}:${c.composicao!.script.length}:${c.composicao!.layout}`).join('|');
  useEffect(() => {
    if (!projectId || !html.length) return;
    const t = setTimeout(() => {
      for (const c of html) void apiAnimacoes.preparar(projectId, c.composicao!, c.durationMs).catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, [projectId, assinatura]);

  if (!html.length || !origem) return null;
  return (
    <div ref={caixa} className="palco__animacoes" aria-hidden>
      {html.map((c) => (
        <Animacao key={c.id} camada={c} origem={origem} corDaMarca={corDaMarca} posicaoMs={posicaoMs} escala={escala} />
      ))}
    </div>
  );
}
