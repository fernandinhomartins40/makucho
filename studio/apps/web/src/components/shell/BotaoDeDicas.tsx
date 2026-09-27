'use client';

// ============================================================
// Explicações sob demanda.
//
// O Studio explicava tudo o tempo todo: cada campo com um parágrafo, e
// a tela virava texto. Agora as explicações de apoio ficam escondidas
// e aparecem para quem toca no "?" (vale no app inteiro e fica
// lembrado). Avisos, erros e confirmações continuam sempre visíveis --
// só o "como funciona" sai da frente.
// ============================================================

import { useEffect, useState } from 'react';
import { IconeAjuda } from '../icones';

const CHAVE = 'studio:dicas';

/** Aplica a preferência salva (chamado uma vez, no carregamento). */
export function aplicarDicasSalvas(): void {
  try {
    if (window.localStorage.getItem(CHAVE) === '1') document.documentElement.dataset.dicas = '1';
  } catch {
    // Sem armazenamento: começa sem explicações.
  }
}

export function BotaoDeDicas({ className = 'botao-icone' }: { className?: string }) {
  const [ligadas, setLigadas] = useState(false);
  useEffect(() => {
    aplicarDicasSalvas();
    setLigadas(document.documentElement.dataset.dicas === '1');
  }, []);
  const alternar = () => {
    const nova = !ligadas;
    setLigadas(nova);
    if (nova) document.documentElement.dataset.dicas = '1';
    else delete document.documentElement.dataset.dicas;
    try {
      window.localStorage.setItem(CHAVE, nova ? '1' : '0');
    } catch {
      // Vale só nesta visita.
    }
  };
  return (
    <button
      type="button"
      className={className}
      aria-pressed={ligadas}
      aria-label={ligadas ? 'Esconder as explicações' : 'Mostrar as explicações'}
      title={ligadas ? 'Esconder as explicações' : 'Mostrar as explicações da tela'}
      onClick={alternar}
      data-dicas-botao
    >
      <IconeAjuda size={19} weight={ligadas ? 'fill' : 'regular'} />
    </button>
  );
}
