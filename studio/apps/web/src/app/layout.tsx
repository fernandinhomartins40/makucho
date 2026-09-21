import type { Metadata, Viewport } from 'next';
import { Moldura } from '../components/shell/Moldura';
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
        <Moldura>{children}</Moldura>
      </body>
    </html>
  );
}
