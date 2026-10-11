'use client';

// ============================================================
// Falar em vez de digitar.
//
// A pessoa toca no microfone, fala o pedido e toca de novo: o áudio vai
// para o servidor do próprio Studio, onde o faster-whisper (código
// aberto, o mesmo que transcreve os vídeos) devolve o texto. Não há
// serviço de fora ouvindo, nem chamada de IA paga.
//
// O texto entra no campo para a pessoa conferir e corrigir: nada é
// enviado à IA sozinho.
//
// Por que não o reconhecimento de fala do navegador: ele não funciona
// no app instalado do iPhone, e no Chrome manda a voz para o Google.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { DITADO_MAXIMO_MS } from '@makucho/studio-contracts';
import { ia } from '../../lib/api';
import { IconeMicrofone } from '../icones';

type Estado = 'parado' | 'gravando' | 'transcrevendo';

/** O formato que este navegador grava (o iPhone só faz mp4; o Chrome, webm). */
function formatoDeGravacao(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t));
}

interface Props {
  /** O texto transcrito, para o campo receber. */
  aoTranscrever: (texto: string) => void;
  aoFalhar: (mensagem: string) => void;
  desabilitado?: boolean;
}

export function BotaoDeDitado({ aoTranscrever, aoFalhar, desabilitado }: Props) {
  const [estado, setEstado] = useState<Estado>('parado');
  const [segundos, setSegundos] = useState(0);
  const [disponivel, setDisponivel] = useState(true);
  const gravador = useRef<MediaRecorder | null>(null);
  const microfone = useRef<MediaStream | null>(null);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelado = useRef(false);

  // Decidido depois de montar: no servidor não há microfone para perguntar.
  useEffect(() => {
    setDisponivel(typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined');
  }, []);

  const soltarMicrofone = () => {
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = null;
    microfone.current?.getTracks().forEach((t) => t.stop());
    microfone.current = null;
    gravador.current = null;
  };

  // Sair da tela no meio da gravação: o microfone não fica aberto.
  useEffect(
    () => () => {
      cancelado.current = true;
      if (gravador.current?.state === 'recording') gravador.current.stop();
      soltarMicrofone();
    },
    [],
  );

  const comecar = async () => {
    let fluxo: MediaStream;
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      aoFalhar('Não foi possível usar o microfone. Permita o microfone para o Studio nas configurações do aparelho.');
      return;
    }
    const tipo = formatoDeGravacao();
    const pedacos: Blob[] = [];
    const novo = new MediaRecorder(fluxo, tipo ? { mimeType: tipo } : undefined);
    microfone.current = fluxo;
    gravador.current = novo;
    cancelado.current = false;

    novo.ondataavailable = (e) => {
      if (e.data.size > 0) pedacos.push(e.data);
    };
    novo.onstop = () => {
      const mime = novo.mimeType || tipo || 'audio/webm';
      soltarMicrofone();
      if (cancelado.current) return;
      const audio = new Blob(pedacos, { type: mime });
      if (audio.size < 1024) {
        setEstado('parado');
        aoFalhar('Não ouvi nada. Toque no microfone e fale de novo.');
        return;
      }
      setEstado('transcrevendo');
      void ia
        .ditar(audio)
        .then((texto) => {
          if (cancelado.current) return;
          if (texto.trim()) aoTranscrever(texto.trim());
          else aoFalhar('Não entendi a fala. Tente de novo, mais perto do microfone.');
        })
        .catch((e) => {
          if (!cancelado.current) aoFalhar(e instanceof Error ? e.message : 'não foi possível transcrever o áudio.');
        })
        .finally(() => {
          if (!cancelado.current) setEstado('parado');
        });
    };

    novo.start();
    setSegundos(0);
    setEstado('gravando');
    const inicio = Date.now();
    relogio.current = setInterval(() => {
      const passou = Date.now() - inicio;
      setSegundos(Math.floor(passou / 1000));
      // O teto do servidor: para sozinho, e o que foi dito é transcrito.
      if (passou >= DITADO_MAXIMO_MS && novo.state === 'recording') novo.stop();
    }, 250);
  };

  const parar = () => {
    if (gravador.current?.state === 'recording') gravador.current.stop();
  };

  if (!disponivel) return null;

  const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;

  return (
    <button
      type="button"
      className="ditado"
      data-estado={estado}
      disabled={desabilitado || estado === 'transcrevendo'}
      aria-pressed={estado === 'gravando'}
      aria-label={estado === 'gravando' ? 'Parar de gravar e transcrever' : 'Falar o pedido em vez de digitar'}
      onClick={() => (estado === 'gravando' ? parar() : void comecar())}
    >
      <span className="ditado__icone" aria-hidden>
        <IconeMicrofone size={20} weight={estado === 'gravando' ? 'fill' : 'regular'} />
      </span>
      <span role="status">{estado === 'gravando' ? `${mmss} · toque para terminar` : estado === 'transcrevendo' ? 'Passando para texto…' : 'Falar'}</span>
    </button>
  );
}
