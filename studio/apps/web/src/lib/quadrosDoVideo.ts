// ============================================================
// Quadros do vídeo para a tira da timeline (a "película" de cada trecho).
//
// Primeiro caminho: a PELÍCULA DO SERVIDOR -- uma folha de quadros (sprite
// sheet) que o worker de mídia gera uma vez no preparo, com FFmpeg. O
// editor baixa uma imagem, decodifica fora do processador principal
// (createImageBitmap) e pronto: nenhum <video> a mais na página.
//
// Antes, os quadros saíam SÓ daqui: um <video> escondido pulava pela
// prévia de segundo em segundo. Mesmo "pausado" ele seguia com o vídeo
// carregado -- segurando um decodificador e disputando a rede com os
// players da prévia --, e no celular a reprodução travava.
//
// Reserva (projeto preparado antes da película existir): o <video>
// escondido continua, mas SOLTA o vídeo enquanto a prévia toca (sem src,
// sem decodificador) e só volta depois de um tempo parado.
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

// ---------- A prévia tocando ----------
//
// Enquanto a prévia toca, a extração de reserva para E solta o vídeo; ao
// parar, espera um pouco antes de voltar (pausas curtas -- trocar de
// trecho, arrastar a agulha -- não acordam o vídeo escondido).
let pausada = false;
let pausadaDesde = 0;
const VOLTA_DEPOIS_DE_PARADA_MS = 2500;
export function pausarQuadros(pausar: boolean): void {
  if (pausar === pausada) return;
  pausada = pausar;
  pausadaDesde = Date.now();
}
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const livre = () => !pausada && Date.now() - pausadaDesde >= VOLTA_DEPOIS_DE_PARADA_MS;

function avisar(estado: Estado) {
  estado.versao++;
  estado.ouvintes.forEach((f) => f());
}

/** A película pronta do servidor. false = não existe (cai na reserva). */
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

/** Reserva: tira os quadros da prévia com um <video> escondido, sem atrapalhar quem assiste. */
async function daPrevia(estado: Estado, url: string, duracaoMs: number): Promise<void> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  // Só o que cada busca pede: 'auto' baixava a prévia inteira em
  // segundo plano, concorrendo com o vídeo que a pessoa assiste.
  video.preload = 'metadata';
  let carregado = false;

  const carregar = () =>
    new Promise<void>((ok, falha) => {
      video.addEventListener('loadeddata', () => ok(), { once: true });
      video.addEventListener('error', () => falha(new Error('prévia indisponível')), { once: true });
      video.src = url;
      carregado = true;
    });
  // Solta o vídeo: sem src, o navegador libera o decodificador e a rede.
  const soltar = () => {
    if (!carregado) return;
    video.removeAttribute('src');
    video.load();
    carregado = false;
  };
  const buscar = (s: number) =>
    new Promise<void>((ok) => {
      const pronto = () => {
        video.removeEventListener('seeked', pronto);
        ok();
      };
      video.addEventListener('seeked', pronto);
      video.currentTime = s;
      // Um seek que não volta (rede caiu) não trava a tira inteira.
      setTimeout(pronto, 4000);
    });

  const quantos = Math.max(1, Math.ceil(duracaoMs / estado.passoMs));
  const folha = document.createElement('canvas');
  folha.width = estado.largura * Math.min(estado.colunas, quantos);
  folha.height = estado.altura * Math.ceil(quantos / estado.colunas);
  const ctx = folha.getContext('2d');
  if (!ctx) return;
  estado.folha = folha;
  let desde = 0;
  // Deixa o editor abrir primeiro.
  await esperar(1500);
  try {
    for (let i = 0; i < quantos; i++) {
      if (!livre()) {
        soltar();
        while (!livre()) await esperar(400);
      }
      if (!carregado) await carregar();
      // Um quadro por vez, com folga: nunca uma rajada no processador.
      await esperar(60);
      await buscar((i * estado.passoMs + estado.passoMs / 2) / 1000);
      // A prévia começou a tocar durante a busca: este quadro fica para depois.
      if (!livre()) {
        i -= 1;
        continue;
      }
      // Cobre o quadro 9:16 (vídeo deitado é cortado no centro).
      const vw = video.videoWidth || estado.largura;
      const vh = video.videoHeight || estado.altura;
      const escala = Math.max(estado.largura / vw, estado.altura / vh);
      const w = vw * escala;
      const h = vh * escala;
      const x0 = (i % estado.colunas) * estado.largura;
      const y0 = Math.floor(i / estado.colunas) * estado.altura;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, estado.largura, estado.altura);
      ctx.clip();
      ctx.drawImage(video, x0 + (estado.largura - w) / 2, y0 + (estado.altura - h) / 2, w, h);
      ctx.restore();
      estado.prontos.add(i);
      // Avisos espaçados: cada um redesenha as tiras da timeline.
      if (++desde >= 8) {
        desde = 0;
        avisar(estado);
      }
    }
    avisar(estado);
  } finally {
    soltar();
  }
}

function extrair(url: string, duracaoMs: number, urlDaPelicula?: string): Estado {
  const existente = porUrl.get(url);
  if (existente) return existente;
  const estado: Estado = { passoMs: passoDaPelicula(duracaoMs), colunas: PELICULA.colunas, largura: PELICULA.largura, altura: PELICULA.altura, folha: null, prontos: new Set(), versao: 0, ouvintes: new Set() };
  porUrl.set(url, estado);
  if (typeof document === 'undefined') return estado;
  void (async () => {
    if (urlDaPelicula && (await daPelicula(estado, urlDaPelicula))) return;
    await daPrevia(estado, url, duracaoMs);
  })().catch(() => {
    porUrl.delete(url); // tenta de novo numa próxima montagem
  });
  return estado;
}

/**
 * Os quadros do original para a película dos trechos. O objeto só muda
 * quando chegam quadros novos: a reprodução, que re-renderiza o editor
 * várias vezes por segundo, não redesenha nenhuma tira.
 */
export function useQuadrosDoVideo(url: string | undefined, duracaoMs: number, urlDaPelicula?: string): QuadrosDoVideo | undefined {
  const [versao, setVersao] = useState(0);
  const [estado, setEstado] = useState<Estado | null>(null);
  useEffect(() => {
    if (!url || duracaoMs <= 0) return;
    const e = extrair(url, duracaoMs, urlDaPelicula);
    setEstado(e);
    setVersao(e.versao);
    const ouvir = () => setVersao(e.versao);
    e.ouvintes.add(ouvir);
    return () => {
      e.ouvintes.delete(ouvir);
    };
  }, [url, duracaoMs, urlDaPelicula]);
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
