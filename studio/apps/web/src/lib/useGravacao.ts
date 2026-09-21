'use client';

// ============================================================
// Gravação pela webcam (ADR 0010, caminho A).
//
// O que separa isto de um `new MediaRecorder(stream)` de tutorial:
//
//   - o codec é negociado, não assumido. Safari só aceita MP4, e
//     assumir WebM deixaria metade dos clientes sem gravar;
//   - os pedaços saem a cada 5 s e ficam num array de Blob, não numa
//     string em memória. Dez minutos em 1080p passam de 1 GB;
//   - a revisão vem antes do envio. A primeira tomada quase nunca é
//     a boa, e regravar precisa ser mais fácil que enviar.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

/** Em ordem de preferência. O primeiro que o navegador aceitar vence. */
const CODECS = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

export type EstadoDaGravacao = 'parado' | 'contando' | 'gravando' | 'pausado' | 'revisando';

interface Retorno {
  estado: EstadoDaGravacao;
  segundos: number;
  contagem: number;
  erro: string | null;
  /** Blob pronto para envio, só depois de parar. */
  resultado: Blob | null;
  urlDaPrevia: string | null;
  mimeType: string;
  iniciar: (comContagem: boolean) => void;
  pausar: () => void;
  retomar: () => void;
  parar: () => void;
  descartar: () => void;
}

export function useGravacao(fluxo: MediaStream | null): Retorno {
  const [estado, setEstado] = useState<EstadoDaGravacao>('parado');
  const [segundos, setSegundos] = useState(0);
  const [contagem, setContagem] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Blob | null>(null);
  const [urlDaPrevia, setUrlDaPrevia] = useState<string | null>(null);

  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('video/webm');

  // ---------- Cronômetro ----------
  useEffect(() => {
    if (estado !== 'gravando') return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [estado]);

  // ---------- Contagem regressiva ----------
  useEffect(() => {
    if (estado !== 'contando') return;

    if (contagem <= 0) {
      comecarDeFato();
      return;
    }

    const id = setTimeout(() => setContagem((c) => c - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, contagem]);

  // A URL da prévia é um recurso do navegador: sem revogar, cada
  // tomada descartada deixa o blob inteiro preso na memória da aba.
  useEffect(() => {
    return () => {
      if (urlDaPrevia) URL.revokeObjectURL(urlDaPrevia);
    };
  }, [urlDaPrevia]);

  const comecarDeFato = useCallback(() => {
    if (!fluxo) {
      setErro('a câmera não está disponível.');
      setEstado('parado');
      return;
    }

    const mime = CODECS.find((c) => MediaRecorder.isTypeSupported(c));
    if (!mime) {
      setErro('este navegador não consegue gravar vídeo. Tente o Chrome ou o Edge.');
      setEstado('parado');
      return;
    }

    mimeRef.current = mime;
    pedacosRef.current = [];

    try {
      const gravador = new MediaRecorder(fluxo, {
        mimeType: mime,
        // 2,5 Mbps: qualidade suficiente para 1080p vertical sem
        // gerar arquivo que não caiba na cota.
        videoBitsPerSecond: 2_500_000,
        audioBitsPerSecond: 128_000,
      });

      gravador.ondataavailable = (e) => {
        if (e.data.size > 0) pedacosRef.current.push(e.data);
      };

      gravador.onerror = () => {
        setErro('a gravação falhou. O que já foi gravado até aqui foi mantido.');
        setEstado('parado');
      };

      gravador.onstop = () => {
        const blob = new Blob(pedacosRef.current, { type: mime });
        setResultado(blob);
        setUrlDaPrevia(URL.createObjectURL(blob));
        setEstado('revisando');
      };

      // Pedaços de 5 s: se algo travar, o que já saiu do encoder está
      // no array e não se perde.
      gravador.start(5000);
      gravadorRef.current = gravador;
      setSegundos(0);
      setErro(null);
      setEstado('gravando');
    } catch {
      setErro('não foi possível iniciar a gravação.');
      setEstado('parado');
    }
  }, [fluxo]);

  const iniciar = useCallback(
    (comContagem: boolean) => {
      setResultado(null);
      setUrlDaPrevia(null);

      if (comContagem) {
        setContagem(3);
        setEstado('contando');
        return;
      }
      comecarDeFato();
    },
    [comecarDeFato],
  );

  const pausar = useCallback(() => {
    gravadorRef.current?.pause();
    setEstado('pausado');
  }, []);

  const retomar = useCallback(() => {
    gravadorRef.current?.resume();
    setEstado('gravando');
  }, []);

  const parar = useCallback(() => {
    const gravador = gravadorRef.current;
    if (gravador && gravador.state !== 'inactive') {
      gravador.stop();
    }
  }, []);

  const descartar = useCallback(() => {
    if (urlDaPrevia) URL.revokeObjectURL(urlDaPrevia);
    setResultado(null);
    setUrlDaPrevia(null);
    setSegundos(0);
    setEstado('parado');
  }, [urlDaPrevia]);

  return {
    estado,
    segundos,
    contagem,
    erro,
    resultado,
    urlDaPrevia,
    mimeType: mimeRef.current,
    iniciar,
    pausar,
    retomar,
    parar,
    descartar,
  };
}
