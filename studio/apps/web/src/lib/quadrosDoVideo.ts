// ============================================================
// Quadros do vídeo para a tira da timeline (a "película" de cada trecho).
//
// Vêm da PELÍCULA DO SERVIDOR -- uma folha de quadros (sprite sheet) que
// o worker de mídia gera uma vez no preparo, com FFmpeg. O editor baixa
// uma imagem, decodifica fora do processador principal
// (createImageBitmap) e pronto: nenhum <video> a mais na página.
//
// Não há mais reserva no navegador. Antes, sem a película, um <video>
// escondido pulava pela prévia tirando os quadros; mesmo parando
// enquanto a prévia tocava, ele segurava um decodificador e disputava a
// rede com os players, e no celular a reprodução travava. Projeto sem
// película (preparado antes dela existir) fica com os trechos sem
// miniatura -- a prévia fluida vale mais que a tira.
//
// A timeline desenha a tira de cada trecho num <canvas> só, a partir da
// folha, e só redesenha quando algo muda. Guardado por URL enquanto a
// página vive.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { PELICULA, passoDaPelicula, type DescricaoDaPelicula } from '@makucho/studio-contracts';

interface Estado {
  passoMs: number;
  colunas: number;
  largura: number;
  altura: number;
  folha: HTMLCanvasElement | ImageBitmap | null;
  /** Posição de cada quadro já tirado na folha (índice do passo). */
  prontos: Set<number>;
  versao: number;
  ouvintes: Set<() => void>;
}

/** O que a timeline recebe: desenha o quadro de um ponto do original. */
export interface QuadrosDoVideo {
  /** Muda quando chegam quadros novos (a tira redesenha só então). */
  versao: number;
  /** Desenha o quadro mais próximo de `sourceMs`; false se ainda não saiu. */
  desenhar(ctx: CanvasRenderingContext2D, sourceMs: number, x: number, y: number, w: number, h: number): boolean;
}

const porUrl = new Map<string, Estado>();

function avisar(estado: Estado) {
  estado.versao++;
  estado.ouvintes.forEach((f) => f());
}

/** A película pronta do servidor. false = não existe (os trechos ficam sem miniatura). */
async function daPelicula(estado: Estado, urlDaPelicula: string): Promise<boolean> {
  try {
    const r = await fetch(urlDaPelicula, { credentials: 'include' });
    if (!r.ok) return false;
    const d = JSON.parse(r.headers.get('X-Pelicula') ?? '') as DescricaoDaPelicula;
    if (!(d.passoMs > 0 && d.quadros > 0 && d.colunas > 0 && d.largura > 0 && d.altura > 0)) return false;
    // Decodifica fora do processador principal: a timeline não engasga.
    const folha = await createImageBitmap(await r.blob());
    Object.assign(estado, { passoMs: d.passoMs, colunas: d.colunas, largura: d.largura, altura: d.altura, folha });
    for (let i = 0; i < d.quadros; i++) estado.prontos.add(i);
    avisar(estado);
    return true;
  } catch {
    return false;
  }
}

function extrair(urlDaPelicula: string, duracaoMs: number): Estado {
  const existente = porUrl.get(urlDaPelicula);
  if (existente) return existente;
  const estado: Estado = { passoMs: passoDaPelicula(duracaoMs), colunas: PELICULA.colunas, largura: PELICULA.largura, altura: PELICULA.altura, folha: null, prontos: new Set(), versao: 0, ouvintes: new Set() };
  porUrl.set(urlDaPelicula, estado);
  if (typeof document === 'undefined') return estado;
  void daPelicula(estado, urlDaPelicula);
  return estado;
}

/**
 * Os quadros do original para a película dos trechos. O objeto só muda
 * quando chegam quadros novos: a reprodução, que re-renderiza o editor
 * várias vezes por segundo, não redesenha nenhuma tira.
 */
export function useQuadrosDoVideo(urlDaPelicula: string | undefined, duracaoMs: number): QuadrosDoVideo | undefined {
  const [versao, setVersao] = useState(0);
  const [estado, setEstado] = useState<Estado | null>(null);
  useEffect(() => {
    if (!urlDaPelicula || duracaoMs <= 0) return;
    const e = extrair(urlDaPelicula, duracaoMs);
    setEstado(e);
    setVersao(e.versao);
    const ouvir = () => setVersao(e.versao);
    e.ouvintes.add(ouvir);
    return () => {
      e.ouvintes.delete(ouvir);
    };
  }, [urlDaPelicula, duracaoMs]);
  return useMemo(() => {
    if (!estado) return undefined;
    return {
      versao,
      desenhar(ctx, sourceMs, x, y, w, h) {
        const i = Math.max(0, Math.floor(sourceMs / estado.passoMs));
        if (!estado.folha || !estado.prontos.has(i)) return false;
        ctx.drawImage(estado.folha, (i % estado.colunas) * estado.largura, Math.floor(i / estado.colunas) * estado.altura, estado.largura, estado.altura, x, y, w, h);
        return true;
      },
    };
  }, [estado, versao]);
}
