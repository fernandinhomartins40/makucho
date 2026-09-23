/**
 * Ícones simples em SVG inline; a marca usa o asset oficial do cliente.
 *
 * Sem biblioteca: cada ícone vira markup no HTML. Importar
 * lucide-react ou react-icons pelo punhado de simbolos do layout
 * custaria dezenas de KB no bundle.
 */

import Image from 'next/image';

type Props = { className?: string; size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

/** Símbolo oficial derivado do arquivo fornecido pelo cliente. */
export function LogoM({ className, size = 32 }: Props) {
  return (
    <Image
      src="/brand/makucho-symbol-metallic-master.webp"
      alt=""
      className={className}
      width={size}
      height={size}
      aria-hidden="true"
    />
  );
}

export function Lupa({ className, size = 14 }: Props) {
  return (
    <svg className={className} {...base(size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function Play({ className, size = 12 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}

export function Calendario({ className, size = 12 }: Props) {
  return (
    <svg className={className} {...base(size)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function Relogio({ className, size = 12 }: Props) {
  return (
    <svg className={className} {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function Seta({ className, size = 13 }: Props) {
  return (
    <svg className={className} {...base(size)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function TriEmAlta({ className, size = 9 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M6 2 L11 10 L1 10 Z" />
    </svg>
  );
}

export function TriEmBaixa({ className, size = 9 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M6 10 L1 2 L11 2 Z" />
    </svg>
  );
}

export function SetaAlta({ className, size = 20 }: Props) {
  return (
    <svg className={className} {...base(size)}>
      <path d="M6 18 18 6M9 6h9v9" />
    </svg>
  );
}

export function SetaBaixa({ className, size = 20 }: Props) {
  return (
    <svg className={className} {...base(size)}>
      <path d="M6 6l12 12M18 9v9H9" />
    </svg>
  );
}

export function Lampada({ className, size = 22 }: Props) {
  return (
    <svg className={className} {...base(size)} strokeWidth={1.6}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" />
      <path d="M12 0v1M3 3l.7.7M21 3l-.7.7M0 11h1M23 11h1" />
    </svg>
  );
}

export function PlayCirculo({ className, size = 22 }: Props) {
  return (
    <svg className={className} {...base(size)} strokeWidth={1.6}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m10 8.5 5 3.5-5 3.5z" />
    </svg>
  );
}

export function Barras({ className, size = 22 }: Props) {
  return (
    <svg className={className} {...base(size)} strokeWidth={1.6}>
      <rect x="4" y="13" width="4" height="7" rx="1" />
      <rect x="10" y="9" width="4" height="11" rx="1" />
      <rect x="16" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function Tendencia({ className, size = 22 }: Props) {
  return (
    <svg className={className} {...base(size)} strokeWidth={1.6}>
      <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />
    </svg>
  );
}

export function Cartao({ className, size = 22 }: Props) {
  return (
    <svg className={className} {...base(size)} strokeWidth={1.6}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19M6 15h4" />
    </svg>
  );
}

export function Chip({ className, size = 22 }: Props) {
  return (
    <svg className={className} {...base(size)} strokeWidth={1.6}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </svg>
  );
}

export function Globo({ className, size = 22 }: Props) {
  return (
    <svg className={className} {...base(size)} strokeWidth={1.6}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
    </svg>
  );
}

export function Maleta({ className, size = 22 }: Props) {
  return (
    <svg className={className} {...base(size)} strokeWidth={1.6}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" />
    </svg>
  );
}

export function Cadeado({ className, size = 14 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Zm2 0h6V7a3 3 0 0 0-6 0Z" />
    </svg>
  );
}

// ============================================================
// REDES SOCIAIS
// ============================================================

export function Instagram({ className, size = 16 }: Props) {
  return (
    <svg className={className} {...base(size)}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TikTok({ className, size = 16 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.5 2h-3v13.2a2.6 2.6 0 1 1-2.1-2.55V9.6a5.8 5.8 0 1 0 5.1 5.75V8.9a6.6 6.6 0 0 0 3.9 1.25V7.1a3.75 3.75 0 0 1-3.9-3.6V2Z" />
    </svg>
  );
}

export function YouTube({ className, size = 16 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.5 7.4a2.7 2.7 0 0 0-1.9-1.9C18.9 5 12 5 12 5s-6.9 0-8.6.5A2.7 2.7 0 0 0 1.5 7.4 28 28 0 0 0 1 12a28 28 0 0 0 .5 4.6 2.7 2.7 0 0 0 1.9 1.9C5.1 19 12 19 12 19s6.9 0 8.6-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 23 12a28 28 0 0 0-.5-4.6ZM9.8 15.3V8.7l5.7 3.3Z" />
    </svg>
  );
}

export function X({ className, size = 16 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.5 3h3.2l-7 8 8.3 10h-6.5l-5-6.2-5.8 6.2H1.5l7.5-8.5L1 3h6.6l4.6 5.8Zm-1.1 16h1.8L7.7 4.8H5.8Z" />
    </svg>
  );
}

export function LinkedIn({ className, size = 16 }: Props) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3 9h4v12H3V9Zm6.5 0h3.8v1.7h.05a4.2 4.2 0 0 1 3.75-2c4 0 4.75 2.6 4.75 6V21h-4v-5.5c0-1.3 0-3-1.85-3s-2.1 1.45-2.1 2.9V21h-4V9Z" />
    </svg>
  );
}

/** Ícone da rede pelo identificador que vem do CMS. */
export function IconeRede({ platform, className, size = 16 }: Props & { platform: string }) {
  const p = platform.toLowerCase();
  if (p.includes('instagram')) return <Instagram className={className} size={size} />;
  if (p.includes('tiktok')) return <TikTok className={className} size={size} />;
  if (p.includes('youtube')) return <YouTube className={className} size={size} />;
  if (p.includes('linkedin')) return <LinkedIn className={className} size={size} />;
  if (p === 'x' || p.includes('twitter')) return <X className={className} size={size} />;
  return <svg className={className} {...base(size)}><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></svg>;
}

// ============================================================
// TICKER
// ============================================================

/**
 * Símbolo do indicador. O ticker do layout mostra um ícone por
 * indicador; usamos o campo `icon` do CMS e caímos no símbolo do
 * próprio indicador quando ele não vem preenchido.
 */
export function IconeIndicador({ symbol, icon }: { symbol: string; icon?: string | null }) {
  const chave = (icon ?? symbol).toUpperCase();

  if (chave.includes('IBOV') || chave.includes('CHART') || chave.includes('TREND')) {
    return (
      <svg {...base(13)}>
        <path d="M3 17l5-5 4 3 8-8" />
        <path d="M16 7h4v4" />
      </svg>
    );
  }
  if (chave.includes('USD') || chave.includes('DOLAR') || chave.includes('DOLLAR')) {
    return (
      <svg {...base(13)}>
        <path d="M12 2v20M16.5 6.5H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7" />
      </svg>
    );
  }
  if (chave.includes('EUR')) {
    return (
      <svg {...base(13)}>
        <path d="M18 6.5A7 7 0 1 0 18 18M4 10h9M4 14h9" />
      </svg>
    );
  }
  if (chave.includes('BTC') || chave.includes('BITCOIN')) {
    return (
      <svg {...base(13)}>
        <path d="M8 5h6a3.5 3.5 0 0 1 0 7H8zM8 12h7a3.5 3.5 0 0 1 0 7H8zM8 5v14M10.5 2v3M14 2v3M10.5 19v3M14 19v3" />
      </svg>
    );
  }
  if (chave.includes('SELIC') || chave.includes('JURO')) {
    return (
      <svg {...base(13)}>
        <circle cx="7" cy="7" r="3" />
        <circle cx="17" cy="17" r="3" />
        <path d="M19 5 5 19" />
      </svg>
    );
  }
  // IPCA e afins
  return (
    <svg {...base(13)}>
      <path d="M4 19V9M10 19V4M16 19v-7M22 19H2" />
    </svg>
  );
}
