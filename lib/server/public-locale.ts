import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { normalizePublicLocale } from '@/lib/i18n/config';

export const getPublicLocale = cache(async () => {
    // The explicitly static demo has no translation service or request headers.
    if (process.env.NEXT_PUBLIC_STATIC_DEMO === 'true') return 'pt' as const;
    return normalizePublicLocale((await headers()).get('x-spm-locale'));
});

export const getPublicPathname = cache(async () =>
    process.env.NEXT_PUBLIC_STATIC_DEMO === 'true'
        ? '/'
        : ((await headers()).get('x-spm-pathname') ?? '/'),
);
