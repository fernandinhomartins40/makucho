'use client';

// ============================================================
// "Que vídeo é este?" -- o tipo (a receita da montagem) e o que a IA
// não vê: preço, oferta, prazo. No envio e no "Refazer a análise".
//
// Automático é o padrão: sem fala, a IA monta pelas cenas sozinha. A
// escolha e o resumo só deixam a montagem mais certeira.
// ============================================================

import { RECEITAS, TIPOS_DE_VIDEO, type TipoDeVideo } from '@makucho/studio-contracts';

interface Props {
  tipo: TipoDeVideo | null;
  onTipo: (t: TipoDeVideo | null) => void;
  resumo: string;
  onResumo: (r: string) => void;
  /** Id do campo de texto (acessibilidade quando há dois na tela). */
  id?: string;
}

export function TipoDoVideo({ tipo, onTipo, resumo, onResumo, id = 'resumo-do-video' }: Props) {
  return (
    <div className="tipo-do-video">
      <span className="campo__rotulo" id={`${id}-tipo`}>
        Que tipo de vídeo?
      </span>
      <div className="tipo-do-video__opcoes" role="radiogroup" aria-labelledby={`${id}-tipo`}>
        <button type="button" role="radio" aria-checked={tipo === null} onClick={() => onTipo(null)} title="A IA descobre pelo vídeo">
          Automático
        </button>
        {TIPOS_DE_VIDEO.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => onTipo(t)} title={RECEITAS[t].ajuda}>
            {RECEITAS[t].rotulo}
          </button>
        ))}
      </div>
      <label className="campo" htmlFor={id}>
        <span className="campo__rotulo">O que tem neste vídeo? (opcional)</span>
        <textarea
          id={id}
          className="campo__entrada"
          rows={2}
          maxLength={400}
          value={resumo}
          placeholder="Ex.: Promoção Heineken 3 por R$ 10, só neste sábado"
          onChange={(e) => onResumo(e.target.value)}
        />
        <span className="campo__ajuda">Preço, oferta, nome do produto: a IA usa nos textos da tela e nunca inventa o que não está aqui.</span>
      </label>
    </div>
  );
}
