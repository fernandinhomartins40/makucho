'use client';

// ============================================================
// O visual das animações em CARTÕES: cada estilo aparece como uma
// miniatura desenhada com as cores e a fonte dele (o mesmo tema que a
// animação usa), em vez de uma lista de nomes num select. "Automático"
// vem primeiro: é a escolha certa para quem não sabe o que quer.
//
// As cores (paletas) ficam recolhidas: são um ajuste fino, não uma
// decisão que todo mundo precisa tomar.
// ============================================================

import { useMemo, useState } from 'react';
import {
  ESTILOS_DE_ANIMACAO,
  FAMILIAS_DA_ANIMACAO,
  PALETAS_DE_ANIMACAO,
  coresDaPaleta,
  estiloDeAnimacao,
  temaDaAnimacao,
  type EstiloDeAnimacao,
} from '@makucho/studio-contracts';
import { IconeCheck, IconeIA } from '../icones';

const FILTROS: Array<{ id: 'todos' | EstiloDeAnimacao['familia']; nome: string }> = [
  { id: 'todos', nome: 'Todos' },
  { id: 'cartao', nome: 'Cartões' },
  { id: 'identidade', nome: 'Identidades' },
  { id: 'preset', nome: 'Pôsteres' },
];

// As fontes das animações, para as miniaturas mostrarem a letra de
// verdade. O navegador só baixa as que um cartão visível usa.
const FACES = FAMILIAS_DA_ANIMACAO.map(
  (f) => `@font-face { font-family: '${f.familia}'; src: url('/fonts/${f.arquivo}'); font-display: swap; }`,
).join('\n');

interface Props {
  valor: string | null;
  onValor: (v: string | null) => void;
  paleta: string | null;
  onPaleta: (p: string | null) => void;
}

export function EscolhaDoEstilo({ valor, onValor, paleta, onPaleta }: Props) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('todos');
  const lista = useMemo(
    () => ESTILOS_DE_ANIMACAO.filter((e) => filtro === 'todos' || e.familia === filtro),
    [filtro],
  );
  const atual = estiloDeAnimacao(valor);

  return (
    <div className="escolha-do-estilo">
      <style>{FACES}</style>

      <div className="escolha-do-estilo__filtros" role="tablist" aria-label="Tipos de estilo">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)}>
            {f.nome}
          </button>
        ))}
      </div>

      <div className="escolha-do-estilo__grade" role="radiogroup" aria-label="Estilo das animações">
        {filtro === 'todos' && (
          <button
            type="button"
            role="radio"
            aria-checked={valor === null}
            className="cartao-de-estilo cartao-de-estilo--auto"
            onClick={() => {
              onValor(null);
              onPaleta(null);
            }}
          >
            <span className="cartao-de-estilo__amostra cartao-de-estilo__amostra--auto" aria-hidden>
              <IconeIA size={30} weight="fill" />
            </span>
            <span className="cartao-de-estilo__nome">Automático</span>
            <span className="cartao-de-estilo__carater">A IA escolhe pelo tom da fala</span>
            <Marca ativo={valor === null} />
          </button>
        )}
        {lista.map((e) => (
          <CartaoDoEstilo
            key={e.chave}
            estilo={e}
            ativo={valor === e.chave}
            paleta={valor === e.chave ? paleta : null}
            onEscolher={() => {
              if (valor !== e.chave) onPaleta(null);
              onValor(e.chave);
            }}
          />
        ))}
      </div>

      {atual && <CoresDoEstilo estilo={atual} paleta={paleta} onPaleta={onPaleta} />}
    </div>
  );
}

function Marca({ ativo }: { ativo: boolean }) {
  return ativo ? (
    <span className="cartao-de-estilo__marca" aria-hidden>
      <IconeCheck size={12} weight="bold" />
    </span>
  ) : null;
}

function CartaoDoEstilo({
  estilo,
  ativo,
  paleta,
  onEscolher,
}: {
  estilo: EstiloDeAnimacao;
  ativo: boolean;
  paleta: string | null;
  onEscolher: () => void;
}) {
  const t = temaDaAnimacao(estilo.chave, paleta);
  if (!t) return null;
  return (
    <button type="button" role="radio" aria-checked={ativo} className="cartao-de-estilo" onClick={onEscolher} title={`Bom para: ${estilo.quando}`}>
      <Miniatura tema={t} />
      <span className="cartao-de-estilo__nome">{estilo.nome}</span>
      <span className="cartao-de-estilo__carater">{estilo.carater}</span>
      <Marca ativo={ativo} />
    </button>
  );
}

/** Um quadrinho no tema: faixa de destaque, título, texto e um número. */
function Miniatura({ tema }: { tema: NonNullable<ReturnType<typeof temaDaAnimacao>> }) {
  return (
    <span className="cartao-de-estilo__amostra" aria-hidden style={{ background: tema.fundo, color: tema.texto }}>
      <i className="cartao-de-estilo__faixa" style={{ background: tema.destaque }} />
      <b style={{ fontFamily: tema.fonteTitulo }}>Título forte</b>
      <em style={{ fontFamily: tema.fonteTexto, color: tema.apagado }}>texto de apoio</em>
      <span className="cartao-de-estilo__numero" style={{ fontFamily: tema.fonteTitulo, color: tema.destaque2 }}>
        87%
      </span>
      <i className="cartao-de-estilo__barra" style={{ background: `color-mix(in srgb, ${tema.texto} 16%, transparent)` }}>
        <i style={{ background: tema.destaque }} />
      </i>
    </span>
  );
}

function CoresDoEstilo({ estilo, paleta, onPaleta }: { estilo: EstiloDeAnimacao; paleta: string | null; onPaleta: (p: string | null) => void }) {
  const escolhida = coresDaPaleta(paleta);
  return (
    <details className="cores-do-estilo" open={!!escolhida}>
      <summary>
        <span>
          <strong>Cores: {escolhida ? `${escolhida.paleta.nome} ${Number(paleta!.split(':')[1] ?? 0) + 1}` : `as do ${estilo.nome}`}</strong>
          <span className="texto-secundario"> · opcional, troque se quiser as cores da sua marca</span>
        </span>
      </summary>
      <div className="cores-do-estilo__lista">
        <button type="button" className="cores-do-estilo__padrao" aria-pressed={!escolhida} onClick={() => onPaleta(null)}>
          Cores originais do estilo
        </button>
        {PALETAS_DE_ANIMACAO.map((p) => (
          <div key={p.chave} className="cores-do-estilo__clima">
            <span className="cores-do-estilo__nome">
              {p.nome} <span className="texto-secundario">· {p.clima}</span>
            </span>
            <div className="cores-do-estilo__conjuntos">
              {p.conjuntos.map((cores, i) => {
                const chave = `${p.chave}:${i}`;
                return (
                  <button
                    key={chave}
                    type="button"
                    aria-pressed={paleta === chave}
                    aria-label={`${p.nome} ${i + 1}`}
                    onClick={() => onPaleta(chave)}
                  >
                    {cores.map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
