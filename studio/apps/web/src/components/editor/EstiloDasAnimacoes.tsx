'use client';

// ============================================================
// "Estilo das animações": automático (a IA escolhe pelo tom da fala) ou
// um do catálogo do HyperFrames. No envio e no "Refazer a análise": a
// montagem usa o escolhido em todas as animações do vídeo.
// ============================================================

import { ESTILOS_DE_ANIMACAO, PALETAS_DE_ANIMACAO, coresDaPaleta, estiloDeAnimacao, temaDaAnimacao, type EstiloDeAnimacao } from '@makucho/studio-contracts';

const GRUPOS: Array<[EstiloDeAnimacao['familia'], string]> = [
  ['exclusivo', 'Exclusivos do Studio'],
  ['cartao', 'Cartões'],
  ['identidade', 'Identidades visuais'],
  ['preset', 'Presets de quadro'],
  ['referencia', 'Referência do Studio'],
];

interface Props {
  valor: string | null;
  onValor: (v: string | null) => void;
  /** A paleta ("clima:indice"); nula = as cores do estilo. */
  paleta?: string | null;
  onPaleta?: (p: string | null) => void;
  id?: string;
}

export function EstiloDasAnimacoes({ valor, onValor, paleta = null, onPaleta, id = 'estilo-das-animacoes' }: Props) {
  const atual = estiloDeAnimacao(valor);
  const tema = temaDaAnimacao(valor, paleta);
  const p = coresDaPaleta(paleta);
  return (
    <div className="pilha" style={{ gap: 'var(--e2)' }}>
    <label className="campo" htmlFor={id} style={{ marginBottom: 0 }}>
      <span className="campo__rotulo">Estilo das animações</span>
      <div className="linha" style={{ gap: 'var(--e2)', alignItems: 'center' }}>
        {atual && (
          <span className="estilo-da-animacao__amostra" aria-hidden>
            {atual.cores.slice(0, 3).map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
          </span>
        )}
        <select id={id} className="campo__entrada" value={valor ?? ''} onChange={(e) => onValor(e.target.value || null)}>
          <option value="">Automático (a IA escolhe pelo tom da fala)</option>
          {GRUPOS.map(([familia, nome]) => (
            <optgroup key={familia} label={nome}>
              {ESTILOS_DE_ANIMACAO.filter((e) => e.familia === familia).map((e) => (
                <option key={e.chave} value={e.chave}>
                  {e.nome} -- {e.carater}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <span className="campo__ajuda">{atual ? `Bom para: ${atual.quando}.` : 'Explicativo, sério, divertido: a IA lê a fala e escolhe o visual que combina.'}</span>
    </label>
    {onPaleta && atual && (
      <label className="campo" htmlFor={`${id}-cores`} style={{ marginBottom: 0 }}>
        <span className="campo__rotulo">Cores das animações</span>
        <div className="linha" style={{ gap: 'var(--e2)', alignItems: 'center' }}>
          {tema && (
            <span className="estilo-da-animacao__amostra" aria-hidden>
              {[tema.fundo, tema.texto, tema.destaque, tema.destaque2].map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </span>
          )}
          <select id={`${id}-cores`} className="campo__entrada" value={p ? `${p.paleta.chave}:${paleta!.split(':')[1] ?? 0}` : ''} onChange={(e) => onPaleta(e.target.value || null)}>
            <option value="">As do estilo</option>
            {PALETAS_DE_ANIMACAO.map((pl) => (
              <optgroup key={pl.chave} label={`${pl.nome} -- ${pl.clima}`}>
                {pl.conjuntos.map((_, i) => (
                  <option key={i} value={`${pl.chave}:${i}`}>
                    {pl.nome} {i + 1}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <span className="campo__ajuda">Fundo, texto e destaques do tema. A cor da palavra falada na legenda segue o destaque.</span>
      </label>
    )}
    </div>
  );
}
