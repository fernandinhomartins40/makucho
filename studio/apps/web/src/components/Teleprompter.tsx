'use client';

// ============================================================
// Teleprompter (contexto mestre, secao 8).
//
// A experiencia principal e o celular: a pessoa segura o aparelho,
// olha para a camera e le. Tudo aqui serve a isso -- fonte grande,
// alvos de toque generosos e nenhum controle que exija precisao.
//
// Alem do texto, mostra a INTENCAO do bloco ("HOOK — crie
// curiosidade"). O objetivo e orientar a interpretacao, nao obrigar
// o criador a decorar.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export interface BlocoTeleprompter {
  role: string;
  goal?: string;
  text: string;
}

interface Props {
  blocos: readonly BlocoTeleprompter[];
  speedWpm?: number;
  fontSizePx?: number;
  mirrored?: boolean;
  countdownSeconds?: number;
  onIniciar?: () => void;
  onParar?: () => void;
}

const ROTULOS: Record<string, string> = {
  hook: 'HOOK',
  problem: 'PROBLEMA',
  context: 'CONTEXTO',
  curiosity_gap: 'CURIOSIDADE',
  authority: 'AUTORIDADE',
  introduction: 'APRESENTAÇÃO',
  proof: 'PROVA',
  insight: 'INSIGHT',
  solution: 'SOLUÇÃO',
  pattern_interrupt: 'QUEBRA DE PADRÃO',
  payoff: 'PAYOFF',
  offer: 'OFERTA',
  cta: 'CTA',
};

export function Teleprompter({
  blocos,
  speedWpm = 140,
  fontSizePx = 32,
  mirrored = false,
  countdownSeconds = 3,
  onIniciar,
  onParar,
}: Props) {
  const [rodando, setRodando] = useState(false);
  const [contagem, setContagem] = useState<number | null>(null);
  const [blocoAtual, setBlocoAtual] = useState(0);

  const areaRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const posicaoRef = useRef(0);

  // Velocidade em pixels por segundo, derivada das palavras por
  // minuto. Uma linha comporta ~8 palavras na largura de um celular;
  // a altura da linha e ~1,5x o tamanho da fonte.
  const pxPorSegundo = (speedWpm / 60 / 8) * (fontSizePx * 1.5);

  const parar = useCallback(() => {
    setRodando(false);
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    onParar?.();
  }, [onParar]);

  const reiniciar = useCallback(() => {
    parar();
    posicaoRef.current = 0;
    setBlocoAtual(0);
    if (areaRef.current) areaRef.current.scrollTop = 0;
  }, [parar]);

  const iniciar = useCallback(() => {
    if (countdownSeconds > 0) {
      setContagem(countdownSeconds);
      return;
    }
    setRodando(true);
    onIniciar?.();
  }, [countdownSeconds, onIniciar]);

  // Contagem regressiva antes de comecar a rolar: da tempo de
  // posicionar o celular e respirar.
  useEffect(() => {
    if (contagem === null) return;

    if (contagem === 0) {
      setContagem(null);
      setRodando(true);
      onIniciar?.();
      return;
    }

    const timer = setTimeout(() => setContagem((n) => (n ?? 1) - 1), 1000);
    return () => clearTimeout(timer);
  }, [contagem, onIniciar]);

  // Rolagem por requestAnimationFrame, e nao por setInterval: o
  // movimento acompanha a taxa de atualizacao da tela, sem os saltos
  // que um intervalo fixo produz quando o dispositivo engasga.
  useEffect(() => {
    if (!rodando) return;

    let anterior = performance.now();

    const passo = (agora: number) => {
      const delta = (agora - anterior) / 1000;
      anterior = agora;

      const area = areaRef.current;
      if (!area) return;

      posicaoRef.current += pxPorSegundo * delta;
      area.scrollTop = posicaoRef.current;

      // Chegou ao fim: para sozinho em vez de rolar no vazio.
      if (posicaoRef.current >= area.scrollHeight - area.clientHeight) {
        setRodando(false);
        onParar?.();
        return;
      }

      frameRef.current = requestAnimationFrame(passo);
    };

    frameRef.current = requestAnimationFrame(passo);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [rodando, pxPorSegundo, onParar]);

  // Destaca o bloco que esta na altura da leitura, um terco abaixo do
  // topo -- onde o olho naturalmente pousa.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    const aoRolar = () => {
      const linhaDeLeitura = area.scrollTop + area.clientHeight / 3;
      const filhos = Array.from(area.querySelectorAll('[data-bloco]'));
      let atual = 0;
      filhos.forEach((el, i) => {
        if ((el as HTMLElement).offsetTop <= linhaDeLeitura) atual = i;
      });
      setBlocoAtual(atual);
    };

    area.addEventListener('scroll', aoRolar, { passive: true });
    return () => area.removeEventListener('scroll', aoRolar);
  }, []);

  return (
    <div style={{ position: 'relative', height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {contagem !== null && (
        <div
          role="status"
          aria-live="assertive"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(10,26,60,0.92)',
            fontSize: 96,
            fontWeight: 700,
            color: 'var(--azul)',
          }}
        >
          {contagem}
        </div>
      )}

      <div
        ref={areaRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '40vh 24px',
          // Espelhamento para quem acompanha o texto pela camera frontal.
          transform: mirrored ? 'scaleX(-1)' : undefined,
          // A rolagem e controlada por codigo: o toque do usuario
          // durante a gravacao so atrapalharia.
          touchAction: rodando ? 'none' : 'auto',
        }}
      >
        {blocos.map((bloco, i) => (
          <div
            key={i}
            data-bloco=""
            style={{
              marginBottom: 48,
              opacity: i === blocoAtual ? 1 : 0.35,
              transition: 'opacity 250ms',
            }}
          >
            <div
              style={{
                fontSize: Math.max(12, fontSizePx * 0.4),
                letterSpacing: 1,
                color: 'var(--azul)',
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              {ROTULOS[bloco.role] ?? bloco.role.toUpperCase()}
              {bloco.goal ? ` — ${bloco.goal}` : ''}
            </div>
            <p style={{ fontSize: fontSizePx, lineHeight: 1.5, margin: 0 }}>{bloco.text}</p>
          </div>
        ))}
      </div>

      {/*
        Alvos de toque de 56px: o dedo mira mal com o celular na mao e a
        atencao na camera.
      */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: 16,
          borderTop: '1px solid var(--borda)',
          background: 'var(--superficie)',
        }}
      >
        <button
          type="button"
          onClick={rodando ? parar : iniciar}
          style={{
            flex: 1,
            height: 56,
            borderRadius: 12,
            border: 'none',
            background: rodando ? '#ef4444' : 'var(--azul)',
            color: '#fff',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {rodando ? 'Pausar' : 'Iniciar'}
        </button>
        <button
          type="button"
          onClick={reiniciar}
          aria-label="Voltar ao início"
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            border: '1px solid var(--borda)',
            background: 'transparent',
            color: 'var(--texto)',
            fontSize: 18,
            cursor: 'pointer',
          }}
        >
          ↺
        </button>
      </div>
    </div>
  );
}
