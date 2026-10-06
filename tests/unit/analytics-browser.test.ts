import { describe, expect, it } from 'vitest';
import { createAnalyticsController, type AnalyticsPort } from '@/lib/analytics-browser';

function fixture(signals: AnalyticsPort['signals'] = {}) {
    const calls: unknown[][] = [];
    const loads: unknown[][] = [];
    const disabled: boolean[] = [];
    let clears = 0;
    const controller = createAnalyticsController('G-TEST123456', {
        origin: 'https://spmnacional.org.br', signals,
        command(...args) { calls.push(args); },
        load(...args) { loads.push(args); },
        disable(value) { disabled.push(value); },
        clearCookies() { clears++; },
    }, 'test-nonce');
    return { controller, calls, loads, disabled, clears: () => clears };
}

describe('GA4 browser lifecycle', () => {
    it('makes no analytics commands or requests until consent', () => {
        const f = fixture();
        f.controller.update('unknown', '/');
        f.controller.update('denied', '/');
        expect(f.loads).toEqual([]);
        expect(f.calls).toEqual([]);
        expect(f.disabled.every(Boolean)).toBe(true);
    });
    it('loads once after consent, denies advertising and deduplicates clean page views', () => {
        const f = fixture();
        f.controller.update('granted', '/fale-conosco');
        f.controller.update('granted', '/fale-conosco');
        f.controller.update('granted', '/quem-somos');
        expect(f.loads).toEqual([['G-TEST123456', 'test-nonce']]);
        expect(f.calls.find(([command]) => command === 'config')?.[2]).toMatchObject({ send_page_view: false, cookie_domain: 'none', allow_google_signals: false, page_referrer: '' });
        expect(f.calls.filter(([command]) => command === 'event')).toHaveLength(2);
        expect(f.calls[0][2]).toMatchObject({ ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    });
    it('disables measurement on private paths and on revocation without reloading', () => {
        const f = fixture();
        f.controller.update('granted', '/');
        f.controller.update('granted', '/admin');
        f.controller.update('denied', '/');
        expect(f.disabled.at(-1)).toBe(true);
        expect(f.clears()).toBe(1);
        expect(f.calls.filter(([command]) => command === 'event')).toHaveLength(1);
        expect(f.calls.at(-1)).toEqual(['consent', 'update', expect.objectContaining({ analytics_storage: 'denied' })]);
        f.controller.stop();
        expect(f.disabled.at(-1)).toBe(true);
    });
    it.each([{ globalPrivacyControl: true }, { doNotTrack: '1' }])('never loads when privacy signals prohibit it', (signals) => {
        const f = fixture(signals);
        f.controller.update('granted', '/');
        expect(f.loads).toEqual([]);
        expect(f.calls).toEqual([]);
    });
    it('rejects token URLs and encoded paths rather than sending their content', () => {
        const f = fixture();
        f.controller.update('granted', '/?email=private@example.test');
        f.controller.update('granted', '/newsletter/confirmar?token=private');
        f.controller.update('granted', '/%61dmin');
        expect(f.loads).toEqual([]);
        expect(f.calls).toEqual([]);
    });
});
