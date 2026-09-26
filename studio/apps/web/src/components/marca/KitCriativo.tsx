'use client';

// ============================================================
// Kit criativo: os pedidos prontos para criar o que é da marca fora do
// Studio -- trilhas e sons no Suno, abertura e encerramento num editor de
// vídeo, imagens no GPT Image e vídeos num gerador de vídeo.
//
// Cada cartão diz ONDE colar, tem o texto pronto com um botão de copiar,
// e termina levando para a aba da Biblioteca onde o arquivo pronto entra.
// ============================================================

import { useState } from 'react';
import type { KitCriativo as Kit } from '@makucho/studio-contracts';
import { IconeCopiar, IconeCheck, IconeIA, IconeLinkExterno, IconeAudio, IconeVideo, IconeMidia, IconeEnviar } from '../icones';
import type { TipoDaBiblioteca } from './BibliotecaDaMarca';

interface Props {
  kit: Kit | null | undefined;
  /** Leva para a Biblioteca, na aba do tipo de arquivo. */
  onEnviar: (tipo: TipoDaBiblioteca) => void;
  /** Não há kit ainda: leva ao "Configurar com IA". */
  onGerar: () => void;
}

const LOGO: Record<string, string> = { LOGO: 'a logo principal', LOGO_NEGATIVE: 'a logo para fundo escuro (versão clara)', LOGO_COMPACT: 'o ícone (só o símbolo)' };

