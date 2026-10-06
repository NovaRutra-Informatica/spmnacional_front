import { describe, expect, it } from 'vitest';
import {
    ANALYTICS_CONSENT_KEY, analyticsLocation, analyticsPermitted, isAnalyticsPath,
    readAnalyticsConfig, readAnalyticsConsent, saveAnalyticsConsent,
} from '@/lib/config/analytics';

describe('optional Analytics and explicit consent', () => {
    const id = 'G-TEST123456';
    it('stays disabled without an actual ID and explicit activation', () => {
        expect(readAnalyticsConfig({})).toEqual({ enabled: false, measurementId: undefined });
        expect(readAnalyticsConfig({ GA_MEASUREMENT_ID: id }).enabled).toBe(false);
        expect(readAnalyticsConfig({ ANALYTICS_ENABLED: 'true', GA_MEASUREMENT_ID: id, GA_ENHANCED_MEASUREMENT_DISABLED: 'true' })).toEqual({ enabled: true, measurementId: id });
        expect(() => readAnalyticsConfig({ ANALYTICS_ENABLED: 'true', GA_MEASUREMENT_ID: id })).toThrow('Enhanced Measurement');
    });
    it.each([
        { ANALYTICS_ENABLED: 'true' },
        { ANALYTICS_ENABLED: 'yes' },
        { GA_MEASUREMENT_ID: 'G-TEST" onclick="alert(1)' },
        { GA_MEASUREMENT_ID: 'private-api-secret' },
    ])('rejects malformed configuration without reflecting the value', (source) => {
        expect(() => readAnalyticsConfig(source)).toThrow();
        try { readAnalyticsConfig(source); } catch (error) {
            expect(String(error)).not.toContain(Object.values(source)[0]);
        }
    });
    it('never treats the former essential-cookie acknowledgement as analytics consent', () => {
        expect(readAnalyticsConsent({ getItem: (key) => key === 'spm_cookies' ? 'true' : null, setItem() {} })).toBe('unknown');
        expect(readAnalyticsConsent({ getItem: () => 'true', setItem() {} })).toBe('unknown');
        expect(readAnalyticsConsent({ getItem: () => 'granted', setItem() {} })).toBe('granted');
        expect(readAnalyticsConsent({ getItem: () => 'denied', setItem() {} })).toBe('denied');
    });
    it('tolerates unavailable storage and persists only the consent preference', () => {
        const calls: string[][] = [];
        saveAnalyticsConsent({ getItem: () => null, setItem: (...args) => { calls.push(args); } }, 'denied');
        expect(calls).toEqual([[ANALYTICS_CONSENT_KEY, 'denied']]);
        const unavailable = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
        expect(readAnalyticsConsent(unavailable)).toBe('unknown');
        expect(() => saveAnalyticsConsent(unavailable, 'granted')).not.toThrow();
    });
    it.each(['/admin', '/admin/atendimentos/record', '/atendente', '/convite/private-token', '/newsletter/confirmar', '/api/auth/google/callback', '/%61dmin', '//evil.test', '/assets/image.webp'])('does not measure sensitive or non-page paths %s', (path) => {
        expect(isAnalyticsPath(path)).toBe(false);
        expect(analyticsPermitted(id, 'granted', path)).toBe(false);
    });
    it('honors denial and browser privacy signals', () => {
        expect(analyticsPermitted(id, 'unknown', '/')).toBe(false);
        expect(analyticsPermitted(id, 'denied', '/')).toBe(false);
        expect(analyticsPermitted(id, 'granted', '/', { globalPrivacyControl: true })).toBe(false);
        expect(analyticsPermitted(id, 'granted', '/', { doNotTrack: '1' })).toBe(false);
        expect(analyticsPermitted(id, 'granted', '/quem-somos')).toBe(true);
    });
    it('strips private query/hash values and rejects alternate origins and credentials', () => {
        expect(analyticsLocation('https://spmnacional.org.br', '/fale-conosco?email=private@example.test#token')).toBe('https://spmnacional.org.br/fale-conosco');
        expect(analyticsLocation('https://spmnacional.org.br', '/newsletter/confirmar?token=private')).toBeUndefined();
        expect(analyticsLocation('https://spmnacional.org.br', '//evil.test/')).toBeUndefined();
        expect(analyticsLocation('https://user:secret@spmnacional.org.br', '/')).toBeUndefined();
    });
});
