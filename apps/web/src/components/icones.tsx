/**
 * Icones em SVG inline (secao 6).
 *
 * Sem biblioteca: cada icone e um componente de servidor que vira markup
 * no HTML, sem um quilobyte de JavaScript no navegador. Importar
 * lucide-react ou react-icons pelo punhado de simbolos do layout
 * custaria dezenas de KB no bundle.
 */

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

/** Logo do MAKUCHO: o "M" em triangulos, como na marca. */
export function LogoM({ className, size = 32 }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mk-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1a5fd4" />
        </linearGradient>
      </defs>
      <path d="M4 40 L14 8 L24 26 L34 8 L44 40 L35 40 L29 23 L24 33 L19 23 L13 40 Z" fill="url(#mk-grad)" />
      <path d="M24 26 L29 17 L24 8 L19 17 Z" fill="#60a5fa" opacity="0.85" />
    </svg>
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
  return <X className={className} size={size} />;
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
