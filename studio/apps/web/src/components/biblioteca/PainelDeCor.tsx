'use client';

// ============================================================
// Filtros e cor do trecho.
//
// Cada filtro aparece aplicado num quadro do PRÓPRIO vídeo (o trecho
// escolhido), com a mesma função de cor que gera a tabela do render
// (contracts/cor.ts). Ajustes finos em deslizantes; "igualar cor" mede
// cada trecho e compensa brilho, temperatura e tom para ficarem com a
// cor do trecho escolhido.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import type { AjustesDeCor, CategoriaDeAparencia, CorDoTrecho, EditPlanV1, TimelineOperation } from '@makucho/studio-contracts';
import {
  APARENCIAS,
  CATEGORIAS_DE_APARENCIA,
  NOMES_DOS_AJUSTES,
  agendaDoPlano,
  ajustesParaIgualar,
  corEhNeutra,
  transformarCor,
} from '@makucho/studio-contracts';
import { corMedia, proxyDaPrevia, quadroDoOriginal } from '../editor/gl/amostras';
import { Deslizante } from '../editor/PainelDoItem';
import { tempo } from '../editor/funcoes';

const LARGURA = 54;
const ALTURA = 96;

interface Props {
  plan: EditPlanV1;
  posicaoMs: number;
  clipeSelecionado: string | null;
  onOperacao: (op: TimelineOperation) => void;
  onOperacoes: (ops: TimelineOperation[]) => void;
}

/** A amostra com a cor aplicada, como imagem. */
function pintar(base: ImageData, cor: CorDoTrecho): string {
  const c = document.createElement('canvas');
  c.width = base.width;
  c.height = base.height;
  const saida = new ImageData(base.width, base.height);
  const d = base.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = transformarCor([d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255], cor);
    saida.data[i] = Math.round(r * 255);
    saida.data[i + 1] = Math.round(g * 255);
    saida.data[i + 2] = Math.round(b * 255);
    saida.data[i + 3] = 255;
  }
  c.getContext('2d')!.putImageData(saida, 0, 0);
  return c.toDataURL('image/webp', 0.85);
}

/** Onde, no original, fica o meio de um trecho. */
const meioDoTrecho = (clip: EditPlanV1['clips'][number]) => Math.round((clip.sourceStartMs + clip.sourceEndMs) / 2);

