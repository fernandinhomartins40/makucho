import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // O standalone monta um server.js so com os modulos realmente
  // importados: a imagem cai de ~1 GB para algumas centenas de MB.
  output: 'standalone',
  // Raiz do monorepo: o standalone precisa dela para rastrear os pacotes
  // compartilhados. fileURLToPath e nao URL().pathname, que no Windows
  // devolve "/C:/..." — caminho invalido que faz o standalone nem sair.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),

  reactStrictMode: true,
  poweredByHeader: false,

  // Os pacotes compartilhados sao TypeScript compilado para CommonJS;
  // o Next precisa transpila-los junto com a aplicacao.
  transpilePackages: ['@makucho/types', '@makucho/validation'],

  images: {
    // As imagens vem do proprio dominio, servidas pelo nginx em /files.
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**.makucho.com.br' },
      { protocol: 'https', hostname: 'makucho.com.br' },
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
