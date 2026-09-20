import type { MetadataRoute } from 'next';

// O PWA precisa disto para ser instalavel no celular, que e a
// experiencia principal do produto.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MAKUCHO Studio',
    short_name: 'Studio',
    description: 'Editor inteligente de videos',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a1a3c',
    theme_color: '#0a1a3c',
    icons: [],
  };
}
