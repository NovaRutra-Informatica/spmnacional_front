import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // Gera um servidor Node auto-contido em .next/standalone — usado pelo Dockerfile.
    output: 'standalone',

    // Redirecionamentos herdados das rotas legadas do site anterior.
    async redirects() {
        return [
            { source: '/sobre', destination: '/quem-somos', permanent: true },
            { source: '/contato', destination: '/fale-conosco', permanent: true },
            { source: '/noticias', destination: '/publicacoes/blog', permanent: true },
            { source: '/impacto', destination: '/transparencia', permanent: true },
            // As páginas por edição da Semana do Migrante viraram uma rota
            // dinâmica alimentada pelo banco.
            {
                source: '/semana-do-migrante/material-:ano(\\d{4})',
                destination: '/semana-do-migrante/:ano',
                permanent: true,
            },
        ];
    },
};

export default nextConfig;
