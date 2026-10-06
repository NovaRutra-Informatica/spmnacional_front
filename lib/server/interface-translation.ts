import 'server-only';
import { cache } from 'react';
import catalog from '@/lib/i18n/interface-catalog.json';
import type { PublicLocale } from '@/lib/i18n/config';
import { translatePublicFields } from './translation';

export const loadInterfaceTranslations = cache(async (locale: PublicLocale, pathname: string) => {
    if (locale === 'pt') return { messages: {}, translated: false };
    const groups = Object.entries(catalog).filter(([key]) => key === 'common' || key === pathname);
    const messages: Record<string, string> = {};
    let translated = true;
    // Keep each first-visit request bounded, including when the site acquires more copy.
    await Promise.all(
        groups.map(async ([key, texts]) => {
            for (let offset = 0; offset < texts.length; offset += 512) {
                const chunk = texts.slice(offset, offset + 512);
                const result = await translatePublicFields({
                    key: `interface:${key}:${offset}`,
                    locale,
                    fields: Object.fromEntries(chunk.map((text, index) => [`t${index}`, text])),
                });
                translated &&= result.translated;
                if (result.translated)
                    chunk.forEach((text, index) => {
                        messages[text] = result.fields[`t${index}`] ?? text;
                    });
            }
        }),
    );
    return { messages: translated ? messages : {}, translated };
});
