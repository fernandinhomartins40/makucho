'use client';

// ============================================================
// "Peça à IA" — edição do acabamento em linguagem natural.
//
// A pessoa escreve o que quer e a IA devolve operações da timeline —
// as mesmas dos botões do Inspector. O resultado entra como uma
// versão nova (Ctrl+Z desfaz), e a resposta diz o que mudou e o que
// ficou de fora, em vez de mudar em silêncio.
//
// Os exemplos existem porque um campo em branco não ensina o que dá
// para pedir. Cada um é uma frase que funciona.
// ============================================================

import { useState } from 'react';
import { IconeIA } from '../icones';

const EXEMPLOS = [
  'Legenda estilo Hormozi, maior e no meio',
  'Zoom só nos trechos mais fortes',
  'Põe um título de abertura chamativo',
  'Transição suave entre os cortes',
  'Tira a música e os efeitos sonoros',
];

export interface RespostaDaIa {
  texto: string;
  ignoradas: string[];
  aplicadas: number;
}

export function PedirAIa({ onEnviar }: { onEnviar: (texto: string) => Promise<RespostaDaIa | null> }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resposta, setResposta] = useState<RespostaDaIa | null>(null);

  const enviar = async (pedido: string) => {
    const limpo = pedido.trim();
    if (limpo.length < 3 || enviando) return;
    setEnviando(true);
    setResposta(null);
    try {
      const r = await onEnviar(limpo);
      if (r) {
        setResposta(r);
        if (r.aplicadas > 0) setTexto('');
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pedir-ia">
      <label htmlFor="pedido-ia" className="campo__rotulo linha" style={{ gap: 6 }}>
        <IconeIA size={14} weight="fill" color="var(--accent)" />
        Peça à IA
      </label>
      <form
        className="pedir-ia__linha"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(texto);
        }}
      >
        <input
          id="pedido-ia"
          className="campo__entrada"
          value={texto}
          maxLength={500}
          placeholder="Ex.: legenda amarela e zoom nas partes fortes"
          onChange={(e) => setTexto(e.target.value)}
          disabled={enviando}
        />
        <button type="submit" className="botao botao--pequeno" disabled={enviando || texto.trim().length < 3}>
          {enviando ? 'Fazendo…' : 'Aplicar'}
        </button>
      </form>

      {!resposta && !enviando && (
        <div className="pedir-ia__exemplos">
          {EXEMPLOS.map((e) => (
            <button key={e} type="button" className="pedir-ia__exemplo" onClick={() => void enviar(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      {resposta && (
        <div className="aviso aviso--info" role="status" style={{ fontSize: 12 }}>
          <span>
            {resposta.texto || (resposta.aplicadas ? 'Feito.' : 'Nada foi alterado.')}
            {resposta.aplicadas > 0 && ' Para voltar, use Desfazer (Ctrl+Z).'}
            {resposta.ignoradas.length > 0 && (
              <span className="texto-secundario" style={{ display: 'block', marginTop: 4 }}>
                Ficou de fora: {resposta.ignoradas.join('; ')}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
