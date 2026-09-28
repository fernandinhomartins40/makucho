'use client';

// ============================================================
// Sobreposições: luz vazando, bokeh, poeira, partículas...
//
// Vídeos de licença livre sobre fundo preto (Pexels, Pixabay), cada tipo
// uma busca curada. Tocar numa opção traz o vídeo e põe em tela cheia no
// cursor, no modo "tela": o preto some e só a luz fica por cima.
// ============================================================

import { useMemo, useState } from 'react';
import type { DefinicaoDeSobreposicao, EditPlanV1, ResultadoDaBusca, TimelineOperation } from '@makucho/studio-contracts';
import { NOME_DA_FONTE, SOBREPOSICOES, agendaDoPlano } from '@makucho/studio-contracts';
import { bancoDeMidia } from '../../lib/api';
import type { ItemDaTimeline } from '../timeline/camadas';
import { tempo } from '../editor/funcoes';
import { IconeMais } from '../icones';

interface Props {
  plan: EditPlanV1;
  posicaoMs: number;
  onOperacao: (op: TimelineOperation) => void;
  onSelecionarItem: (item: ItemDaTimeline) => void;
}

export function Sobreposicoes({ plan, posicaoMs, onOperacao, onSelecionarItem }: Props) {
  const duracaoTotal = useMemo(() => agendaDoPlano(plan).duracaoMs, [plan]);
  const noCursor = Math.min(Math.max(0, Math.round(posicaoMs)), Math.max(0, duracaoTotal - 300));
  const [tipo, setTipo] = useState<DefinicaoDeSobreposicao | null>(null);
  const [opcoes, setOpcoes] = useState<ResultadoDaBusca[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [trazendo, setTrazendo] = useState<string | null>(null);

  const escolherTipo = async (s: DefinicaoDeSobreposicao) => {
    setTipo(s);
    setBuscando(true);
    setAviso(null);
    setOpcoes(null);
    try {
      const r = await bancoDeMidia.buscar(s.busca, 'video');
      setOpcoes(r.resultados.slice(0, 9));
      if (!r.resultados.length) setAviso(r.avisos[0] ?? 'Nada encontrado agora. Confira a chave do Pexels ou do Pixabay nas configurações.');
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'a busca falhou.');
    } finally {
      setBuscando(false);
    }
  };

  const trazer = async (r: ResultadoDaBusca) => {
    if (!tipo) return;
    setTrazendo(`${r.fonte}:${r.id}`);
    setAviso(null);
    try {
      const importada = await bancoDeMidia.importar(r);
      const id = `md${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      onOperacao({
        op: 'adicionar_midia',
        id,
        assetId: importada.id,
        kind: 'video',
        timelineStartMs: noCursor,
        durationMs: Math.max(300, Math.min(r.duracaoMs ?? 5000, 5000, duracaoTotal - noCursor)),
        layout: 'tela_cheia',
        blend: tipo.mistura,
        opacity: tipo.opacidade,
        fadeInMs: 300,
        fadeOutMs: 300,
      });
      onSelecionarItem({ tipo: 'midia', id });
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'não foi possível trazer o vídeo.');
    } finally {
      setTrazendo(null);
    }
  };

  return (
    <>
      <h3 className="biblioteca__subtitulo">Sobreposições</h3>
      <p className="campo__ajuda">
        Luz, brilho e textura por cima do vídeo, de bancos gratuitos. Entram no cursor ({tempo(noCursor)}) em tela cheia; o fundo preto some.
      </p>
      <div className="biblioteca__chips" role="radiogroup" aria-label="Tipo de sobreposição">
        {SOBREPOSICOES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={tipo?.id === s.id}
            className="biblioteca__chip"
            title={s.quando}
            onClick={() => void escolherTipo(s)}
          >
            {s.rotulo}
          </button>
        ))}
      </div>
      {buscando && (
        <p className="busca-no-banco__consulta" role="status">
          Buscando {tipo?.rotulo.toLowerCase()}…
        </p>
      )}
      {aviso && <p className="campo__erro">{aviso}</p>}
      {opcoes && opcoes.length > 0 && (
        <div className="grade-de-midias grade-de-midias--banco">
          {opcoes.map((r) => (
            <div key={`${r.fonte}-${r.id}`} className="midia-cartao">
              <button
                type="button"
                className="midia-cartao__previa midia-cartao__previa--vertical"
                disabled={trazendo !== null}
                title={`Adicionar: ${r.titulo} · ${NOME_DA_FONTE[r.fonte]} · ${r.licenca.nome}`}
                onClick={() => void trazer(r)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.miniatura} alt={r.titulo} loading="lazy" />
                {r.duracaoMs !== null && <span className="midia-cartao__selo">{Math.round(r.duracaoMs / 1000)} s</span>}
                <span className="midia-cartao__mais" aria-hidden>
                  {trazendo === `${r.fonte}:${r.id}` ? '…' : <IconeMais size={14} weight="bold" />}
                </span>
              </button>
              {r.licenca.exigeCredito && r.autor && (
                <a className="midia-cartao__nome" href={r.pagina} target="_blank" rel="noreferrer">
                  {NOME_DA_FONTE[r.fonte]} · {r.autor}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
