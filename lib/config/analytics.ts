import { isPrivatePath } from '@/lib/i18n/links';

export const ANALYTICS_CONSENT_KEY = 'spm_analytics_consent_v1';
export type AnalyticsConsentChoice = 'granted' | 'denied' | 'unknown';
export interface ConsentStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export function isMeasurementId(value: string): boolean {
    return /^G-[A-Z0-9]{6,20}$/.test(value);
}

/** The measurement ID is public. Credentials and API keys never enter this configuration. */
export function readAnalyticsConfig(source: Record<string, string | undefined>) {
    const flag = source.ANALYTICS_ENABLED?.trim() ?? '';
    const id = source.GA_MEASUREMENT_ID?.trim() ?? '';
    if (flag && !['true', 'false'].includes(flag)) throw new Error('ANALYTICS_ENABLED inválido.');
    if (id && !isMeasurementId(id)) throw new Error('GA_MEASUREMENT_ID inválido.');
    if (flag === 'true' && !id)
        throw new Error('Informe GA_MEASUREMENT_ID antes de ativar Analytics.');
    if (flag === 'true' && source.GA_ENHANCED_MEASUREMENT_DISABLED !== 'true')
        throw new Error(
            'Desative Enhanced Measurement na propriedade GA4 antes de ativar Analytics.',
        );
    return { enabled: flag === 'true', measurementId: flag === 'true' ? id : undefined };
}

export function readAnalyticsConsent(storage: ConsentStorage): AnalyticsConsentChoice {
    try {
        const value = storage.getItem(ANALYTICS_CONSENT_KEY);
        return value === 'granted' || value === 'denied' ? value : 'unknown';
    } catch {
        return 'unknown';
    }
}

export function saveAnalyticsConsent(storage: ConsentStorage, value: 'granted' | 'denied') {
    try {
        storage.setItem(ANALYTICS_CONSENT_KEY, value);
    } catch {
        // If storage is unavailable, the decision remains valid for this document only.
    }
}

export function isAnalyticsPath(pathname: string): boolean {
    return (
        pathname.startsWith('/') &&
        !pathname.startsWith('//') &&
        !/[\\%?#\u0000-\u001f]/.test(pathname) &&
        !isPrivatePath(pathname) &&
        !pathname.startsWith('/_next') &&
        !pathname.startsWith('/assets') &&
        !/\.[a-z0-9]+$/i.test(pathname)
    );
}

export function analyticsPermitted(
    id: string,
    choice: AnalyticsConsentChoice,
    pathname: string,
    signals: { globalPrivacyControl?: boolean; doNotTrack?: string | null } = {},
): boolean {
    return (
        isMeasurementId(id) &&
        choice === 'granted' &&
        isAnalyticsPath(pathname) &&
        signals.globalPrivacyControl !== true &&
        !['1', 'yes'].includes(signals.doNotTrack ?? '')
    );
}

/** Drop query parameters, fragments and credentials, including OAuth/form tokens. */
export function analyticsLocation(origin: string, pathname: string): string | undefined {
    try {
        const base = new URL(origin);
        const url = new URL(pathname, base);
        if (
            !['http:', 'https:'].includes(base.protocol) ||
            base.username ||
            base.password ||
            url.origin !== base.origin ||
            !isAnalyticsPath(url.pathname)
        )
            return undefined;
        return `${url.origin}${url.pathname}`;
    } catch {
        return undefined;
    }
}
