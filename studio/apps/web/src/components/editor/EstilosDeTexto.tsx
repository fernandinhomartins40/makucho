'use client';

// ============================================================
// Grade dos estilos prontos de texto (título, destaque, chamada...).
//
// Cada cartão é o desenho do libass -- o mesmo da prévia e do render --
// com o texto e o tipo de elemento de verdade. Enquanto desenha (ou num
// navegador sem o necessário), a reserva em CSS ocupa o lugar.
// ============================================================

import { useMemo, type ReactNode } from 'react';
import type { EstiloDoTexto, MarcaDoVideo } from '@makucho/studio-contracts';
import { PRESETS_DE_TEXTO } from '@makucho/studio-contracts';
import { AmostraDeTexto } from './AmostraDeTexto';
import { assDeTexto, useAmostrasReais } from './amostrasReais';

export interface EstiloNaGrade {
  id: string;
  rotulo: string;
  descricao: string;
  estilo: EstiloDoTexto;
}

/** O visual padrão do elemento (sem estilo): o cartão "Original". */
export const ESTILO_ORIGINAL: EstiloNaGrade = {
  id: 'original',
  rotulo: 'Original',
  descricao: 'O visual padrão deste elemento, com as cores da marca.',
  estilo: {},
};

export function EstilosDeTexto({
  componente,
  texto,
  marca,
  comOriginal,
  escolhido,
  onEscolher,
  extra,
}: {
  componente: string;
  texto: string;
  marca?: MarcaDoVideo;
  comOriginal?: boolean;
  escolhido?: string | null;
  onEscolher: (e: EstiloNaGrade) => void;
  /** Algo a mais embaixo de cada cartão (ex.: "aplicar no selecionado"). */
  extra?: (e: EstiloNaGrade) => ReactNode;
}) {
  const lista = useMemo(() => [...(comOriginal ? [ESTILO_ORIGINAL] : []), ...PRESETS_DE_TEXTO], [comOriginal]);
  const pedidos = useMemo(
    () => lista.map((e) => assDeTexto(e.id, componente, texto, e.estilo, marca)),
    [lista, componente, texto, marca],
  );
  const reais = useAmostrasReais(pedidos);

  return (
    <div className="estilos estilos--texto" role="radiogroup" aria-label="Estilos prontos">
      {lista.map((e) => {
        const imagem = reais?.get(e.id);
        return (
          <div key={e.id} className="biblioteca__cartao-texto">
            <button
              type="button"
              role="radio"
              aria-checked={escolhido === e.id}
              className="estilo"
              title={e.descricao}
              onClick={() => onEscolher(e)}
            >
              <span className="estilo__amostra" data-real={imagem ? '' : undefined}>
                {imagem ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={imagem} alt="" className="estilo__imagem" />
                ) : (
                  <AmostraDeTexto estilo={e.estilo} componente={componente} marca={marca} texto={texto} />
                )}
              </span>
              <span className="estilo__rotulo">{e.rotulo}</span>
            </button>
            {extra?.(e)}
          </div>
        );
      })}
    </div>
  );
}
