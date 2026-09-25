'use client';

// ============================================================
// As variações da logo: principal, para fundo escuro, ícone e marca
// d'água. Cada uma tem um lugar certo no vídeo, e a IA escolhe entre
// elas (a versão clara sobre vídeo escuro, o ícone em espaço pequeno).
// ============================================================

import { assets as apiAssets, type Asset } from '../../lib/api';
import { IconeEnviar, IconeLixeira } from '../icones';

export const VARIANTES_DA_LOGO = [
  { kind: 'LOGO', rotulo: 'Principal', ajuda: 'A logo completa. É a que vai no canto do vídeo.', fundo: 'xadrez' },
  { kind: 'LOGO_NEGATIVE', rotulo: 'Para fundo escuro', ajuda: 'Versão clara (branca), para aparecer sobre imagens escuras.', fundo: 'escuro' },
  { kind: 'LOGO_COMPACT', rotulo: 'Ícone', ajuda: 'Só o símbolo, para espaços pequenos.', fundo: 'xadrez' },
  { kind: 'WATERMARK', rotulo: "Marca d'água", ajuda: 'Versão discreta, que fica sobre o vídeo inteiro.', fundo: 'xadrez' },
] as const;

export type VarianteDaLogo = (typeof VARIANTES_DA_LOGO)[number]['kind'];

interface Props {
  assets: readonly Asset[];
  enviando: string | null;
  onEnviar: (kind: string, arquivo: File) => void;
  onRemover: (id: string) => void;
}

export function LogosDaMarca({ assets, enviando, onEnviar, onRemover }: Props) {
  return (
    <div className="logos-da-marca">
      {VARIANTES_DA_LOGO.map((v) => {
        // A mais recente de cada tipo é a que vale (as antigas ficam
        // desativadas, para um vídeo antigo continuar explicável).
        const atual = assets.find((a) => a.kind === v.kind);
        const ocupado = enviando !== null;
        return (
          <div key={v.kind} className="logo-slot">
            <div className="logo-slot__quadro" data-fundo={v.fundo}>
              {atual ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={apiAssets.url(atual.id)} alt={`Logo ${v.rotulo}`} />
              ) : (
                <span className="logo-slot__vazio">Sem arquivo</span>
              )}
            </div>
            <div className="logo-slot__texto">
              <strong>{v.rotulo}</strong>
              <span>{v.ajuda}</span>
              {atual && !atual.hasAlpha && atual.mimeType === 'image/png' && (
                <span style={{ color: 'var(--warning)' }}>Sem fundo transparente: aparece com um retângulo.</span>
              )}
            </div>
            <div className="logo-slot__acoes">
              <label className="botao botao--secundario botao--pequeno" style={{ cursor: enviando === v.kind ? 'progress' : 'pointer' }}>
                <IconeEnviar size={14} />
                {enviando === v.kind ? 'Enviando…' : atual ? 'Trocar' : 'Enviar'}
                {/* `accept` é conveniência; quem valida é o servidor, pelos bytes. */}
                <input
                  type="file"
                  accept={v.kind === 'WATERMARK' ? 'image/png,image/webp' : 'image/png,image/svg+xml,image/webp'}
                  hidden
                  disabled={ocupado}
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0];
                    e.target.value = '';
                    if (arquivo) onEnviar(v.kind, arquivo);
                  }}
                />
              </label>
              {atual && (
                <button
                  type="button"
                  className="botao-icone botao-icone--pequeno"
                  aria-label={`Remover logo ${v.rotulo}`}
                  disabled={ocupado}
                  onClick={() => onRemover(atual.id)}
                >
                  <IconeLixeira size={15} />
                </button>
              )}
            </div>
          </div>
        );
      })}
      <p className="campo__ajuda" style={{ gridColumn: '1 / -1' }}>
        PNG, SVG ou WebP, até 5 MB. Prefira fundo transparente. Só a principal é obrigatória.
      </p>
    </div>
  );
}
