'use client';

// ============================================================
// Aba "Marca" do editor: a biblioteca da marca a um clique.
//
// O que a pessoa cadastrou no Kit de marca (logos, vinhetas, trilhas,
// sons, imagens e vídeos) entra no vídeo daqui, pelas mesmas operações
// da timeline -- e é o mesmo que a IA usa quando alguém pede "abre com
// a vinheta" ou "põe o som da marca".
// ============================================================

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { EditPlanV1, PreferenciasDeVideo, TimelineOperation } from '@makucho/studio-contracts';
import { agendaDoPlano } from '@makucho/studio-contracts';
import { assets as apiAssets, marca as apiMarca, type Asset, type PerfilDeMarca } from '../../lib/api';
import { tempo } from '../editor/funcoes';
import { IconeMais, IconeMarca } from '../icones';

interface Props {
  plan: EditPlanV1;
  posicaoMs: number;
  onOperacao: (op: TimelineOperation) => void;
}

const LOGOS: Record<string, string> = { LOGO: 'Principal', LOGO_NEGATIVE: 'Para fundo escuro', LOGO_COMPACT: 'Ícone', WATERMARK: "Marca d'água" };

export function MarcaNoEditor({ plan, posicaoMs, onOperacao }: Props) {
  const [perfil, setPerfil] = useState<PerfilDeMarca | null | undefined>(undefined);
  const [arquivos, setArquivos] = useState<Asset[] | null>(null);

  useEffect(() => {
    void apiMarca.obter().then(setPerfil).catch(() => setPerfil(null));
    void apiAssets.listar().then(setArquivos).catch(() => setArquivos([]));
  }, []);

  const itens = (perfil?.videoDefaults as PreferenciasDeVideo | undefined)?.itensDaMarca ?? [];
  const nome = (a: Asset) => itens.find((i) => i.assetId === a.id)?.nome || a.originalName.replace(/\.[a-z0-9]{2,5}$/i, '');
  const uso = (a: Asset) => itens.find((i) => i.assetId === a.id)?.uso;
  const total = useMemo(() => agendaDoPlano(plan).duracaoMs, [plan]);
  const cursor = Math.min(Math.max(0, Math.round(posicaoMs)), Math.max(0, total - 500));
  const dos = (kind: string) => (arquivos ?? []).filter((a) => a.kind === kind);

  const vinheta = (kind: 'INTRO' | 'OUTRO') => {
    const atual = kind === 'INTRO' ? plan.intro : plan.outro;
    const lista = dos(kind);
    const op = kind === 'INTRO' ? 'definir_abertura' : 'definir_encerramento';
    return (
      <div className="campo" style={{ margin: 0 }}>
        <label className="campo__rotulo" htmlFor={`vinheta-${kind}`}>
          {kind === 'INTRO' ? 'Vinheta de abertura' : 'Vinheta de encerramento'}
        </label>
        <select
          id={`vinheta-${kind}`}
          className="campo__selecao"
          value={atual?.assetId ?? ''}
          disabled={lista.length === 0}
          onChange={(e) => {
            const a = lista.find((x) => x.id === e.target.value);
            if (!e.target.value) onOperacao({ op, assetId: null });
            else if (a?.durationMs) onOperacao({ op, assetId: a.id, durationMs: Math.min(30_000, Math.max(200, a.durationMs)) });
          }}
        >
          <option value="">{lista.length ? 'Sem vinheta' : 'Nenhuma na Biblioteca da marca'}</option>
          {lista.map((a) => (
            <option key={a.id} value={a.id} disabled={!a.durationMs}>
              {nome(a)}
              {a.durationMs ? ` (${(a.durationMs / 1000).toFixed(1)} s)` : ' (envie de novo para medir a duração)'}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const Item = ({ a, acao, rotulo }: { a: Asset; acao: () => void; rotulo: string }) => (
    <li className="marca-editor__item">
      <span className="marca-editor__texto">
        <strong>{nome(a)}</strong>
        {uso(a) && <span>{uso(a)}</span>}
      </span>
      <button type="button" className="botao botao--secundario botao--pequeno" onClick={acao}>
        <IconeMais size={13} /> {rotulo}
      </button>
    </li>
  );

  const carregando = arquivos === null || perfil === undefined;
  const logos = (arquivos ?? []).filter((a) => a.kind in LOGOS);

  return (
    <>
      <header className="painel__cabecalho">
        <span className="linha" style={{ gap: 'var(--e2)' }}>
          <IconeMarca size={20} />
          <strong style={{ fontSize: 17 }}>{perfil?.name && perfil.name !== 'Kit de marca' ? perfil.name : 'Sua marca'}</strong>
        </span>
      </header>
      <div className="marca-editor">
        {carregando ? (
          <span className="esqueleto" style={{ height: 80 }} />
        ) : (
          <>
            {perfil && (
              <div className="linha" style={{ gap: 6 }}>
                {Object.entries(perfil.colors).map(([k, cor]) => (
                  <span key={k} title={cor} className="marca-editor__cor" style={{ background: cor }} />
                ))}
              </div>
            )}

            <section className="marca-editor__grupo">
              <h3>Vinhetas</h3>
              {vinheta('INTRO')}
              {vinheta('OUTRO')}
              <p className="campo__ajuda" style={{ margin: 0 }}>Entram inteiras antes e depois do vídeo, no arquivo exportado.</p>
            </section>

            {logos.length > 0 && (
              <section className="marca-editor__grupo">
                <h3>Logos</h3>
                <ul className="marca-editor__lista">
                  {logos.map((a) => (
                    <li key={a.id} className="marca-editor__item">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={apiAssets.url(a.id)} alt="" className="marca-editor__logo" data-escuro={a.kind === 'LOGO_NEGATIVE' || undefined} />
                      <span className="marca-editor__texto">
                        <strong>{LOGOS[a.kind]}</strong>
                      </span>
                      <button
                        type="button"
                        className="botao botao--secundario botao--pequeno"
                        onClick={() => onOperacao({ op: 'adicionar_overlay', component: 'LogoBug', assetId: a.id, variant: 'sd', timelineStartMs: 0, durationMs: Math.max(300, total) })}
                      >
                        <IconeMais size={13} /> No vídeo
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {dos('MUSIC').length > 0 && (
              <section className="marca-editor__grupo">
                <h3>Trilhas</h3>
                <ul className="marca-editor__lista">
                  {dos('MUSIC').map((a) => (
                    <Item key={a.id} a={a} rotulo={plan.music?.assetId === a.id ? 'Em uso' : 'Usar'} acao={() => onOperacao({ op: 'trocar_musica', assetId: a.id, gainDb: -20, duckUnderVoice: true })} />
                  ))}
                </ul>
              </section>
            )}

            {dos('SOUND_EFFECT').length > 0 && (
              <section className="marca-editor__grupo">
                <h3>Sons da marca</h3>
                <ul className="marca-editor__lista">
                  {dos('SOUND_EFFECT').map((a) => (
                    <Item key={a.id} a={a} rotulo={`em ${tempo(cursor)}`} acao={() => onOperacao({ op: 'adicionar_efeito_sonoro', assetId: a.id, timelineStartMs: cursor, gainDb: -10 })} />
                  ))}
                </ul>
              </section>
            )}

            {(dos('IMAGE').length > 0 || dos('VIDEO').length > 0) && (
              <section className="marca-editor__grupo">
                <h3>Imagens e vídeos</h3>
                <ul className="marca-editor__lista">
                  {[...dos('IMAGE'), ...dos('VIDEO')].map((a) => (
                    <Item
                      key={a.id}
                      a={a}
                      rotulo={`em ${tempo(cursor)}`}
                      acao={() =>
                        onOperacao({
                          op: 'adicionar_midia',
                          assetId: a.id,
                          kind: a.kind === 'VIDEO' ? 'video' : 'image',
                          layout: 'tela_cheia',
                          timelineStartMs: cursor,
                          durationMs: Math.max(500, Math.min(a.durationMs ?? 3000, 5000, total - cursor)),
                        })
                      }
                    />
                  ))}
                </ul>
              </section>
            )}

            {(arquivos ?? []).length === 0 && <p className="texto-secundario">Nenhum arquivo da marca ainda.</p>}
          </>
        )}
        <Link href="/marca" className="botao botao--secundario">
          Abrir o Kit de marca
        </Link>
      </div>
    </>
  );
}
