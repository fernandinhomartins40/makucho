'use client';

// ============================================================
// Escolha de fonte pelo olho: cada nome escrito na própria fonte,
// agrupado pelo tipo (sem serifa, condensadas, impacto, com serifa,
// manuscritas). As mesmas fontes que o libass usa na prévia e no render.
// ============================================================

import { useEffect, useId, useRef, useState } from 'react';
import { CATEGORIAS_DE_FONTE, FONTES_DE_VIDEO } from '@makucho/studio-contracts';
import type { CategoriaDeFonte, FonteDeVideo } from '@makucho/studio-contracts';
import { IconeDescer } from '../icones';

const FONTES = FONTES_DE_VIDEO as Record<string, FonteDeVideo>;

export function EscolhaDeFonte({
  rotulo,
  valor,
  rotuloPadrao,
  onTrocar,
}: {
  rotulo: string;
  /** Id da fonte, ou null para a padrão (do estilo ou da marca). */
  valor: string | null | undefined;
  rotuloPadrao: string;
  onTrocar: (id: string | null) => void;
}) {
  const [aberta, setAberta] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const id = useId();
  const atual = valor ? FONTES[valor] : undefined;

  useEffect(() => {
    if (!aberta) return;
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberta(false);
    };
    window.addEventListener('pointerdown', fora);
    return () => window.removeEventListener('pointerdown', fora);
  }, [aberta]);

  const escolher = (v: string | null) => {
    onTrocar(v);
    setAberta(false);
  };

  const grupos = (Object.keys(CATEGORIAS_DE_FONTE) as CategoriaDeFonte[]).map((cat) => ({
    cat,
    fontes: Object.entries(FONTES).filter(([, f]) => (f.categoria ?? 'sem_serifa') === cat),
  }));

  return (
    <div className="campo escolha-de-fonte" style={{ marginBottom: 0 }} ref={raiz}>
      <span className="campo__rotulo" id={`${id}-rotulo`}>
        {rotulo}
      </span>
      <button
        type="button"
        className="campo__selecao escolha-de-fonte__atual"
        aria-haspopup="listbox"
        aria-expanded={aberta}
        aria-labelledby={`${id}-rotulo`}
        onClick={() => setAberta((v) => !v)}
        onKeyDown={(e) => e.key === 'Escape' && setAberta(false)}
      >
        <span style={atual ? { fontFamily: `'${atual.nomeAss}'`, fontWeight: atual.negrito ? 700 : 400 } : undefined}>
          {atual?.rotulo ?? rotuloPadrao}
        </span>
        <IconeDescer size={14} />
      </button>
      {aberta && (
        <div className="escolha-de-fonte__lista" role="listbox" aria-labelledby={`${id}-rotulo`}>
          <button type="button" role="option" aria-selected={!valor} className="escolha-de-fonte__opcao" onClick={() => escolher(null)}>
            {rotuloPadrao}
          </button>
          {grupos.map(({ cat, fontes }) =>
            fontes.length ? (
              <div key={cat} role="group" aria-label={CATEGORIAS_DE_FONTE[cat]}>
                <span className="escolha-de-fonte__grupo">{CATEGORIAS_DE_FONTE[cat]}</span>
                {fontes.map(([fid, f]) => (
                  <button
                    key={fid}
                    type="button"
                    role="option"
                    aria-selected={valor === fid}
                    className="escolha-de-fonte__opcao"
                    style={{ fontFamily: `'${f.nomeAss}', sans-serif`, fontWeight: f.negrito ? 700 : 400 }}
                    onClick={() => escolher(fid)}
                  >
                    {f.rotulo}
                  </button>
                ))}
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
