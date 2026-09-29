'use client';

// ============================================================
// "Estilo das animações": automático (a IA escolhe pelo tom da fala) ou
// um do catálogo do HyperFrames. No envio e no "Refazer a análise": a
// montagem usa o escolhido em todas as animações do vídeo.
// ============================================================

import { ESTILOS_DE_ANIMACAO, estiloDeAnimacao, type EstiloDeAnimacao } from '@makucho/studio-contracts';

const GRUPOS: Array<[EstiloDeAnimacao['familia'], string]> = [
  ['cartao', 'Cartões'],
  ['identidade', 'Identidades visuais'],
  ['preset', 'Presets de quadro'],
  ['referencia', 'Referência do Studio'],
];

interface Props {
  valor: string | null;
  onValor: (v: string | null) => void;
  id?: string;
}

export function EstiloDasAnimacoes({ valor, onValor, id = 'estilo-das-animacoes' }: Props) {
  const atual = estiloDeAnimacao(valor);
  return (
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
  );
}
