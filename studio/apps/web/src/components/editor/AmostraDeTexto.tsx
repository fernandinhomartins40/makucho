'use client';

// ============================================================
// Amostra de um estilo de título (texto de tela).
//
// Como a amostra das legendas: CSS com a mesma fonte, cores, contorno,
// sombra e fundo do estilo resolvido -- e a entrada tocando ao passar
// o mouse. A prévia do vídeo, essa sim, usa o libass.
// ============================================================

import type { CSSProperties } from 'react';
import type { EstiloDoTexto, MarcaDoVideo } from '@makucho/studio-contracts';
import { resolverEstiloDoTexto } from '@makucho/studio-contracts';

export function AmostraDeTexto({
  estilo,
  componente = 'HookTitle',
  marca,
  texto = 'Seu título',
}: {
  estilo: EstiloDoTexto;
  componente?: string;
  marca?: MarcaDoVideo;
  texto?: string;
}) {
  const r = resolverEstiloDoTexto(componente, estilo, marca);
  // ~86px num quadro de 1080 viram ~16px numa caixa de ~100px.
  const tamanho = Math.max(11, Math.min(22, r.tamanhoPx / 5.4));
  const escala = tamanho / r.tamanhoPx;
  const contorno = r.contorno.largura * escala;
  const f = r.fundo;

  const css: CSSProperties & Record<'--rot', string> = {
    fontFamily: `'${r.fonte.nomeAss}', sans-serif`,
    fontWeight: r.fonte.negrito ? 700 : 400,
    fontSize: tamanho,
    color: r.cor,
    textTransform: r.caixaAlta ? 'uppercase' : 'none',
    letterSpacing: r.espacamento ? r.espacamento * escala : undefined,
    textDecoration: r.sublinhado ? 'underline' : undefined,
    WebkitTextStroke: contorno > 0 ? `${Math.max(0.6, contorno * 1.4)}px ${r.contorno.cor}` : undefined,
    paintOrder: 'stroke fill',
    textShadow:
      [
        r.sombra.distancia ? `${Math.max(1, r.sombra.distancia * escala)}px ${Math.max(1, r.sombra.distancia * escala)}px 0 ${r.sombra.cor}` : '',
        r.durante === 'brilhar' ? `0 0 6px ${r.corDeDestaque}` : '',
      ]
        .filter(Boolean)
        .join(', ') || undefined,
    background: f ? hexComAlfa(f.cor, f.opacidade) : undefined,
    padding: f ? `${Math.max(2, f.margem * escala * 0.6)}px ${Math.max(3, f.margem * escala)}px` : undefined,
    borderRadius: f ? (f.forma === 'pilula' ? 999 : f.forma === 'arredondado' ? 6 : 0) : undefined,
    width: f?.forma === 'faixa' ? '100%' : undefined,
    textAlign: 'center',
    transform: r.rotacao ? `rotate(${r.rotacao}deg)` : undefined,
    '--rot': `${r.rotacao}deg`,
  };

  return (
    <span className="amostra-texto" data-entrada={r.entrada} style={css}>
      {texto}
    </span>
  );
}

function hexComAlfa(hex: string, alfa: number): string {
  const a = Math.round(alfa * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
