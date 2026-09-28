'use client';

// ============================================================
// Animações ("motion UI"): cenas que se montam no ritmo da fala -- em
// meio a meio (animação em cima, vídeo embaixo), num cartão sobre o
// vídeo ou em tela cheia. A IA cria a partir da fala; os modelos prontos
// entram no cursor. A miniatura é desenhada pela MESMA função do vídeo.
// ============================================================

import { useEffect, useMemo, useRef } from 'react';
import type { CenaAnimada, EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import { MODELOS_DE_CENA, NOME_DO_LAYOUT_DA_CENA, agendaDoPlano, desenharCena, duracaoSugeridaDaCena, type Contexto2D } from '@makucho/studio-contracts';
import type { ItemDaTimeline } from '../timeline/camadas';
import { tempo } from '../editor/funcoes';
import { PedirAIa, type RespostaDaIa } from '../editor/PedirAIa';
import { fontesDaCena } from '../editor/gl/cenasNoNavegador';

interface Props {
  plan: EditPlanV1;
  posicaoMs: number;
  corDaMarca?: string;
  onOperacao: (op: TimelineOperation) => void;
  onSelecionarItem: (item: ItemDaTimeline) => void;
  onPedirIa?: (texto: string, anterior?: { pedido: string; resposta: string }) => Promise<RespostaDaIa | null>;
  passosDaIa?: string[];
}

/** A cena parada no fim (tudo montado), numa miniatura vertical. */
function MiniaturaDaCena({ cena, corDaMarca }: { cena: CenaAnimada; corDaMarca?: string | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let vivo = true;
    void fontesDaCena().then(() => {
      const c = ref.current;
      const ctx = c?.getContext('2d');
      if (!vivo || !c || !ctx) return;
      ctx.fillStyle = '#1b1f26';
      ctx.fillRect(0, 0, c.width, c.height);
      const tela = document.createElement('canvas');
      tela.width = c.width;
      tela.height = c.height;
      const t = tela.getContext('2d');
      if (!t) return;
      desenharCena(t as unknown as Contexto2D, cena, duracaoSugeridaDaCena(cena), c.width, c.height, corDaMarca ? { corDaMarca } : {});
      ctx.drawImage(tela, 0, 0);
    });
    return () => {
      vivo = false;
    };
  }, [cena, corDaMarca]);
  return <canvas ref={ref} width={216} height={384} className="cena-cartao__miniatura" aria-hidden />;
}

export function Animacoes({ plan, posicaoMs, corDaMarca, onOperacao, onSelecionarItem, onPedirIa, passosDaIa }: Props) {
  const duracaoTotal = useMemo(() => agendaDoPlano(plan).duracaoMs, [plan]);
  const noCursor = Math.min(Math.max(0, Math.round(posicaoMs)), Math.max(0, duracaoTotal - 500));

  const por = (cena: CenaAnimada) => {
    const id = `md${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    onOperacao({
      op: 'adicionar_midia',
      id,
      assetId: 'cena',
      kind: 'cena',
      layout: 'tela_cheia',
      cena,
      timelineStartMs: noCursor,
      durationMs: Math.max(500, Math.min(duracaoSugeridaDaCena(cena), duracaoTotal - noCursor)),
      ...(cena.layout === 'cartao' ? { fadeOutMs: 200 } : {}),
    });
    onSelecionarItem({ tipo: 'midia', id });
  };

  return (
    <>
      {onPedirIa && (
        <PedirAIa
          titulo="Criar animações com a IA"
          ajuda="A IA lê a fala e monta cenas que entram no ritmo das palavras: meio a meio, cartão sobre o vídeo ou tela cheia."
          exemplos={['Anime os pontos principais da fala', 'Um cartão com o preço, sem cobrir o rosto', 'Meio a meio no passo a passo']}
          onEnviar={(texto, anterior) => onPedirIa(`Animações (motion UI, com criar_cena_animada): ${texto}`, anterior)}
          passos={passosDaIa ?? []}
        />
      )}
      <span className="campo__rotulo" style={{ display: 'block', marginTop: 'var(--e3)' }}>
        Modelos prontos
      </span>
      <p className="campo__ajuda">Entram no cursor ({tempo(noCursor)}), na faixa Mídia. Selecione para trocar o jeito (meio a meio, cartão, tela cheia) e a posição.</p>
      <div className="cenas-modelos">
        {MODELOS_DE_CENA.map((m) => (
          <button key={m.id} type="button" className="cena-cartao" title={m.quando} onClick={() => por(m.cena)}>
            <MiniaturaDaCena cena={m.cena} corDaMarca={corDaMarca} />
            <span className="cena-cartao__nome">{m.rotulo}</span>
            <span className="cena-cartao__quando">{NOME_DO_LAYOUT_DA_CENA[m.cena.layout]}</span>
          </button>
        ))}
      </div>
    </>
  );
}