export function PainelDeCor({ plan, posicaoMs, clipeSelecionado, onOperacao, onOperacoes }: Props) {
  const agenda = useMemo(() => agendaDoPlano(plan), [plan]);
  const alvo =
    agenda.trechos.find((t) => t.clip.id === clipeSelecionado) ??
    agenda.trechos.find((t) => posicaoMs >= t.inicioMs && posicaoMs < t.inicioMs + t.duracaoMs) ??
    agenda.trechos[0];
  const [grupo, setGrupo] = useState<CategoriaDeAparencia | 'todas'>('todas');
  const [amostra, setAmostra] = useState<ImageData | null>(null);
  const [igualando, setIgualando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const clip = alvo?.clip;
  const cor: CorDoTrecho = clip?.color ?? {};
  const ajustes = cor.adjust ?? {};
  const meio = clip ? meioDoTrecho(clip) : 0;
  const clipId = clip?.id;

  // Um quadro do meio do trecho, para as miniaturas.
  useEffect(() => {
    const src = proxyDaPrevia();
    if (!src || !clipId) return;
    let vivo = true;
    quadroDoOriginal(src, meio, LARGURA, ALTURA)
      .then((img) => vivo && setAmostra(img))
      .catch(() => vivo && setAmostra(null));
    return () => {
      vivo = false;
    };
  }, [clipId, meio]);

  const miniaturas = useMemo(() => {
    if (!amostra) return new Map<string, string>();
    const m = new Map<string, string>();
    m.set('original', pintar(amostra, { adjust: ajustes }));
    for (const a of APARENCIAS) m.set(a.id, pintar(amostra, { look: a.id, adjust: ajustes }));
    return m;
    // As miniaturas mudam com a amostra e com os ajustes do trecho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amostra, JSON.stringify(ajustes)]);

  if (!alvo || !clip) return null;

  const definir = (nova: CorDoTrecho | null) => onOperacao({ op: 'definir_cor', clipId: clip.id, color: nova && !corEhNeutra(nova) ? nova : null });
  const ajustar = (k: keyof AjustesDeCor, v: number) => {
    const adjust = { ...ajustes, [k]: v / 100 };
    if (!v) delete adjust[k];
    definir({ ...cor, adjust });
  };

  const igualar = async () => {
    const src = proxyDaPrevia();
    if (!src) return;
    setIgualando(true);
    setAviso(null);
    try {
      const medir = async (c: EditPlanV1['clips'][number]) => {
        // Três pontos do trecho: um quadro só pode ser um piscar de luz.
        const pontos = [0.25, 0.5, 0.75].map((f) => Math.round(c.sourceStartMs + (c.sourceEndMs - c.sourceStartMs) * f));
        const medias: Array<[number, number, number]> = [];
        for (const p of pontos) medias.push(corMedia(await quadroDoOriginal(src, p, 32, 57)));
        return [0, 1, 2].map((i) => medias.reduce((s, m) => s + m[i]!, 0) / medias.length) as [number, number, number];
      };
      const referencia = await medir(clip);
      const destino = transformarCor(referencia, { adjust: ajustes });
      const ops: TimelineOperation[] = [];
      for (const t of agenda.trechos) {
        if (t.clip.id === clip.id) continue;
        const media = await medir(t.clip);
        const atual = t.clip.color ?? {};
        const adjust = ajustesParaIgualar(media, destino, atual.adjust);
        ops.push({ op: 'definir_cor', clipId: t.clip.id, color: { ...atual, adjust } });
      }
      if (ops.length) onOperacoes(ops);
      setAviso(`${ops.length} trecho(s) ajustado(s) para a cor deste. Os ajustes ficam em cada trecho, para conferir ou desfazer.`);
    } catch {
      setAviso('Não foi possível medir a cor agora. Espere a prévia carregar e tente de novo.');
    } finally {
      setIgualando(false);
    }
  };

  const filtros = APARENCIAS.filter((a) => grupo === 'todas' || a.categoria === grupo);

  return (
    <>
      <p className="biblioteca__alvo">
        Aplica no trecho {clipeSelecionado ? 'selecionado' : 'sob o cursor'} ({tempo(alvo.inicioMs)}–{tempo(alvo.inicioMs + alvo.duracaoMs)}). A
        prévia e o vídeo exportado usam a mesma tabela de cor.
      </p>
      <div className="biblioteca__chips" role="radiogroup" aria-label="Tipo de filtro">
        {([['todas', 'Todos'], ...Object.entries(CATEGORIAS_DE_APARENCIA)] as Array<[CategoriaDeAparencia | 'todas', string]>).map(([id, rotulo]) => (
          <button key={id} type="button" role="radio" aria-checked={grupo === id} className="biblioteca__chip" onClick={() => setGrupo(id)}>
            {rotulo}
          </button>
        ))}
      </div>
      <div className="demos demos--filtros" role="radiogroup" aria-label="Filtros">
        {[{ id: 'original', rotulo: 'Original', descricao: 'Sem filtro.' }, ...filtros].map((a) => {
          const ativo = a.id === 'original' ? !cor.look : cor.look === a.id;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={ativo}
              className="demo-cartao demo-cartao--filtro"
              title={a.descricao}
              onClick={() => {
                if (a.id === 'original') {
                  const { look: _look, intensity: _intensity, ...resto } = cor;
                  definir(resto);
                } else definir({ ...cor, look: a.id, intensity: cor.look === a.id ? cor.intensity : undefined });
              }}
            >
              <span className="demo demo--filtro" aria-hidden>
                {miniaturas.get(a.id) && <img src={miniaturas.get(a.id)} alt="" draggable={false} />}
              </span>
              <span className="demo-cartao__nome">{a.rotulo}</span>
            </button>
          );
        })}
      </div>

      {cor.look && (
        <div style={{ marginTop: 'var(--e3)' }}>
          <Deslizante
            rotulo="Intensidade do filtro"
            valor={Math.round((cor.intensity ?? 1) * 100)}
            min={0}
            max={100}
            passo={5}
            unidade="%"
            onSoltar={(v) => definir({ ...cor, intensity: v >= 100 ? undefined : v / 100 })}
          />
        </div>
      )}

      <h3 className="biblioteca__subtitulo">Ajustes</h3>
      <div className="biblioteca__ajustes">
        {NOMES_DOS_AJUSTES.map(([k, rotulo]) => (
          <Deslizante key={k} rotulo={rotulo} valor={Math.round((ajustes[k] ?? 0) * 100)} min={-100} max={100} passo={5} unidade="" onSoltar={(v) => ajustar(k, v)} />
        ))}
      </div>

      <div className="linha" style={{ gap: 'var(--e2)', flexWrap: 'wrap', marginTop: 'var(--e3)' }}>
        <button
          type="button"
          className="botao botao--secundario botao--pequeno"
          disabled={corEhNeutra(cor)}
          onClick={() => onOperacao({ op: 'cor_em_todos', color: corEhNeutra(cor) ? null : cor })}
        >
          Usar esta cor em todos os trechos
        </button>
        <button type="button" className="botao botao--secundario botao--pequeno" disabled={igualando || agenda.trechos.length < 2} onClick={() => void igualar()}>
          {igualando ? 'Medindo…' : 'Igualar os outros trechos a este'}
        </button>
        <button type="button" className="botao botao--fantasma botao--pequeno" disabled={corEhNeutra(cor)} onClick={() => definir(null)}>
          Voltar à cor original
        </button>
      </div>
      {aviso && (
        <p className="biblioteca__alvo" role="status" style={{ marginTop: 'var(--e2)' }}>
          {aviso}
        </p>
      )}
    </>
  );
}
