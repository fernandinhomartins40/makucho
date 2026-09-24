'use client';

// ============================================================
// Instalação do app: o banner e o passo a passo.
//
//   Android/desktop com diálogo nativo → "Instalar": o navegador abre o
//     próprio diálogo, e ao confirmar baixa e instala sozinho;
//   iPhone/iPad → o passo a passo da versão do iOS e do navegador que
//     a pessoa está usando, com o desenho de cada botão;
//   sem diálogo (Firefox, critérios não atendidos) → o caminho pelo menu.
//
// O banner não aparece para quem já abriu como app, e "Agora não"
// o esconde por 14 dias. A instalação continua sempre disponível no
// menu "Mais" e em Configurações.
// ============================================================

import { useEffect, useState } from 'react';
import { guiaParaApple, guiaSemDialogo, type GuiaDeInstalacao, type PassoDeInstalacao } from '../../lib/plataforma';
import { adiar, foiAdiado, useInstalacao } from '../../lib/instalacao';

/** O desenho de cada botão, como aparece no aparelho. */
function IconeDoPasso({ icone }: { icone: PassoDeInstalacao['icone'] }) {
  const comum = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (icone) {
    case 'compartilhar':
      // O "quadrado com seta para cima" do iOS.
      return (
        <svg {...comum} aria-hidden>
          <path d="M12 3v12" />
          <path d="M8 7l4-4 4 4" />
          <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
        </svg>
      );
    case 'mais':
      return (
        <svg {...comum} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <circle cx="8" cy="12" r="0.8" fill="currentColor" />
          <circle cx="12" cy="12" r="0.8" fill="currentColor" />
          <circle cx="16" cy="12" r="0.8" fill="currentColor" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...comum} aria-hidden>
          <circle cx="12" cy="5" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="19" r="1" fill="currentColor" />
        </svg>
      );
    case 'adicionar':
      // "Adicionar à Tela de Início": quadrado com +.
      return (
        <svg {...comum} aria-hidden>
          <rect x="4" y="4" width="16" height="16" rx="4" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case 'safari':
      return (
        <svg {...comum} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M15.5 8.5l-2 5-5 2 2-5z" />
        </svg>
      );
    case 'instalar':
      return (
        <svg {...comum} aria-hidden>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M12 8v6M9 11l3 3 3-3M8 21h8" />
        </svg>
      );
    default:
      return (
        <svg {...comum} aria-hidden>
          <path d="M5 12l4 4 10-10" />
        </svg>
      );
  }
}

export function PassoAPasso({ guia }: { guia: GuiaDeInstalacao }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="guia-instalacao">
      <ol className="guia-instalacao__passos">
        {guia.passos.map((p, i) => (
          <li key={i}>
            <span className="guia-instalacao__numero">{i + 1}</span>
            <span className="guia-instalacao__icone">
              <IconeDoPasso icone={p.icone} />
            </span>
            <span>{p.texto}</span>
          </li>
        ))}
      </ol>
      {guia.abrirNoSafari && (
        <button
          type="button"
          className="botao botao--secundario botao--pequeno"
          onClick={() => {
            void navigator.clipboard?.writeText(window.location.origin).then(() => setCopiado(true));
          }}
        >
          {copiado ? 'Endereço copiado' : `Copiar ${typeof window !== 'undefined' ? window.location.host : 'o endereço'}`}
        </button>
      )}
      {guia.dica && <p className="campo__ajuda">{guia.dica}</p>}
    </div>
  );
}

/** O guia certo para esta plataforma (null quando o diálogo nativo resolve). */
export function useGuiaDeInstalacao() {
  const estado = useInstalacao();
  const p = estado.plataforma;
  const guia: GuiaDeInstalacao | null = !p
    ? null
    : p.sistema === 'ios' || p.sistema === 'ipados'
      ? guiaParaApple(p)
      : estado.podeInstalarNativo
        ? null
        : guiaSemDialogo(p);
  return { ...estado, guia };
}

/**
 * O banner. Aparece alguns segundos depois de abrir (e não por cima da
 * primeira coisa que a pessoa vê), no celular e no computador.
 */
export function BannerDeInstalacao() {
  const { plataforma, instalado, podeInstalarNativo, instalar, guia } = useGuiaDeInstalacao();
  const [visivel, setVisivel] = useState(false);
  const [aberto, setAberto] = useState(false);

  const apple = plataforma?.sistema === 'ios' || plataforma?.sistema === 'ipados';
  const temOferta = podeInstalarNativo || apple;

  useEffect(() => {
    if (!plataforma || instalado || !temOferta || foiAdiado()) return;
    const t = setTimeout(() => setVisivel(true), 2500);
    return () => clearTimeout(t);
  }, [plataforma, instalado, temOferta]);

  if (!visivel || instalado) return null;

  const fechar = () => {
    adiar();
    setVisivel(false);
  };

  return (
    <div className="banner-instalacao" role="dialog" aria-labelledby="banner-instalacao-titulo">
      <div className="banner-instalacao__topo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/pwa/icone/icon-192.png" alt="" className="banner-instalacao__icone" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong id="banner-instalacao-titulo" style={{ display: 'block', fontSize: 15 }}>
            Instale o MAKUCHO Studio
          </strong>
          <span className="texto-secundario" style={{ fontSize: 12 }}>
            Abre em tela cheia, direto da tela inicial, como um app.
          </span>
        </div>
        <button type="button" className="botao-icone botao-icone--pequeno" aria-label="Agora não" onClick={fechar}>
          ✕
        </button>
      </div>

      {podeInstalarNativo ? (
        <div className="linha" style={{ gap: 'var(--e2)', justifyContent: 'flex-end' }}>
          <button type="button" className="botao botao--fantasma botao--pequeno" onClick={fechar}>
            Agora não
          </button>
          <button
            type="button"
            className="botao botao--pequeno"
            onClick={() => void instalar().then((ok) => ok && setVisivel(false))}
          >
            Instalar
          </button>
        </div>
      ) : aberto && guia ? (
        <PassoAPasso guia={guia} />
      ) : (
        <div className="linha" style={{ gap: 'var(--e2)', justifyContent: 'flex-end' }}>
          <button type="button" className="botao botao--fantasma botao--pequeno" onClick={fechar}>
            Agora não
          </button>
          <button type="button" className="botao botao--pequeno" onClick={() => setAberto(true)}>
            Como instalar
          </button>
        </div>
      )}
    </div>
  );
}
