import type { Metadata, Viewport } from 'next';
import { NavBar } from '../components/NavBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'MAKUCHO Studio',
  description: 'Editor inteligente de videos',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Studio' },
};

export const viewport: Viewport = {
  themeColor: '#0A1A3C',
  width: 'device-width',
  initialScale: 1,
  // A experiencia principal e o celular segurando a camera: o zoom por
  // gesto atrapalha mais do que ajuda no teleprompter.
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {/* A navegacao fica no layout, nao em cada pagina: sem ela, as
            telas existiam soltas e so eram alcancaveis digitando a URL. */}
        <div className="app">
          {children}
          <NavBar />
        </div>
      </body>
    </html>
  );
}
