import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  typescript: {
    // AINDA LIGADO, mas não por opção: restam 14 erros de tipo anteriores a esta
    // rodada (recharts, react-day-picker v9, `slots` sem tipo na agenda). Nenhum
    // toca segurança ou isolamento por clínica.
    //
    // Rode `npm run typecheck` para vê-los. A meta é zerar e trocar para `false` —
    // enquanto estiver `true`, um erro novo passa despercebido.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;