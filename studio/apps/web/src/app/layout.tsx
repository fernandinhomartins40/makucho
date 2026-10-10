import type { Metadata, Viewport } from 'next';
import { Moldura } from '../components/shell/Moldura';
import { RegistrarServiceWorker } from '../components/pwa/RegistrarServiceWorker';
import { SCRIPT_DO_TEMA } from '../lib/tema';
import './globals.css';
// Depois do globals: troca os tokens e a aparência das peças comuns.
import './liquid-glass.css';

/**
 * Telas de abertura do iOS, por aparelho (tamanho em pontos e densidade).
 *
 * Sem elas o iPhone mostra uma tela BRANCA enquanto o app abre. O iOS
 * só usa a imagem cujo `media` bate exatamente com o aparelho, então a
 * lista cobre os iPhones e iPads em uso; a API gera cada uma no tamanho
 * físico (pontos × densidade) no primeiro pedido.
 */
const APARELHOS_IOS: Array<[number, number, number]> = [
  [440, 956, 3], // iPhone 16/17 Pro Max
  [402, 874, 3], // iPhone 16/17 Pro
  [430, 932, 3], // iPhone 14/15/16 Plus, 15/16 Pro Max
  [393, 852, 3], // iPhone 14 Pro, 15, 15 Pro, 16
  [390, 844, 3], // iPhone 12, 13, 14
  [375, 812, 3], // iPhone X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // iPhone XS Max, 11 Pro Max
  [414, 896, 2], // iPhone XR, 11
  [414, 736, 3], // iPhone 8 Plus
  [375, 667, 2], // iPhone SE 2/3, 8
  [320, 568, 2], // iPhone SE 1
  [1032, 1376, 2], // iPad Pro 13" (M4)
  [1024, 1366, 2], // iPad Pro 12,9"
  [834, 1210, 2], // iPad Pro 11" (M4)
  [834, 1194, 2], // iPad Pro 11"
  [820, 1180, 2], // iPad Air 10,9", iPad 10
  [810, 1080, 2], // iPad 10,2"
  [744, 1133, 2], // iPad mini 6
];

const telasDeAbertura = APARELHOS_IOS.flatMap(([w, h, r]) => [
  {
    url: `/api/pwa/abertura/${w * r}x${h * r}.png`,
    media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
  },
  {
    url: `/api/pwa/abertura/${h * r}x${w * r}.png`,
    media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: landscape)`,
  },
]);

export const metadata: Metadata = {
  title: 'MAKUCHO Studio',
  description: 'Seus vídeos, editados por IA',
  applicationName: 'MAKUCHO Studio',
  // Servido pela API: nome, cores e ícones vêm da configuração do app
  // (Configurações → Aplicativo), sem novo deploy para trocar o ícone.
  manifest: '/api/pwa/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/api/pwa/icone/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/api/pwa/icone/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/api/pwa/icone/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    // O iOS ignora os ícones do manifesto: este é o da Tela de Início.
    apple: [{ url: '/api/pwa/icone/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Studio',
    // 'default' e não 'black-translucent': este último deixa o relógio e
    // a bateria sempre BRANCOS, e sobre o fundo claro eles sumiam. O iOS
    // lê isto na instalação: quem já tem o app precisa reinstalar.
    statusBarStyle: 'default',
    startupImage: telasDeAbertura,
  },
  formatDetection: { telephone: false },
  other: {
    // O par do `apple-mobile-web-app-capable` para Android/Chrome.
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  // A cor da barra do navegador acompanha o tema do aparelho.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  width: 'device-width',
  initialScale: 1,
  // O iPhone ampliava a tela sozinho (toque duplo, campo em foco) e ela
  // ficava cortada até a pessoa fechar com a pinça; as gavetas, presas
  // à tela, saíam do lugar junto. No app instalado isto trava o zoom;
  // no Safari a pinça continua valendo (ele ignora o limite de propósito).
  maximumScale: 1,
  // `cover`: o app ocupa a tela inteira do iPhone (atrás do entalhe e da
  // barra de gestos), e as áreas seguras ficam por conta do CSS.
  viewportFit: 'cover',
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // O script abaixo põe `data-tema` no <html> antes de o React assumir.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DO_TEMA }} />
      </head>
      <body>
        <RegistrarServiceWorker />
        <Moldura>{children}</Moldura>
      </body>
    </html>
  );
}
