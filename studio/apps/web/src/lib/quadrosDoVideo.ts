// ============================================================
// Quadros do vídeo para a tira da timeline (a "película" de cada trecho).
//
// Tirados da PRÉVIA leve, no próprio aparelho: um <video> fora da tela
// pula de ponto em ponto e cada quadro é desenhado numa FOLHA única
// (sprite sheet, como fazem os editores de vídeo na web): nada de JPEG
// por quadro -- toDataURL codificava no processador principal -- nem de
// dezenas de <img> por trecho. A timeline desenha a tira de cada trecho
// num <canvas> só, a partir da folha, e só redesenha quando algo muda.
//
// Guardado por URL enquanto a página vive: trocar de aba ou de tela não
// refaz o trabalho. Os quadros chegam aos poucos (a tira se completa
// enquanto a pessoa já edita).
// ============================================================

import { useEffect, useMemo, useState } from 'react';

/** Um quadro a cada tanto do ORIGINAL; vídeo longo espaça mais. */
const MAX_QUADROS = 120;
const LARGURA = 54;
const ALTURA = 96;
/** A folha: 12 quadros por linha (648 x 960 px no máximo). */
const COLUNAS = 12;

interface Estado {
  passoMs: number;
  folha: HTMLCanvasElement | null;
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

// Enquanto a prévia toca, a extração espera: um terceiro <video> buscando
// quadros disputa decodificador e rede com os dois players da prévia, e
// no celular isso fazia o vídeo travar.
let pausada = false;
export function pausarQuadros(pausar: boolean): void {
  pausada = pausar;
}
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

function extrair(url: string, duracaoMs: number): Estado {
  const existente = porUrl.get(url);
  if (existente) return existente;
  const passoMs = Math.max(1000, Math.ceil(duracaoMs / MAX_QUADROS / 1000) * 1000);
  const estado: Estado = { passoMs, folha: null, prontos: new Set(), versao: 0, ouvintes: new Set() };
  porUrl.set(url, estado);
  if (typeof document === 'undefined') return estado;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  // Só o que cada busca pede: 'auto' baixava a prévia inteira em
  // segundo plano, concorrendo com o vídeo que a pessoa assiste.
  video.preload = 'metadata';
  video.src = url;
  const avisar = () => {
    estado.versao++;
    estado.ouvintes.forEach((f) => f());
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

  const rodar = async () => {
    await new Promise<void>((ok, falha) => {
      video.addEventListener('loadeddata', () => ok(), { once: true });
      video.addEventListener('error', () => falha(new Error('prévia indisponível')), { once: true });
    });
    const total = Number.isFinite(video.duration) ? video.duration * 1000 : duracaoMs;
    const quantos = Math.max(1, Math.ceil(total / passoMs));
    const folha = document.createElement('canvas');
    folha.width = LARGURA * Math.min(COLUNAS, quantos);
    folha.height = ALTURA * Math.ceil(quantos / COLUNAS);
    const ctx = folha.getContext('2d');
    if (!ctx) return;
    estado.folha = folha;
    let desde = 0;
    // Deixa o editor abrir primeiro.
    await esperar(1500);
    for (let i = 0; i < quantos; i++) {
      while (pausada) await esperar(400);
      // Um quadro por vez, com folga: nunca uma rajada no processador.
      await esperar(60);
      await buscar((i * passoMs + passoMs / 2) / 1000);
      // Cobre o quadro 9:16 (vídeo deitado é cortado no centro).
      const vw = video.videoWidth || LARGURA;
      const vh = video.videoHeight || ALTURA;
      const escala = Math.max(LARGURA / vw, ALTURA / vh);
      const w = vw * escala;
      const h = vh * escala;
      const x0 = (i % COLUNAS) * LARGURA;
      const y0 = Math.floor(i / COLUNAS) * ALTURA;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, LARGURA, ALTURA);
      ctx.clip();
      ctx.drawImage(video, x0 + (LARGURA - w) / 2, y0 + (ALTURA - h) / 2, w, h);
      ctx.restore();
      estado.prontos.add(i);
      // Avisos espaçados: cada um redesenha as tiras da timeline.
      if (++desde >= 8) {
        desde = 0;
        avisar();
      }
    }
    avisar();
    video.removeAttribute('src');
    video.load();
  };
  void rodar().catch(() => {
    porUrl.delete(url); // tenta de novo numa próxima montagem
  });
  return estado;
}

/**
 * Os quadros do original para a película dos trechos. O objeto só muda
 * quando chegam quadros novos: a reprodução, que re-renderiza o editor
 * várias vezes por segundo, não redesenha nenhuma tira.
 */
export function useQuadrosDoVideo(url: string | undefined, duracaoMs: number): QuadrosDoVideo | undefined {
  const [versao, setVersao] = useState(0);
  const [estado, setEstado] = useState<Estado | null>(null);
  useEffect(() => {
    if (!url || duracaoMs <= 0) return;
    const e = extrair(url, duracaoMs);
    setEstado(e);
    setVersao(e.versao);
    const ouvir = () => setVersao(e.versao);
    e.ouvintes.add(ouvir);
    return () => {
      e.ouvintes.delete(ouvir);
    };
  }, [url, duracaoMs]);
  return useMemo(() => {
    if (!estado) return undefined;
    return {
      versao,
      desenhar(ctx, sourceMs, x, y, w, h) {
        const i = Math.max(0, Math.floor(sourceMs / estado.passoMs));
        if (!estado.folha || !estado.prontos.has(i)) return false;
        ctx.drawImage(estado.folha, (i % COLUNAS) * LARGURA, Math.floor(i / COLUNAS) * ALTURA, LARGURA, ALTURA, x, y, w, h);
        return true;
      },
    };
  }, [estado, versao]);
}
