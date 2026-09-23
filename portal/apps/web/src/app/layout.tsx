import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const SITE = process.env.NEXT_PUBLIC_SITE_NAME ?? 'MAKUCHO';
const URL_SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://makucho.com.br';

/**
 * Inter servida do proprio repositorio (licenca SIL OFL). O next/font/google
 * baixava a fonte do Google DURANTE o build, e a falha dessa chamada dentro
 * do builder Docker derrubava o deploy. Arquivo variavel (pesos 400-900),
 * subset latin: cobre o portugues. display=swap evita texto invisivel.
 */
const inter = localFont({
  src: './fonts/inter-latin-var.woff2',
  weight: '400 900',
  style: 'normal',
  display: 'swap',
  variable: '--fonte-inter',
});

/**
 * Metadados padrao (secao 34). Cada pagina sobrescreve o que precisa
 * por generateMetadata; aqui fica o que vale para o site inteiro.
 */
export const metadata: Metadata = {
  metadataBase: new URL(URL_SITE),
  title: {
    default: `${SITE} — Economia, mercado e negócios`,
    template: `%s | ${SITE}`,
  },
  description:
    'Portal de economia, finanças e negócios do Brasil. Análises de mercado, indicadores e o que muda no seu bolso.',
  applicationName: SITE,
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: SITE,
    url: URL_SITE,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
