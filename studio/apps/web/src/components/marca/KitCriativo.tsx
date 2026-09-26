'use client';

// ============================================================
// Kit criativo: os pedidos prontos para criar o que é da marca fora do
// Studio, com IA -- trilhas e sons no Suno, abertura e encerramento e
// vídeos de apoio num gerador de vídeo (Sora, Veo, Kling, Runway, com a
// logo anexada), imagens no GPT Image.
//
// Cada cartão diz ONDE colar e tem o texto pronto para copiar. E fecha o
// ciclo no próprio cartão: o arquivo gerado é enviado ali, fica LIGADO
// ao prompt (salvo no kit) e a IA do editor passa a ler o prompt como a
// descrição do arquivo -- sabe como a trilha soa e o que o vídeo mostra
// sem abri-lo, e usa cada um no lugar certo.
// ============================================================

import { useRef, useState } from 'react';
import type { KitCriativo as Kit, SecaoDoKit } from '@makucho/studio-contracts';
import { TIPO_DA_SECAO } from '@makucho/studio-contracts';
import { assets as apiAssets, type Asset } from '../../lib/api';
import { IconeCopiar, IconeCheck, IconeIA, IconeLinkExterno, IconeAudio, IconeVideo, IconeMidia, IconeEnviar, IconeLixeira } from '../icones';
import type { TipoDaBiblioteca } from './BibliotecaDaMarca';

interface Props {
  kit: Kit | null | undefined;
  /** URL de cada versão da logo enviada, para baixar e anexar no gerador. */
  logos?: Partial<Record<'LOGO' | 'LOGO_NEGATIVE' | 'LOGO_COMPACT', string>>;
  /** Os arquivos da marca (para mostrar os ligados a cada prompt). */
  arquivos?: readonly Asset[];
  /** `kit:<secao>:<indice>` enquanto um cartão envia. */
  enviando?: string | null;
  onEnviarArquivo?: (secao: SecaoDoKit, indice: number, arquivos: File[]) => void;
  onRemoverArquivo?: (secao: SecaoDoKit, indice: number, assetId: string) => void;
  /** Leva para a Biblioteca, na aba do tipo de arquivo. */
  onEnviar: (tipo: TipoDaBiblioteca) => void;
  /** Não há kit ainda: leva ao "Configurar com IA". */
  onGerar: () => void;
}

const LOGO: Record<string, string> = { LOGO: 'a logo principal', LOGO_NEGATIVE: 'a logo para fundo escuro (versão clara)', LOGO_COMPACT: 'o ícone (só o símbolo)' };

/** O que cada seção aceita e como o botão chama o arquivo. */
const ENVIO: Record<SecaoDoKit, { accept: string; nome: string }> = {
  trilhas: { accept: 'audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a', nome: 'a trilha gerada' },
  sons: { accept: 'audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a', nome: 'o som gerado' },
  abertura: { accept: 'video/mp4,video/webm,video/quicktime', nome: 'a abertura gerada' },
  encerramento: { accept: 'video/mp4,video/webm,video/quicktime', nome: 'o encerramento gerado' },
  imagens: { accept: 'image/png,image/jpeg,image/webp', nome: 'a imagem gerada' },
  videos: { accept: 'video/mp4,video/webm,video/quicktime', nome: 'o vídeo gerado' },
};

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

const GERADORES_DE_VIDEO = [
  { nome: 'Sora', href: 'https://sora.chatgpt.com/' },
  { nome: 'Veo', href: 'https://labs.google/fx/tools/flow' },
  { nome: 'Kling', href: 'https://klingai.com/' },
  { nome: 'Runway', href: 'https://app.runwayml.com/' },
];

function Geradores() {
  return (
    <span className="kit__ferramentas">
      {GERADORES_DE_VIDEO.map((g) => (
        <Ferramenta key={g.nome} href={g.href} nome={g.nome} />
      ))}
    </span>
  );
}

/**
 * O fim de cada cartão: os arquivos já gerados a partir deste prompt, com
 * prévia, e o botão para enviar o próximo.
 */
