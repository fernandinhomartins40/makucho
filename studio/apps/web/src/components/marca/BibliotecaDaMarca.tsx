'use client';

// ============================================================
// Biblioteca da marca: trilhas, sons, vinhetas de abertura e de
// encerramento, imagens e vídeos da própria marca.
//
// Cada item tem nome e "para que serve". É o que a IA do editor lê para
// escolher sozinha ("põe o som da marca na dica", "abre com a vinheta")
// -- ela não ouve nem assiste o arquivo, lê a descrição.
// ============================================================

import { useState } from 'react';
import type { PreferenciasDeVideo } from '@makucho/studio-contracts';
import { assets as apiAssets, type Asset } from '../../lib/api';
import { IconeEnviar, IconeLixeira, IconeCheck } from '../icones';

type ItensDaMarca = NonNullable<PreferenciasDeVideo['itensDaMarca']>;

export const CATEGORIAS_DA_BIBLIOTECA = [
  {
    kind: 'MUSIC',
    rotulo: 'Trilhas',
    ajuda: 'Músicas de fundo que você tem direito de usar. A padrão entra em todo vídeo novo e abaixa sozinha quando você fala.',
    accept: 'audio/mpeg,audio/wav,audio/ogg',
    exemplo: 'Ex.: animada, para vídeos de oferta',
    padrao: 'Trilha padrão',
  },
  {
    kind: 'SOUND_EFFECT',
    rotulo: 'Sons',
    ajuda: 'A assinatura sonora da marca: um "plim", uma vinheta curta. Até 2 MB.',
    accept: 'audio/mpeg,audio/wav,audio/ogg',
    exemplo: 'Ex.: quando aparece uma dica',
  },
  {
    kind: 'INTRO',
    rotulo: 'Aberturas',
    ajuda: 'Animação (da logo, por exemplo) que entra ANTES do vídeo. Até 50 MB; de 1 a 5 segundos funciona melhor.',
    accept: 'video/mp4,video/webm',
    exemplo: 'Ex.: a versão curta, para todo vídeo',
    padrao: 'Abertura padrão',
  },
  {
    kind: 'OUTRO',
    rotulo: 'Encerramentos',
    ajuda: 'Animação que entra DEPOIS do vídeo: logo, "siga", site. Até 50 MB.',
    accept: 'video/mp4,video/webm',
    exemplo: 'Ex.: com o @ do Instagram',
    padrao: 'Encerramento padrão',
  },
  {
    kind: 'IMAGE',
    rotulo: 'Imagens',
    ajuda: 'Fotos do produto, da loja, selos e fundos da marca.',
    accept: 'image/png,image/jpeg,image/webp,image/gif',
    exemplo: 'Ex.: foto da fachada da loja',
  },
  {
    kind: 'VIDEO',
    rotulo: 'Vídeos',
    ajuda: 'Cenas da marca para cobrir a fala (B-roll): produto, bastidores, equipe.',
    accept: 'video/mp4,video/webm',
    exemplo: 'Ex.: produto sendo usado',
  },
] as const;

export type TipoDaBiblioteca = (typeof CATEGORIAS_DA_BIBLIOTECA)[number]['kind'];

interface Props {
  assets: readonly Asset[];
  itens: ItensDaMarca;
  onItens: (itens: ItensDaMarca) => void;
  /** O padrão de cada tipo que tem padrão (trilha, abertura, encerramento). */
  padroes: Partial<Record<'MUSIC' | 'INTRO' | 'OUTRO', string | undefined>>;
  onPadrao: (kind: 'MUSIC' | 'INTRO' | 'OUTRO', id: string) => void;
  enviando: string | null;
  onEnviar: (kind: string, arquivos: File[]) => void;
  onRemover: (id: string) => void;
  /** Aba aberta de fora (o kit criativo leva direto ao tipo certo). */
  aba?: TipoDaBiblioteca;
  onAba?: (tipo: TipoDaBiblioteca) => void;
}

const segundos = (ms: number | null) => (ms ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : null);
const semExtensao = (nome: string) => nome.replace(/\.[a-z0-9]{2,5}$/i, '');

