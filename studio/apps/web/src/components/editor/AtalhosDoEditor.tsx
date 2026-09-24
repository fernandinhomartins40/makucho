'use client';

// ============================================================
// Atalhos de teclado do editor -- os mesmos dos editores de vídeo.
// Abre com "?" ou pelo botão do teclado na timeline.
// ============================================================

import { useEffect, useRef } from 'react';
import { IconeFechar, IconeTeclado } from '../icones';

const GRUPOS: ReadonlyArray<{ titulo: string; atalhos: ReadonlyArray<readonly [string[], string]> }> = [
  {
    titulo: 'Reprodução',
    atalhos: [
      [['Espaço'], 'Tocar / pausar'],
      [['Shift', 'Espaço'], 'Tocar do começo'],
      [['Home'], 'Ir para o começo'],
      [['End'], 'Ir para o fim'],
      [['←', '→'], 'Um quadro para trás / para frente'],
      [['Shift', '← →'], 'Um segundo para trás / para frente'],
    ],
  },
  {
    titulo: 'Edição',
    atalhos: [
      [['S'], 'Dividir o trecho no cursor'],
      [['C'], 'Cortar o começo do trecho até o cursor'],
      [['D'], 'Duplicar o trecho'],
      [['Delete'], 'Excluir o item ou trecho selecionado'],
      [['Ctrl', 'Z'], 'Desfazer'],
      [['Ctrl', 'Shift', 'Z'], 'Refazer'],
      [['Esc'], 'Tirar a seleção'],
    ],
  },
  {
    titulo: 'Na timeline',
    atalhos: [
      [['Clique duplo'], 'Abrir os estilos de um texto'],
      [['Arrastar'], 'Mover legenda escrita, texto ou som'],
      [['Bordas'], 'Mudar o começo e a duração'],
      [['Bordas do áudio'], 'Som antes ou depois da imagem (J/L-cut)'],
      [['Régua'], 'Clicar pula; arrastar percorre o vídeo'],
    ],
  },
];

export function AtalhosDoEditor({ onFechar }: { onFechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="atalhos__veu" onClick={onFechar}>
      <div
        ref={ref}
        className="atalhos"
        role="dialog"
        aria-modal="true"
        aria-labelledby="atalhos-titulo"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onFechar()}
      >
        <div className="linha entre" style={{ marginBottom: 'var(--e3)' }}>
          <h2 id="atalhos-titulo" className="linha" style={{ gap: 'var(--e2)', fontSize: 17 }}>
            <IconeTeclado size={20} /> Atalhos de teclado
          </h2>
          <button type="button" className="botao-icone" aria-label="Fechar" onClick={onFechar}>
            <IconeFechar size={18} />
          </button>
        </div>
        <div className="atalhos__grupos">
          {GRUPOS.map((g) => (
            <section key={g.titulo}>
              <h3 className="atalhos__titulo">{g.titulo}</h3>
              <dl className="atalhos__lista">
                {g.atalhos.map(([teclas, acao]) => (
                  <div key={acao} className="atalhos__item">
                    <dt>
                      {teclas.map((t) => (
                        <kbd key={t} className="atalhos__tecla">
                          {t}
                        </kbd>
                      ))}
                    </dt>
                    <dd>{acao}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
