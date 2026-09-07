import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';
const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
    "connect-src 'self'",
    "media-src 'self' https:",
    "worker-src 'self' blob:",
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
    ...(isProduction
        ? [
              {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains',
              },
          ]
        : []),
];

const nextConfig: NextConfig = {
    poweredByHeader: false,

    // Gera um servidor Node auto-contido em .next/standalone — usado pelo Dockerfile.
    output: 'standalone',

    async headers() {
        const privateNoStore = [
            '/admin/:path*',
            '/atendente',
            '/convite/:path*',
            '/newsletter/confirmar',
            '/api/:path*',
        ].map((source) => ({
            source,
            headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
        }));

        return [{ source: '/:path*', headers: securityHeaders }, ...privateNoStore];
    },

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
