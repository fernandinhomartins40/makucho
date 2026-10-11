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
// Os dois momentos de espera se mexem, para ninguém achar que travou:
// gravando, as barras sobem e descem com o volume da voz (é a prova de
// que o microfone está ouvindo); passando para texto, uma faixa corre,
// o relógio conta e a frase muda conforme o tempo passa.
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
  // O medidor de volume: as barras são mexidas direto no DOM, a cada
  // quadro, sem passar pelo React (sessenta renders por segundo à toa).
  const barras = useRef<HTMLSpanElement>(null);
  const medidor = useRef<{ contexto: AudioContext; quadro: number } | null>(null);
  const [semMedidor, setSemMedidor] = useState(false);

  // Decidido depois de montar: no servidor não há microfone para perguntar.
  useEffect(() => {
    setDisponivel(typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined');
  }, []);

  /** Liga as barras ao volume do microfone. Sem isto dar certo, elas pulsam sozinhas. */
  const ligarMedidor = (fluxo: MediaStream) => {
    try {
      const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Contexto) throw new Error('sem AudioContext');
      const contexto = new Contexto();
      void contexto.resume().catch(() => undefined);
      const analisador = contexto.createAnalyser();
      analisador.fftSize = 256;
      analisador.smoothingTimeConstant = 0.7;
      contexto.createMediaStreamSource(fluxo).connect(analisador);
      const dados = new Uint8Array(analisador.frequencyBinCount);
      const spans = () => [...(barras.current?.children ?? [])] as HTMLElement[];
      const desenhar = () => {
        analisador.getByteFrequencyData(dados);
        const lista = spans();
        // A voz fica nas frequências baixas: cada barra olha uma fatia delas.
        const fatia = Math.max(1, Math.floor(48 / Math.max(1, lista.length)));
        lista.forEach((barra, i) => {
          let soma = 0;
          for (let k = 0; k < fatia; k += 1) soma += dados[2 + i * fatia + k] ?? 0;
          const nivel = Math.min(1, soma / fatia / 170);
          barra.style.transform = `scaleY(${(0.18 + nivel * 0.82).toFixed(3)})`;
        });
        if (medidor.current) medidor.current.quadro = requestAnimationFrame(desenhar);
      };
      medidor.current = { contexto, quadro: requestAnimationFrame(desenhar) };
      setSemMedidor(false);
    } catch {
      setSemMedidor(true);
    }
  };

  const soltarMicrofone = () => {
    if (medidor.current) {
      cancelAnimationFrame(medidor.current.quadro);
      void medidor.current.contexto.close().catch(() => undefined);
      medidor.current = null;
    }
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
      // O relógio continua, agora contando a espera pelo texto.
      setSegundos(0);
      const inicioDaEspera = Date.now();
      relogio.current = setInterval(() => setSegundos(Math.floor((Date.now() - inicioDaEspera) / 1000)), 500);
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
          if (relogio.current) clearInterval(relogio.current);
          relogio.current = null;
          if (!cancelado.current) setEstado('parado');
        });
    };

    novo.start();
    setSegundos(0);
    setEstado('gravando');
    ligarMedidor(fluxo);
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
  // A frase da espera muda com o tempo: parada, ela parece travada.
  const espera = segundos < 6 ? 'Ouvindo a sua fala…' : segundos < 20 ? 'Escrevendo o texto…' : segundos < 60 ? 'Quase lá, só mais um pouco…' : 'Ainda trabalhando. Pode demorar se houver um vídeo na fila.';

  return (
    <div className="ditado-caixa" data-estado={estado}>
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
          {estado === 'transcrevendo' ? <span className="ditado__girando" /> : <IconeMicrofone size={20} weight={estado === 'gravando' ? 'fill' : 'regular'} />}
        </span>
        {estado === 'gravando' && (
          <span className="ditado__barras" ref={barras} data-sem-medidor={semMedidor || undefined} aria-hidden>
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} />
            ))}
          </span>
        )}
        <span>{estado === 'gravando' ? `${mmss} · toque para terminar` : estado === 'transcrevendo' ? `Passando para texto · ${mmss}` : 'Falar'}</span>
      </button>

      {/* A espera pelo texto: uma faixa que corre e uma frase que muda. */}
      {estado === 'transcrevendo' && (
        <div className="ditado__espera" role="status" aria-live="polite">
          <span className="ditado__faixa" aria-hidden />
          <span>{espera}</span>
        </div>
      )}
      {estado === 'gravando' && (
        <span className="visualmente-oculto" role="status">
          Gravando. Toque de novo para terminar.
        </span>
      )}
    </div>
  );
}
