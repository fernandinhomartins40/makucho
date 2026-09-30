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

import { useEffect, useRef, useState } from 'react';
import { IconeFechar, IconeIA } from '../icones';
import type { FocoDaIa } from '../../lib/focoDaIa';

// Três, e não mais: uma nuvem de sugestões compete com o campo e faz
// o painel parecer um cardápio.
const EXEMPLOS = ['Deixa os textos mais bonitos', 'Mais dinâmico, estilo TikTok', 'Cor de cinema no vídeo todo'];

export interface RespostaDaIa {
  texto: string;
  ignoradas: string[];
  aplicadas: number;
}

type Envio = (texto: string, anterior?: { pedido: string; resposta: string }) => Promise<RespostaDaIa | null>;

export function PedirAIa({
  onEnviar,
  extras = [],
  passos = [],
  titulo = 'Peça à IA',
  ajuda = 'Escreva do seu jeito o que quer mudar no vídeo. Ela ajusta a edição para você.',
  exemplos = EXEMPLOS,
  foco = null,
  onTirarFoco,
}: {
  onEnviar: Envio;
  titulo?: string;
  ajuda?: string;
  exemplos?: readonly string[];
  extras?: Array<{ rotulo: string; onClick: () => void }>;
  /** O que a IA está fazendo agora (o agente com ferramentas). */
  passos?: string[];
  /** O item da timeline que é o assunto do pedido (chip acima do campo). */
  foco?: FocoDaIa | null;
  onTirarFoco?: () => void;
}) {
  const campoRef = useRef<HTMLInputElement>(null);
  // Chegou um item como assunto: o campo já fica pronto para escrever.
  const chaveDoFoco = foco ? `${foco.tipo}:${foco.id}` : '';
  useEffect(() => {
    if (chaveDoFoco) campoRef.current?.focus();
  }, [chaveDoFoco]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resposta, setResposta] = useState<RespostaDaIa | null>(null);
  // A última troca vai junto do próximo pedido: é o que deixa responder
  // "sim", "todos" ou "o primeiro" a uma pergunta da IA.
  const [anterior, setAnterior] = useState<{ pedido: string; resposta: string } | null>(null);

  const enviar = async (pedido: string) => {
    const limpo = pedido.trim();
    if (limpo.length < 2 || enviando) return;
    setEnviando(true);
    setResposta(null);
    try {
      const r = await onEnviar(limpo, anterior ?? undefined);
      if (r) {
        setResposta(r);
        setAnterior({ pedido: limpo.slice(0, 500), resposta: r.texto.slice(0, 600) });
        setTexto('');
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pedir-ia">
      <div>
        <label htmlFor="pedido-ia" className="ia-secao__titulo linha" style={{ gap: 6 }}>
          <IconeIA size={16} weight="fill" color="var(--accent)" />
          {titulo}
        </label>
        <p className="ia-secao__ajuda">{ajuda}</p>
      </div>
      {foco && (
        <div className="pedir-ia__foco" role="status">
          <span className="pedir-ia__foco-rotulo">Sobre</span>
          <span className="pedir-ia__foco-nome" title={foco.descricao}>
            {foco.rotulo}
          </span>
          {onTirarFoco && (
            <button type="button" className="pedir-ia__foco-tirar" aria-label="Tirar o item do pedido" title="Tirar o item do pedido" onClick={onTirarFoco}>
              <IconeFechar size={13} />
            </button>
          )}
        </div>
      )}
      <form
        className="pedir-ia__linha"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(texto);
        }}
      >
        <input
          ref={campoRef}
          id="pedido-ia"
          className="campo__entrada"
          value={texto}
          maxLength={500}
          placeholder={anterior ? 'Responda ou peça outra coisa…' : foco ? 'O que mudar neste item?' : 'Ex.: deixa os textos mais chamativos'}
          onChange={(e) => setTexto(e.target.value)}
          disabled={enviando}
        />
        <button type="submit" className="botao botao--pequeno" disabled={enviando || texto.trim().length < 2}>
          {enviando ? 'Fazendo…' : 'Aplicar'}
        </button>
      </form>

      {/* Os passos da IA, ao vivo: ler, decidir, editar, conferir. */}
      {enviando && passos.length > 0 && (
        <ol className="pedir-ia__passos" aria-live="polite">
          {passos.slice(-4).map((p, i, l) => (
            <li key={`${p}-${i}`} data-atual={i === l.length - 1 || undefined}>
              {p}
            </li>
          ))}
        </ol>
      )}

      {!resposta && !enviando && (
        <div className="pedir-ia__exemplos">
          {(foco?.exemplos ?? exemplos).map((e) => (
            <button key={e} type="button" className="pedir-ia__exemplo" onClick={() => void enviar(e)}>
              {e}
            </button>
          ))}
          {extras.map((x) => (
            <button key={x.rotulo} type="button" className="pedir-ia__exemplo" onClick={x.onClick}>
              {x.rotulo}
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
