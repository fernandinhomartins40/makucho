'use client';

// ============================================================
// Record Studio — teleprompter (plano, fase 3).
//
// Por ora com um roteiro de demonstracao: a leitura vinda da API
// entra junto com a tela de roteiros. O que esta aqui ja valida o
// que importa na fase -- rolagem, ritmo e leitura em tela de
// celular.
// ============================================================

import { useState } from 'react';
import { Teleprompter } from '../../components/Teleprompter';
import type { BlocoTeleprompter } from '../../components/Teleprompter';

// Exemplo da secao 7 do contexto mestre.
const ROTEIRO_DEMO: BlocoTeleprompter[] = [
  {
    role: 'hook',
    goal: 'crie curiosidade',
    text: 'Se sua empresa demora para responder no WhatsApp, você pode estar pagando para perder cliente.',
  },
  {
    role: 'problem',
    goal: 'mostre a consequência',
    text: 'Muitas empresas investem em anúncio, conseguem gerar interesse e perdem a venda justamente no atendimento.',
  },
  {
    role: 'authority',
    goal: 'demonstre experiência',
    text: 'Eu vejo isso constantemente quando analiso processos comerciais de pequenas empresas.',
  },
  {
    role: 'solution',
    goal: 'entregue o valor',
    text: 'Existem três pontos que eu corrigiria primeiro: tempo de resposta, mensagem inicial e acompanhamento.',
  },
  {
    role: 'cta',
    goal: 'chame para a ação',
    text: 'Salva este vídeo e verifica esses três pontos no seu atendimento hoje.',
  },
];

export default function TeleprompterPage() {
  const [velocidade, setVelocidade] = useState(140);
  const [fonte, setFonte] = useState(32);
  const [espelhado, setEspelhado] = useState(false);
  const [ajustesAbertos, setAjustesAbertos] = useState(false);

  return (
    <main>
      {/*
        Ajustes em painel recolhido: durante a leitura a tela pertence
        ao texto. Quem mexe na velocidade faz isso antes de gravar.
      */}
      <button
        type="button"
        onClick={() => setAjustesAbertos((v) => !v)}
        aria-expanded={ajustesAbertos}
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 20,
          width: 44,
          height: 44,
          borderRadius: 10,
          border: '1px solid var(--borda)',
          background: 'var(--superficie)',
          color: 'var(--texto)',
          fontSize: 18,
          cursor: 'pointer',
        }}
      >
        ⚙
      </button>

      {ajustesAbertos && (
        <div
          style={{
            position: 'fixed',
            top: 64,
            right: 12,
            zIndex: 20,
            width: 240,
            padding: 16,
            borderRadius: 12,
            border: '1px solid var(--borda)',
            background: 'var(--superficie)',
            display: 'grid',
            gap: 16,
          }}
        >
          <label style={{ fontSize: 13, display: 'grid', gap: 6 }}>
            Velocidade: {velocidade} ppm
            <input
              type="range"
              min={80}
              max={240}
              step={10}
              value={velocidade}
              onChange={(e) => setVelocidade(Number(e.target.value))}
            />
          </label>

          <label style={{ fontSize: 13, display: 'grid', gap: 6 }}>
            Fonte: {fonte}px
            <input
              type="range"
              min={16}
              max={72}
              step={2}
              value={fonte}
              onChange={(e) => setFonte(Number(e.target.value))}
            />
          </label>

          <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={espelhado}
              onChange={(e) => setEspelhado(e.target.checked)}
            />
            Espelhar texto
          </label>
        </div>
      )}

      <Teleprompter
        blocos={ROTEIRO_DEMO}
        speedWpm={velocidade}
        fontSizePx={fonte}
        mirrored={espelhado}
      />
    </main>
  );
}
