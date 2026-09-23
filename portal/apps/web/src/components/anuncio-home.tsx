'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { AdvertisementDto } from '@makucho/types';
import { api, urlDaImagem } from '@/lib/api';

/** Slot real do CMS. Sem campanha elegível, não exibe um anúncio fictício. */
const impressoNestaNavegacao = new Set<string>();

export function AnuncioSlot({ posicao }: { posicao: string }) {
  const [anuncio, setAnuncio] = useState<AdvertisementDto | null>(null);
  const elemento = useRef<HTMLElement>(null);

  useEffect(() => {
    let ativo = true;
    api.anuncios(posicao)
      .then((itens) => {
        if (ativo) setAnuncio(itens[0] ?? null);
      })
      .catch(() => {
        if (ativo) setAnuncio(null);
      });
    return () => { ativo = false; };
  }, [posicao]);

  useEffect(() => {
    if (!anuncio) return;
    const chave = `${posicao}:${anuncio.id}`;
    if (impressoNestaNavegacao.has(chave)) return;
    const observer = new IntersectionObserver((entradas) => {
      if (!entradas[0]?.isIntersecting || impressoNestaNavegacao.has(chave)) return;
      impressoNestaNavegacao.add(chave);
      void api.registrarImpressao(anuncio.id, posicao).catch(() => undefined);
      observer.disconnect();
    }, { threshold: 0.5 });
    if (elemento.current) observer.observe(elemento.current);
    return () => observer.disconnect();
  }, [anuncio, posicao]);

  if (!anuncio && posicao === 'HOME_MIDDLE') {
    return (
      <aside className="hub-ad" aria-label="Espaço publicitário reservado">
        <span>Publicidade</span>
        <div>Google Ads (728 × 90)</div>
      </aside>
    );
  }
  if (!anuncio) return null;
  const imagem = urlDaImagem(anuncio.media, 'LARGE');
  const imagemMobile = urlDaImagem(anuncio.mobileMedia, 'MEDIUM');
  if (!imagem) return null;

  return (
    <aside ref={elemento} className="hub-ad-real" aria-label="Publicidade">
      <span>Publicidade</span>
      <a
        href={`/api/ads/click/${anuncio.id}`}
        target={anuncio.openInNewTab ? '_blank' : undefined}
        rel={anuncio.openInNewTab ? 'noopener noreferrer' : undefined}
      >
        <picture>
          {imagemMobile && <source media="(max-width: 767px)" srcSet={imagemMobile} />}
          <Image
            src={imagem}
            alt={anuncio.alt}
            width={anuncio.widthPx ?? 1200}
            height={anuncio.heightPx ?? 150}
            sizes="(max-width: 1200px) 100vw, 1200px"
          />
        </picture>
      </a>
    </aside>
  );
}
