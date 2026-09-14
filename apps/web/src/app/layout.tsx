import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const SITE = process.env.NEXT_PUBLIC_SITE_NAME ?? 'MAKUCHO';
const URL_SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://makucho.com.br';

/**
 * Inter pelo next/font: o arquivo e baixado no build e servido do nosso
 * dominio, sem chamada ao Google em tempo de execucao. display=swap
 * evita texto invisivel enquanto a fonte carrega.
 *
 * O subset latin cobre portugues e pesa uma fracao do arquivo completo.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
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
