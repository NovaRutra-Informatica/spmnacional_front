import 'server-only';
import { isPublicLocale, SOURCE_LOCALE, type PublicLocale } from '@/lib/i18n/config';
import { readTranslationConfig } from '@/lib/i18n/translation-config';
import { getGoogleAccessToken } from './google-auth';
import { readBoundedJson } from './bounded-json';
import { logError } from './logger';
import {
    prepareTranslation,
    translationBatches,
    type TranslationFormat,
} from './translation-content';
import {
    claimTranslation,
    completeTranslation,
    readTranslation,
    releaseTranslation,
    reserveTranslationCharacters,
    translationId,
} from './translation-store';

export type PublicTranslationStatus =
    | 'source'
    | 'disabled'
    | 'cached'
    | 'translated'
    | 'pending'
    | 'budget_exceeded'
    | 'unavailable'
    | 'invalid';
export interface PublicTranslationResult {
    fields: Record<string, string>;
    translated: boolean;
    status: PublicTranslationStatus;
}

function cachedFields(
    value: unknown,
    source: Record<string, string>,
): Record<string, string> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== Object.keys(source).length) return null;
    return Object.keys(source).every(
        (key) =>
            typeof record[key] === 'string' &&
            (record[key].length > 0 || !source[key].trim()) &&
            record[key].length <= 800_000,
    )
        ? (record as Record<string, string>)
        : null;
}

function parseTranslations(value: unknown, sources: string[]): string[] {
    if (
        !value ||
        typeof value !== 'object' ||
        !('translations' in value) ||
        !Array.isArray(value.translations)
    )
        throw new Error('Invalid Translation response');
    if (value.translations.length !== sources.length)
        throw new Error('Incomplete Translation response');
    return value.translations.map((entry: unknown, index: number) => {
        if (
            !entry ||
            typeof entry !== 'object' ||
            !('translatedText' in entry) ||
            typeof entry.translatedText !== 'string' ||
            !entry.translatedText.trim() ||
            entry.translatedText.length > Math.max(512, sources[index].length * 8) ||
            /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(entry.translatedText)
        )
            throw new Error('Unsafe Translation response');
        return entry.translatedText;
    });
}

/**
 * Apenas servidor: fields deve vir de conteúdo já aprovado para publicação,
 * nunca de payload/query fornecido por visitante, contato, atendimento ou conta.
 * Não existe endpoint público que aceite texto arbitrário. O consumidor deve
 * verificar publicação ANTES desta função, inclusive quando há cache.
 *
 * Falhas, concorrência e limite de custo preservam integralmente o português.
 */
export async function translatePublicFields(input: {
    key: string;
    locale: PublicLocale;
    fields: Record<string, string>;
    format?: TranslationFormat;
}): Promise<PublicTranslationResult> {
    const fallback = (status: PublicTranslationStatus): PublicTranslationResult => ({
        fields: input.fields,
        translated: false,
        status,
    });
    if (input.locale === SOURCE_LOCALE) return fallback('source');
    if (!isPublicLocale(input.locale) || !/^[a-zA-Z][a-zA-Z0-9_:/.-]{0,255}$/.test(input.key))
        return fallback('invalid');
    let config;
    let prepared;
    try {
        config = readTranslationConfig(process.env);
        if (!config.enabled) return fallback('disabled');
        prepared = prepareTranslation(input.fields, input.format ?? 'text');
    } catch {
        return fallback('invalid');
    }
    if (prepared.segments.length === 0) return fallback('source');
    const id = translationId(input.key, prepared.sourceHash, input.locale);
    let lease: Awaited<ReturnType<typeof claimTranslation>> = null;
    try {
        const cached = cachedFields(await readTranslation(id), input.fields);
        if (cached) return { fields: cached, translated: true, status: 'cached' };
        // Permite homologar cache/UI completamente offline. Nenhuma tentativa de
        // metadata/token é necessária quando o operador desligou novas reservas.
        if (config.dailyCharacterLimit === 0) return fallback('budget_exceeded');
        lease = await claimTranslation({
            id,
            key: input.key,
            sourceHash: prepared.sourceHash,
            locale: input.locale,
        });
        if (!lease) {
            // Outro servidor pode ter concluído entre a leitura e a aquisição.
            const ready = cachedFields(await readTranslation(id), input.fields);
            return ready
                ? { fields: ready, translated: true, status: 'cached' }
                : fallback('pending');
        }
        const token = await getGoogleAccessToken([
            'https://www.googleapis.com/auth/cloud-translation',
        ]);
        if (!token) throw new Error('Translation credentials unavailable');
        if (
            !(await reserveTranslationCharacters(prepared.characters, config.dailyCharacterLimit))
        ) {
            await releaseTranslation(id, lease.token, 300);
            return fallback('budget_exceeded');
        }
        const parent = `projects/${config.project}/locations/${config.location}`;
        const signal = AbortSignal.timeout(8_000);
        const translated: string[] = [];
        for (const contents of translationBatches(prepared.segments)) {
            const response = await fetch(
                `https://translation.googleapis.com/v3/${parent}:translateText`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents,
                        mimeType: 'text/plain',
                        sourceLanguageCode: SOURCE_LOCALE,
                        targetLanguageCode: input.locale,
                        model: `${parent}/models/general/nmt`,
                    }),
                    cache: 'no-store',
                    redirect: 'error',
                    signal,
                },
            );
            if (!response.ok) {
                await response.body?.cancel();
                throw new Error('Translation upstream failure');
            }
            translated.push(
                ...parseTranslations(await readBoundedJson(response, 1_048_576), contents),
            );
        }
        const fields = prepared.restore(translated);
        if (!(await completeTranslation(id, lease.token, fields))) return fallback('pending');
        return { fields, translated: true, status: 'translated' };
    } catch (error) {
        logError('translation.unavailable', error);
        if (lease) {
            try {
                await releaseTranslation(
                    id,
                    lease.token,
                    Math.min(3600, 60 * 2 ** Math.min(lease.attempts - 1, 6)),
                );
            } catch {
                // Lease tem prazo no banco; nenhum segredo/conteúdo entra nos logs.
            }
        }
        return fallback('unavailable');
    }
}
