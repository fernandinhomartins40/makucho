'use client';

// ============================================================
// Amostra de um estilo de legenda.
//
// Quem escolhe legenda escolhe pelo olho: a amostra usa a fonte, as
// cores, o contorno e o destaque do preset, já com as cores da marca.
// É CSS, e não o libass, porque são dez amostras na tela ao mesmo
// tempo — dez instâncias do renderizador seriam dez workers. A prévia
// do vídeo, essa sim, usa o libass.
// ============================================================

import type { CSSProperties } from 'react';
import type { MarcaDoVideo, PresetDeLegenda } from '@makucho/studio-contracts';
import { resolverPreset } from '@makucho/studio-contracts';

export function AmostraDeEstilo({
  preset,
  marca,
  texto = ['Ideia', 'que', 'engaja'],
}: {
  preset: PresetDeLegenda;
  marca?: MarcaDoVideo;
  texto?: string[];
}) {
  const e = resolverPreset(preset, marca);
  // Escala da amostra: o tamanho real (60-128px num quadro de 1080) em
  // uma caixa de ~90px de largura.
  const tamanho = Math.max(11, Math.min(20, e.tamanhoPx / 5.2));
  const contorno = e.contorno.largura > 0 ? Math.max(1, e.contorno.largura / 4) : 0;

  const base: CSSProperties = {
    fontFamily: `'${e.fonte.nomeAss}', sans-serif`,
    fontWeight: e.fonte.negrito ? 700 : 400,
    fontSize: tamanho,
    lineHeight: 1.15,
    color: e.cor,
    textTransform: e.caixaAlta ? 'uppercase' : 'none',
    textShadow: [
      contorno ? `0 0 ${contorno}px ${e.contorno.cor}, 0 0 ${contorno}px ${e.contorno.cor}` : '',
      e.brilho ? `0 0 ${e.brilho}px ${e.contorno.cor}` : '',
      e.sombra ? `0 2px 3px rgb(0 0 0 / ${e.sombra.opacidade})` : '',
    ]
      .filter(Boolean)
      .join(', ') || undefined,
    WebkitTextStroke: contorno ? `${contorno * 0.6}px ${e.contorno.cor}` : undefined,
    paintOrder: 'stroke fill',
    background: e.fundo ? hexComAlfa(e.fundo.cor, e.fundo.opacidade) : undefined,
    padding: e.fundo ? '1px 4px' : undefined,
    borderRadius: e.fundo ? 3 : undefined,
    textAlign: 'center',
    display: 'inline-block',
    maxWidth: '100%',
  };

  const palavras = e.animacao === 'uma_palavra' ? texto.slice(-1) : texto.slice(0, Math.max(1, Math.min(3, e.palavrasPorBloco)));
  const ativa = palavras.length - 1;

  return (
    <span style={base}>
      {palavras.map((p, i) => {
        const destacada = i === ativa && e.animacao !== 'nenhuma' && e.animacao !== 'subir';
        const estilo: CSSProperties | undefined = destacada
          ? e.caixaAtiva
            ? { background: e.caixaAtiva.cor, padding: '0 3px', borderRadius: 2, textShadow: 'none', WebkitTextStroke: '0' }
            : { color: e.corDestaque }
          : undefined;
        return (
          <span key={p}>
            {i > 0 && ' '}
            <span style={estilo}>{p}</span>
          </span>
        );
      })}
    </span>
  );
}

function hexComAlfa(hex: string, alfa: number): string {
  const a = Math.round(alfa * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
