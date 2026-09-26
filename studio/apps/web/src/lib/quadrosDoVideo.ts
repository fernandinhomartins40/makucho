// ============================================================
// Quadros do vídeo para a tira da timeline (a "película" de cada trecho).
//
// Tirados da PRÉVIA leve, no próprio aparelho: um <video> fora da tela
// pula de ponto em ponto e cada quadro vira um JPEG pequeno. Sem
// servidor, sem custo -- e a tira mostra o que a pessoa gravou, que é
// como se reconhece um trecho de relance (o nome "Gancho" não diz qual).
//
// Guardado por URL enquanto a página vive: trocar de aba ou de tela não
// refaz o trabalho. Os quadros chegam aos poucos (a tira se completa
// enquanto a pessoa já edita).
// ============================================================

import { useEffect, useState } from 'react';

/** Um quadro a cada tanto do ORIGINAL; vídeo longo espaça mais. */
const MAX_QUADROS = 120;
const LARGURA = 54;
const ALTURA = 96;

interface Estado {
  passoMs: number;
  quadros: Map<number, string>;
  ouvintes: Set<() => void>;
  pronto: boolean;
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
  const estado: Estado = { passoMs, quadros: new Map(), ouvintes: new Set(), pronto: false };
  porUrl.set(url, estado);
  if (typeof document === 'undefined') return estado;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  // Só o que cada busca pede: 'auto' baixava a prévia inteira em
  // segundo plano, concorrendo com o vídeo que a pessoa assiste.
  video.preload = 'metadata';
  video.src = url;
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const ctx = canvas.getContext('2d');
  const avisar = () => estado.ouvintes.forEach((f) => f());

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
    let desde = 0;
    // Deixa o editor abrir primeiro.
    await esperar(1500);
    for (let ms = 0; ms < total; ms += passoMs) {
      while (pausada) await esperar(400);
      // Um quadro por vez, com folga: nunca uma rajada no processador.
      await esperar(60);
      await buscar((ms + passoMs / 2) / 1000);
      if (!ctx) break;
      // Cobre o quadro 9:16 (vídeo deitado é cortado no centro).
      const vw = video.videoWidth || LARGURA;
      const vh = video.videoHeight || ALTURA;
      const escala = Math.max(LARGURA / vw, ALTURA / vh);
      const w = vw * escala;
      const h = vh * escala;
      ctx.drawImage(video, (LARGURA - w) / 2, (ALTURA - h) / 2, w, h);
      estado.quadros.set(ms, canvas.toDataURL('image/jpeg', 0.62));
      if (++desde >= 6) {
        desde = 0;
        avisar();
      }
    }
    estado.pronto = true;
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
 * O quadro mais próximo de um ponto do ORIGINAL (ms), ou null enquanto
 * ainda não saiu. Re-renderiza quando chegam novos quadros.
 */
export function useQuadrosDoVideo(url: string | undefined, duracaoMs: number): ((sourceMs: number) => string | null) | undefined {
  const [, setVersao] = useState(0);
  const [estado, setEstado] = useState<Estado | null>(null);
  useEffect(() => {
    if (!url || duracaoMs <= 0) return;
    const e = extrair(url, duracaoMs);
    setEstado(e);
    const ouvir = () => setVersao((v) => v + 1);
    e.ouvintes.add(ouvir);
    return () => {
      e.ouvintes.delete(ouvir);
    };
  }, [url, duracaoMs]);
  if (!estado) return undefined;
  return (sourceMs: number) => {
    const chave = Math.max(0, Math.floor(sourceMs / estado.passoMs) * estado.passoMs);
    return estado.quadros.get(chave) ?? null;
  };
}