export function BibliotecaDaMarca({ assets, itens, onItens, padroes, onPadrao, enviando, onEnviar, onRemover, aba: abaDeFora, onAba }: Props) {
  const [abaLocal, setAbaLocal] = useState<TipoDaBiblioteca>('MUSIC');
  const aba = abaDeFora ?? abaLocal;
  const setAba = (t: TipoDaBiblioteca) => (onAba ? onAba(t) : setAbaLocal(t));
  const categoria = CATEGORIAS_DA_BIBLIOTECA.find((c) => c.kind === aba)!;
  const lista = assets.filter((a) => a.kind === aba);
  const nota = (id: string) => itens.find((i) => i.assetId === id);

  const anotar = (id: string, mudanca: { nome?: string; uso?: string }) => {
    const atual = nota(id) ?? { assetId: id };
    const novo = { ...atual, ...mudanca };
    onItens([...itens.filter((i) => i.assetId !== id), novo].slice(-120));
  };

  // O padrão efetivo: o escolhido, ou o mais recente (o que o servidor usa).
  const temPadrao = 'padrao' in categoria;
  const escolhido = temPadrao ? padroes[aba as 'MUSIC' | 'INTRO' | 'OUTRO'] : undefined;
  const padraoDaAba = temPadrao ? (escolhido && lista.some((a) => a.id === escolhido) ? escolhido : lista[0]?.id) : undefined;

  return (
    <div className="biblioteca-da-marca">
      <div className="biblioteca-da-marca__abas" role="tablist" aria-label="Tipo de arquivo da marca">
        {CATEGORIAS_DA_BIBLIOTECA.map((c) => {
          const n = assets.filter((a) => a.kind === c.kind).length;
          return (
            <button key={c.kind} type="button" role="tab" aria-selected={aba === c.kind} className="biblioteca-da-marca__aba" onClick={() => setAba(c.kind)}>
              {c.rotulo}
              {n > 0 && <span className="biblioteca-da-marca__conta">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="linha entre" style={{ gap: 'var(--e3)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <p className="campo__ajuda" style={{ margin: 0, flex: '1 1 260px' }}>
          {categoria.ajuda}
        </p>
        <label className="botao botao--secundario botao--pequeno" style={{ cursor: enviando === aba ? 'progress' : 'pointer' }}>
          <IconeEnviar size={14} />
          {enviando === aba ? 'Enviando…' : `Enviar ${categoria.rotulo.toLowerCase()}`}
          <input
            type="file"
            accept={categoria.accept}
            multiple
            hidden
            disabled={enviando !== null}
            onChange={(e) => {
              const arquivos = [...(e.target.files ?? [])];
              e.target.value = '';
              if (arquivos.length) onEnviar(aba, arquivos);
            }}
          />
        </label>
      </div>

      {lista.length === 0 ? (
        <p className="biblioteca-da-marca__vazio">Nenhum arquivo aqui ainda.</p>
      ) : (
        <ul className="biblioteca-da-marca__lista">
          {lista.map((a) => {
            const n = nota(a.id);
            const ehPadrao = padraoDaAba === a.id;
            return (
              <li key={a.id} className="item-da-marca" data-padrao={ehPadrao || undefined}>
                <div className="item-da-marca__previa">
                  {a.kind === 'MUSIC' || a.kind === 'SOUND_EFFECT' ? (
                    <audio controls preload="none" src={apiAssets.url(a.id)} />
                  ) : a.kind === 'IMAGE' ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={apiAssets.url(a.id)} alt="" />
                  ) : (
                    <video src={apiAssets.url(a.id)} preload="metadata" muted playsInline controls />
                  )}
                </div>
                <div className="item-da-marca__campos">
                  <input
                    className="campo__entrada"
                    value={n?.nome ?? semExtensao(a.originalName)}
                    maxLength={60}
                    aria-label="Nome"
                    onChange={(e) => anotar(a.id, { nome: e.target.value })}
                  />
                  <input
                    className="campo__entrada"
                    value={n?.uso ?? ''}
                    maxLength={160}
                    placeholder={`Para que serve? ${categoria.exemplo}`}
                    aria-label="Para que serve (a IA lê isto)"
                    onChange={(e) => anotar(a.id, { uso: e.target.value })}
                  />
                  <span className="item-da-marca__meta">
                    {[segundos(a.durationMs), `${(a.sizeBytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="item-da-marca__acoes">
                  {'padrao' in categoria &&
                    (ehPadrao ? (
                      <span className="selo selo--sucesso">
                        <IconeCheck size={12} /> {categoria.padrao}
                      </span>
                    ) : (
                      <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => onPadrao(aba as 'MUSIC' | 'INTRO' | 'OUTRO', a.id)}>
                        Usar como padrão
                      </button>
                    ))}
                  <button
                    type="button"
                    className="botao-icone botao-icone--pequeno"
                    aria-label={`Remover ${n?.nome ?? a.originalName}`}
                    disabled={enviando !== null}
                    onClick={() => onRemover(a.id)}
                  >
                    <IconeLixeira size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
