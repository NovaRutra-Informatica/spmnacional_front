import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import SiteShell from '@/components/SiteShell';
import '@/styles/globals.scss';

const DESCRIPTION =
    'Serviço Pastoral dos Migrantes: organismo da Pastoral Social da CNBB que, desde 1985, acolhe, organiza e defende os direitos de migrantes e refugiados em todo o Brasil.';

export const metadata: Metadata = {
    title: {
        default: 'SPM — Serviço Pastoral dos Migrantes',
        template: '%s | SPM — Serviço Pastoral dos Migrantes',
    },
    description: DESCRIPTION,
    icons: { icon: '/logo-small-white.png' },
    openGraph: {
        title: 'SPM Nacional - Acolher, Proteger, Promover e Integrar',
        description:
            'Junte-se a nós na construção de pontes. O migrante não é um problema, é uma solução. Conheça o Serviço Pastoral dos Migrantes.',
        url: 'https://spmnacional.org.br/',
        images: ['https://spmnacional.org.br/small-logo-white.png'],
        type: 'website',
    },
};

export const viewport: Viewport = {
    themeColor: '#004A99',
    width: 'device-width',
    initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="pt-br">
            <body>
                {/* Font Awesome local — o CSS referencia as webfonts por caminho relativo. */}
                <link rel="stylesheet" href="/assets/fonts/fontawesome/css/all.min.css" />
                {/* A sessão agora vive no servidor (cookie + `getCurrentUser`);
                    não há mais contexto de autenticação no cliente. */}
                <SiteShell>{children}</SiteShell>
            </body>
        </html>
    );
}
