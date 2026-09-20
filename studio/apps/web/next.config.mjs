import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // O standalone monta um server.js so com os modulos realmente
  // importados: a imagem cai de ~1 GB para algumas centenas de MB.
  output: 'standalone',
  // Raiz do monorepo, tres niveis acima (studio/apps/web -> raiz):
  // e la que vivem o node_modules do pnpm e o shared/.
  // fileURLToPath e nao URL().pathname, que no Windows devolve
  // "/C:/..." e faz o standalone nem sair.
  outputFileTracingRoot: fileURLToPath(new URL('../../../', import.meta.url)),

  reactStrictMode: true,
  poweredByHeader: false,

  transpilePackages: ['@makucho/studio-contracts'],

  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**.makucho.com.br' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  eslint: {
    // O lint roda em etapa propria; falhar o build por regra de estilo
    // atrasaria um deploy por motivo que nao e de execucao.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
