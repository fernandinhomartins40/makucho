import type { Metadata, Viewport } from 'next';
import { Sidebar } from '../components/shell/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'MAKUCHO Studio',
  description: 'Seus vídeos, editados por IA',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#06132d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {/* Sidebar no layout, nao em cada pagina: o guia pede
            navegacao lateral no desktop, e a barra inferior anterior
            comia altura util -- o recurso mais escasso num editor. */}
        <div className="app">
          <Sidebar />
          <div className="principal">{children}</div>
        </div>
      </body>
    </html>
  );
}