function Copiar({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [feito, setFeito] = useState(false);
  return (
    <button
      type="button"
      className="botao botao--secundario botao--pequeno"
      onClick={() => {
        void navigator.clipboard
          .writeText(texto)
          .then(() => {
            setFeito(true);
            setTimeout(() => setFeito(false), 1600);
          })
          .catch(() => undefined);
      }}
    >
      {feito ? <IconeCheck size={14} /> : <IconeCopiar size={14} />}
      {feito ? 'Copiado' : rotulo}
    </button>
  );
}

function Ferramenta({ href, nome }: { href: string; nome: string }) {
  return (
    <a className="kit__ferramenta" href={href} target="_blank" rel="noreferrer">
      Abrir {nome} <IconeLinkExterno size={13} />
    </a>
  );
}

function Prompt({ nome, uso, texto, detalhe }: { nome: string; uso: string; texto: string; detalhe?: string }) {
  return (
    <div className="kit-prompt">
      <div className="kit-prompt__topo">
        <span>
          <strong>{nome}</strong>
          {uso && <small>{uso}</small>}
        </span>
        <Copiar texto={texto} />
      </div>
      <p className="kit-prompt__texto">{texto}</p>
      {detalhe && <p className="kit-prompt__detalhe">{detalhe}</p>}
    </div>
  );
}

export function KitCriativo({ kit, onEnviar, onGerar }: Props) {
  if (!kit) {
    return (
      <div className="kit-vazio">
        <span className="kit-vazio__icone" aria-hidden>
          <IconeIA size={24} weight="fill" />
        </span>
        <h2>Crie o que é da sua marca com IA</h2>
        <p>
          O &ldquo;Configurar com IA&rdquo; monta, junto com as cores e o estilo, os pedidos prontos para criar a trilha e os sons da marca no Suno, a
          abertura e o encerramento no seu editor de vídeo, e imagens e vídeos com a cara da marca. É só copiar e colar.
        </p>
        <button type="button" className="botao botao--primario" onClick={onGerar}>
          <IconeIA size={16} weight="fill" /> Configurar com IA
        </button>
      </div>
    );
  }

  const vinheta = (v: NonNullable<Kit['abertura']>, tipo: 'INTRO' | 'OUTRO') => {
    const passos = v.passos.map((p, i) => `${i + 1}. ${p}`).join('\n');
    return (
      <div className="kit-vinheta">
        <div className="kit-prompt__topo">
          <span>
            <strong>{v.nome}</strong>
            <small>
              {v.duracaoS.toString().replace('.', ',')} s · use {LOGO[v.logo] ?? 'a logo principal'}
            </small>
          </span>
          <Copiar texto={passos} rotulo="Copiar passos" />
        </div>
        <ol className="kit-vinheta__passos">
          {v.passos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
        {v.som && (
          <div className="kit-vinheta__som">
            <span>
              <IconeAudio size={14} /> Som da vinheta (Suno)
            </span>
            <p className="kit-prompt__texto">{v.som}</p>
            <Copiar texto={v.som} />
          </div>
        )}
        <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => onEnviar(tipo)}>
          <IconeEnviar size={14} /> Pronto? Enviar em {tipo === 'INTRO' ? 'Aberturas' : 'Encerramentos'}
        </button>
      </div>
    );
  };

  return (
    <div className="kit">
      <p className="kit__intro">
        Pedidos prontos, com as cores, as fontes e o jeito da sua marca. Copie, cole na ferramenta indicada, gere o arquivo e envie de volta na
        Biblioteca: a partir daí a IA do editor usa nos seus vídeos.
      </p>

      {(kit.trilhas.length > 0 || kit.sons.length > 0) && (
        <section className="cartao kit__secao">
          <header className="kit__cabeca">
            <span className="kit__icone" aria-hidden>
              <IconeAudio size={18} />
            </span>
            <div>
              <h2>Trilhas e sons</h2>
              <p>
                No Suno, em <strong>Custom</strong>, ligue <strong>Instrumental</strong> e cole o texto em <strong>Style of Music</strong>.
              </p>
            </div>
            <Ferramenta href="https://suno.com/create" nome="Suno" />
          </header>
          <div className="kit__lista">
            {kit.trilhas.map((t) => (
              <Prompt key={t.nome + t.estilo} nome={t.nome} uso={t.uso} texto={t.estilo} />
            ))}
            {kit.sons.map((t) => (
              <Prompt key={t.nome + t.prompt} nome={t.nome} uso={t.uso} texto={t.prompt} detalhe="Som curto: depois de gerar, corte só o trecho que interessa." />
            ))}
          </div>
          <div className="kit__rodape">
            <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => onEnviar('MUSIC')}>
              <IconeEnviar size={14} /> Enviar trilhas
            </button>
            <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => onEnviar('SOUND_EFFECT')}>
              <IconeEnviar size={14} /> Enviar sons
            </button>
          </div>
        </section>
      )}

      {(kit.abertura || kit.encerramento) && (
        <section className="cartao kit__secao">
          <header className="kit__cabeca">
            <span className="kit__icone" aria-hidden>
              <IconeVideo size={18} />
            </span>
            <div>
              <h2>Abertura e encerramento</h2>
              <p>Siga os passos no seu editor de vídeo (CapCut, Canva, Premiere). A logo certa já está indicada em cada um.</p>
            </div>
            <Ferramenta href="https://www.capcut.com/editor" nome="CapCut" />
          </header>
          <div className="kit__vinhetas">
            {kit.abertura && vinheta(kit.abertura, 'INTRO')}
            {kit.encerramento && vinheta(kit.encerramento, 'OUTRO')}
          </div>
        </section>
      )}

      {kit.imagens.length > 0 && (
        <section className="cartao kit__secao">
          <header className="kit__cabeca">
            <span className="kit__icone" aria-hidden>
              <IconeMidia size={18} />
            </span>
            <div>
              <h2>Imagens</h2>
              <p>
                Cole no ChatGPT (GPT Image) e peça no formato indicado. Depois baixe a imagem e envie em <strong>Imagens</strong>.
              </p>
            </div>
            <Ferramenta href="https://chatgpt.com/" nome="ChatGPT" />
          </header>
          <div className="kit__lista">
            {kit.imagens.map((t) => (
              <Prompt key={t.nome + t.prompt} nome={`${t.nome} · ${t.formato}`} uso={t.uso} texto={t.prompt} />
            ))}
          </div>
          <div className="kit__rodape">
            <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => onEnviar('IMAGE')}>
              <IconeEnviar size={14} /> Enviar imagens
            </button>
          </div>
        </section>
      )}

      {kit.videos.length > 0 && (
        <section className="cartao kit__secao">
          <header className="kit__cabeca">
            <span className="kit__icone" aria-hidden>
              <IconeVideo size={18} />
            </span>
            <div>
              <h2>Vídeos de apoio (B-roll)</h2>
              <p>Cole num gerador de vídeo (Sora, Veo, Kling) em formato vertical. Servem para cobrir a fala nos seus vídeos.</p>
            </div>
          </header>
          <div className="kit__lista">
            {kit.videos.map((t) => (
              <Prompt key={t.nome + t.prompt} nome={t.nome} uso={t.uso} texto={t.prompt} />
            ))}
          </div>
          <div className="kit__rodape">
            <button type="button" className="botao botao--fantasma botao--pequeno" onClick={() => onEnviar('VIDEO')}>
              <IconeEnviar size={14} /> Enviar vídeos
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
