// ============================================================
// Fluxo vertical (9:16) a partir da câmera.
//
// A webcam do computador entrega imagem deitada (16:9). O vídeo é
// vertical: antes, a tela mostrava a imagem deitada inteira com um
// retângulo tracejado, e a gravação guardava a imagem deitada -- o que
// aparecia depois no vídeo não era o que a pessoa viu ao gravar.
//
// Agora o miolo vertical da câmera é desenhado num canvas e é ESSE
// canvas que vira o vídeo gravado (com o áudio original): o que aparece
// na tela é exatamente o que fica gravado. Sem ampliar: o canvas tem o
// tamanho real do recorte (1080 de altura numa câmera 1080p), para não
// gastar bytes com pixels inventados.
//
// Câmera que já é vertical (celular em pé) passa direto, sem canvas.
// ============================================================

import { useEffect, useState } from 'react';

export type FormatoDaGravacao = 'vertical' | 'horizontal';

/** O fluxo a gravar: o recorte vertical (com o áudio), ou o original. */
export function useFluxoVertical(fluxo: MediaStream | null, formato: FormatoDaGravacao): MediaStream | null {
  const [saida, setSaida] = useState<MediaStream | null>(fluxo);

  useEffect(() => {
    const faixa = fluxo?.getVideoTracks()[0];
    const { width = 0, height = 0 } = faixa?.getSettings() ?? {};
    // Horizontal pedido, ou câmera já em pé: grava o que a câmera dá.
    if (!fluxo || !faixa || formato === 'horizontal' || !width || !height || height >= width) {
      setSaida(fluxo);
      return;
    }

    const altura = Math.round(height / 2) * 2;
    const largura = Math.round((altura * 9) / 16 / 2) * 2;
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const video = document.createElement('video');
    const porQuadro = 'requestVideoFrameCallback' in video;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([faixa]);
    void video.play().catch(() => undefined);

    let vivo = true;
    let id = 0;
    const desenhar = () => {
      if (!vivo) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        // O miolo central, na proporção 9:16.
        const recorteW = Math.min(vw, (vh * 9) / 16);
        ctx.drawImage(video, (vw - recorteW) / 2, 0, recorteW, vh, 0, 0, largura, altura);
      }
      // Um quadro por quadro da câmera (e, sem essa API, pelo relógio da tela).
      if (porQuadro) id = video.requestVideoFrameCallback(desenhar);
      else id = requestAnimationFrame(desenhar);
    };
    desenhar();

    const recortado = canvas.captureStream(30);
    const composto = new MediaStream([...recortado.getVideoTracks(), ...fluxo.getAudioTracks()]);
    setSaida(composto);

    return () => {
      vivo = false;
      if (porQuadro) video.cancelVideoFrameCallback(id);
      else cancelAnimationFrame(id);
      recortado.getVideoTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [fluxo, formato]);

  return saida;
}