function ArquivosDoPrompt({
  secao,
  indice,
  assetIds,
  arquivos,
  enviando,
  onEnviar,
  onRemover,
}: {
  secao: SecaoDoKit;
  indice: number;
  assetIds: readonly string[] | undefined;
  arquivos: readonly Asset[];
  enviando: boolean;
  onEnviar?: (arquivos: File[]) => void;
  onRemover?: (assetId: string) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const ligados = (assetIds ?? []).map((id) => arquivos.find((a) => a.id === id)).filter((a): a is Asset => Boolean(a));
  const tipo = TIPO_DA_SECAO[secao];
  if (!onEnviar) return null;
  return (
    <div className="kit-arquivos" data-cartao={`${secao}:${indice}`} data-com-arquivo={ligados.length > 0 || undefined}>
      {ligados.length > 0 && (
        <ul className="kit-arquivos__lista">
          {ligados.map((a) => (
            <li key={a.id}>
              <span className="kit-arquivos__ok" aria-hidden>
                <IconeCheck size={12} weight="bold" />
              </span>
              <span className="kit-arquivos__previa">
                {tipo === 'MUSIC' || tipo === 'SOUND_EFFECT' ? (
                  <audio controls preload="none" src={apiAssets.url(a.id)} />
                ) : tipo === 'IMAGE' ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={apiAssets.url(a.id)} alt="" />
                ) : (
                  <video src={apiAssets.url(a.id)} preload="metadata" muted playsInline controls />
                )}
              </span>
              <span className="kit-arquivos__nome" title={a.originalName}>
                {a.originalName}
              </span>
              {onRemover && (
                <button type="button" className="botao-icone botao-icone--pequeno" aria-label={`Remover ${a.originalName}`} onClick={() => onRemover(a.id)}>
                  <IconeLixeira size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="kit-arquivos__envio">
        <button type="button" className="botao botao--secundario botao--pequeno" disabled={enviando} onClick={() => entrada.current?.click()}>
          <IconeEnviar size={14} />
          {enviando ? 'Enviando…' : ligados.length ? 'Enviar outra versão' : `Enviar ${ENVIO[secao].nome}`}
        </button>
        <small>
          {ligados.length
            ? 'Ligado a este prompt: a IA do editor sabe o que é e quando usar.'
            : 'Gerou? Envie aqui: o arquivo fica ligado a este prompt, e a IA do editor entende o que ele é.'}
        </small>
      </div>
      <input
        ref={entrada}
        type="file"
        hidden
        multiple={secao !== 'abertura' && secao !== 'encerramento'}
        accept={ENVIO[secao].accept}
        onChange={(e) => {
          const lista = [...(e.target.files ?? [])];
          e.target.value = '';
          if (lista.length) onEnviar(lista);
        }}
      />
    </div>
  );
}

/** Um prompt do kit: nome, para que serve, o texto e, embaixo, os arquivos gerados. */
function Prompt({ nome, uso, texto, detalhe, comArquivo, rodape }: { nome: string; uso: string; texto: string; detalhe?: string; comArquivo: boolean; rodape: React.ReactNode }) {
  return (
    <div className="kit-prompt" data-com-arquivo={comArquivo || undefined}>
      <div className="kit-prompt__topo">
        <span>
          <strong>{nome}</strong>
          {uso && <small>{uso}</small>}
        </span>
        <Copiar texto={texto} />
      </div>
      <p className="kit-prompt__texto">{texto}</p>
      {detalhe && <p className="kit-prompt__detalhe">{detalhe}</p>}
      {rodape}
    </div>
  );
}

export function KitCriativo({ kit, logos = {}, arquivos = [], enviando = null, onEnviarArquivo, onRemoverArquivo, onEnviar, onGerar }: Props) {
  if (!kit) {
    return (
      <div className="kit-vazio">
        <span className="kit-vazio__icone" aria-hidden>
          <IconeIA size={24} weight="fill" />
        </span>
        <h2>Crie o que é da sua marca com IA</h2>
        <p>
          O &ldquo;Configurar com IA&rdquo; monta, junto com as cores e o estilo, os prompts prontos para criar a trilha e os sons da marca no Suno, a
          abertura, o encerramento e vídeos de apoio numa IA de vídeo (Sora, Veo, Kling, Runway) e imagens no GPT Image. É só copiar e colar.
        </p>
        <button type="button" className="botao botao--primario" onClick={onGerar}>
          <IconeIA size={16} weight="fill" /> Configurar com IA
        </button>
      </div>
    );
  }

  const arquivosDe = (secao: SecaoDoKit, indice: number, assetIds: readonly string[] | undefined) => (
    <ArquivosDoPrompt
      secao={secao}
      indice={indice}
      assetIds={assetIds}
      arquivos={arquivos}
      enviando={enviando === `kit:${secao}:${indice}`}
      {...(onEnviarArquivo ? { onEnviar: (l: File[]) => onEnviarArquivo(secao, indice, l) } : {})}
      {...(onRemoverArquivo ? { onRemover: (id: string) => onRemoverArquivo(secao, indice, id) } : {})}
    />
  );

  const vinheta = (v: NonNullable<Kit['abertura']>, secao: 'abertura' | 'encerramento') => {
    const urlDaLogo = logos[v.logo];
    return (
      <div className="kit-vinheta" data-com-arquivo={(v.assetIds?.length ?? 0) > 0 || undefined}>
        <div className="kit-prompt__topo">
          <span>
            <strong>{v.nome}</strong>
            <small>{v.duracaoS.toString().replace('.', ',')} s · vertical 9:16</small>
          </span>
          {v.prompt && <Copiar texto={v.prompt} rotulo="Copiar prompt" />}
        </div>
        {v.prompt ? (
          <>
            <p className="kit-vinheta__logo">
              <strong>1.</strong> Anexe no gerador, como imagem de referência, {LOGO[v.logo] ?? 'a logo principal'}.{' '}
              {urlDaLogo ? (
                <a href={urlDaLogo} download target="_blank" rel="noreferrer">
                  Baixar essa logo
                </a>
              ) : (
                <span className="texto-secundario">(envie essa versão na aba Identidade)</span>
              )}
            </p>
            <p className="kit-vinheta__logo">
              <strong>2.</strong> Cole o prompt abaixo e gere o vídeo.
            </p>
            <p className="kit-prompt__texto">{v.prompt}</p>
          </>
        ) : (
          <p className="kit-prompt__detalhe">
            Este kit é do formato antigo (passos de editor). Clique em &ldquo;Configurar com IA&rdquo; para gerar o prompt para a IA de vídeo.
          </p>
        )}
        {v.som && (
          <div className="kit-vinheta__som">
            <span>
              <IconeAudio size={14} /> <strong>3.</strong> Som da vinheta (Suno)
            </span>
            <p className="kit-prompt__texto">{v.som}</p>
            <Copiar texto={v.som} />
          </div>
        )}
        <p className="kit-vinheta__logo">
          <strong>4.</strong> Junte o vídeo e o som (o gerador de vídeo ou o Suno exportam juntos) e envie aqui.
        </p>
        {arquivosDe(secao, 0, v.assetIds)}
      </div>
    );
  };

  return (
    <div className="kit">
      <p className="kit__intro">
        Prompts prontos para ferramentas de IA, com as cores, as fontes e o jeito da sua marca. Copie, cole na ferramenta indicada, gere o arquivo
        e envie no próprio cartão: ele fica ligado ao prompt, e a IA do editor sabe o que é e onde usar.
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
            {kit.trilhas.map((t, i) => (
              <Prompt key={`t${i}`} nome={t.nome} uso={t.uso} texto={t.estilo} comArquivo={(t.assetIds?.length ?? 0) > 0} rodape={arquivosDe('trilhas', i, t.assetIds)} />
            ))}
            {kit.sons.map((t, i) => (
              <Prompt
                key={`s${i}`}
                nome={t.nome}
                uso={t.uso}
                texto={t.prompt}
                detalhe="Som curto: depois de gerar, corte só o trecho que interessa."
                comArquivo={(t.assetIds?.length ?? 0) > 0} rodape={arquivosDe('sons', i, t.assetIds)}
              />
            ))}
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
              <p>
                Prompts para a IA que gera vídeo (Sora, Veo, Kling ou Runway). Anexe a logo indicada, cole o prompt e gere; o som sai no Suno.
              </p>
            </div>
            <Geradores />
          </header>
          <div className="kit__vinhetas">
            {kit.abertura && vinheta(kit.abertura, 'abertura')}
            {kit.encerramento && vinheta(kit.encerramento, 'encerramento')}
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
              <p>Cole no ChatGPT (GPT Image) e peça no formato indicado. Depois baixe a imagem e envie no cartão.</p>
            </div>
            <Ferramenta href="https://chatgpt.com/" nome="ChatGPT" />
          </header>
          <div className="kit__lista">
            {kit.imagens.map((t, i) => (
              <Prompt key={`i${i}`} nome={`${t.nome} · ${t.formato}`} uso={t.uso} texto={t.prompt} comArquivo={(t.assetIds?.length ?? 0) > 0} rodape={arquivosDe('imagens', i, t.assetIds)} />
            ))}
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
              <p>Cole num gerador de vídeo (Sora, Veo, Kling ou Runway) em formato vertical. Servem para cobrir a fala nos seus vídeos.</p>
            </div>
            <Geradores />
          </header>
          <div className="kit__lista">
            {kit.videos.map((t, i) => (
              <Prompt key={`v${i}`} nome={t.nome} uso={t.uso} texto={t.prompt} comArquivo={(t.assetIds?.length ?? 0) > 0} rodape={arquivosDe('videos', i, t.assetIds)} />
            ))}
          </div>
        </section>
      )}

      <p className="kit__rodape-geral">
        Todos os arquivos enviados também aparecem na{' '}
        <button type="button" className="kit__link" onClick={() => onEnviar('MUSIC')}>
          Biblioteca da marca
        </button>
        .
      </p>
    </div>
  );
}
