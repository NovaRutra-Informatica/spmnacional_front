import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import SiteShell from '@/components/SiteShell';
import TranslationProvider from '@/components/TranslationProvider';
import { getPublicLocale } from '@/lib/server/public-locale';
import { loadInterfaceTranslations } from '@/lib/server/interface-translation';
import { headers } from 'next/headers';
import { isPublicIndexingEnabled, pageMetadata, publicAssetOrigin, SITE_NAME } from '@/lib/seo';
import { readAnalyticsConfig } from '@/lib/config/analytics';
import { INSTITUTIONAL_ICONS } from '@/lib/content/branding';
import '@/styles/globals.scss';

export const metadata: Metadata = {
    ...pageMetadata('/'),
    metadataBase: new URL(publicAssetOrigin(process.env.APP_URL)),
    title: {
        default: SITE_NAME,
        template: '%s | SPM',
    },
    icons: INSTITUTIONAL_ICONS,
    robots: isPublicIndexingEnabled(process.env.APP_URL)
        ? { index: true, follow: true }
        : { index: false, follow: false },
};

export const viewport: Viewport = {
    themeColor: '#004A99',
    width: 'device-width',
    initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
    const locale = await getPublicLocale();
    const requestHeaders =
        process.env.NEXT_PUBLIC_STATIC_DEMO === 'true' ? undefined : await headers();
    const analytics = readAnalyticsConfig(process.env);
    const pathname =
        process.env.NEXT_PUBLIC_STATIC_DEMO === 'true'
            ? '/'
            : (requestHeaders?.get('x-spm-pathname') ?? '/');
    const { messages, translated } = await loadInterfaceTranslations(locale, pathname);
    const actualLocale = locale === 'pt' || !translated ? 'pt-BR' : locale;
    return (
        <html lang={actualLocale} dir={actualLocale === 'ar' ? 'rtl' : 'ltr'}>
            <body>
                {/* Font Awesome local — o CSS referencia as webfonts por caminho relativo. */}
                <link rel="stylesheet" href="/assets/fonts/fontawesome/css/all.min.css" />
                {/* A sessão agora vive no servidor (cookie + `getCurrentUser`);
                    não há mais contexto de autenticação no cliente. */}
                <TranslationProvider
                    locale={locale}
                    messages={messages}
                    enabled={process.env.TRANSLATION_ENABLED === 'true'}
                >
                    <SiteShell
                        measurementId={analytics.measurementId}
                        nonce={requestHeaders?.get('x-nonce') ?? undefined}
                    >
                        {children}
                    </SiteShell>
                </TranslationProvider>
            </body>
        </html>
    );
}
