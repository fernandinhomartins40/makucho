// ============================================================
// Amostras do vídeo original para as miniaturas de filtro e para o
// "igualar cor".
//
// Um <video> escondido, com o mesmo proxy da prévia (o navegador já tem
// os bytes em cache), vai a cada ponto pedido e devolve o quadro pequeno,
// recortado em 9:16 como o "preencher". Um pedido por vez: buscar em
// paralelo no mesmo elemento embaralharia os quadros.
// ============================================================

let video: HTMLVideoElement | null = null;
let fila: Promise<unknown> = Promise.resolve();

/** O proxy que a prévia está tocando (o mesmo arquivo, sem nova URL). */
export function proxyDaPrevia(): string | null {
  const v = document.querySelector<HTMLVideoElement>('.palco__video');
  return v?.currentSrc || v?.src || null;
}

function esperar(v: HTMLVideoElement, evento: 'seeked' | 'loadeddata'): Promise<void> {
  return new Promise((ok, erro) => {
    const limpar = () => {
      v.removeEventListener(evento, feito);
      v.removeEventListener('error', falhou);
      clearTimeout(tempo);
    };
    const feito = () => {
      limpar();
      ok();
    };
    const falhou = () => {
      limpar();
      erro(new Error('vídeo não carregou'));
    };
    const tempo = setTimeout(falhou, 8000);
    v.addEventListener(evento, feito);
    v.addEventListener('error', falhou);
  });
}

/** O quadro do original em `sourceMs`, em `w` x `h`, cobrindo o quadro. */
export function quadroDoOriginal(src: string, sourceMs: number, w: number, h: number): Promise<ImageData> {
  const pedido = fila.then(async () => {
    if (!video || video.src !== src) {
      video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';
      const carregou = esperar(video, 'loadeddata');
      video.src = src;
      await carregou;
    }
    const v = video;
    const buscou = esperar(v, 'seeked');
    v.currentTime = sourceMs / 1000;
    await buscou;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    const escala = Math.max(w / v.videoWidth, h / v.videoHeight);
    const vw = v.videoWidth * escala;
    const vh = v.videoHeight * escala;
    ctx.drawImage(v, (w - vw) / 2, (h - vh) / 2, vw, vh);
    return ctx.getImageData(0, 0, w, h);
  });
  fila = pedido.catch(() => undefined);
  return pedido;
}

/** Cor média (0-1) de uma amostra. */
export function corMedia(img: ImageData): [number, number, number] {
  const d = img.data;
  const s = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    s[0]! += d[i]!;
    s[1]! += d[i + 1]!;
    s[2]! += d[i + 2]!;
  }
  const n = (d.length / 4) * 255;
  return [s[0]! / n, s[1]! / n, s[2]! / n];
}
