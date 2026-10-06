import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

describe('barreira privada e CSP', () => {
    afterEach(() => vi.unstubAllEnvs());
    it('protects public HTML with an unforgeable nonce and keeps HML unindexed', () => {
        vi.stubEnv('APP_URL', 'https://spm-hml.35.215.232.88.sslip.io');
        const request = new NextRequest('https://spm-hml.35.215.232.88.sslip.io/quem-somos', { headers: { 'x-nonce': 'forged', 'Content-Security-Policy': 'script-src *' } });
        const first = proxy(request);
        const second = proxy(request);
        const policy = first.headers.get('Content-Security-Policy');
        expect(policy).toContain('nonce-');
        expect(policy?.match(/script-src[^;]+/)?.[0]).not.toContain('unsafe-inline');
        expect(policy).not.toContain('forged');
        expect(policy).not.toBe(second.headers.get('Content-Security-Policy'));
        expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
        expect(first.headers.get('X-Robots-Tag')).toContain('noindex');
    });
    it('opens Analytics network destinations only when configured on a public page', () => {
        vi.stubEnv('ANALYTICS_ENABLED', 'true');
        vi.stubEnv('GA_MEASUREMENT_ID', 'G-TEST123456');
        vi.stubEnv('GA_ENHANCED_MEASUREMENT_DISABLED', 'true');
        vi.stubEnv('APP_URL', 'https://spmnacional.org.br');
        const publicResponse = proxy(new NextRequest('https://spmnacional.org.br/'));
        expect(publicResponse.headers.get('Content-Security-Policy')).toContain('https://www.google-analytics.com');
        expect(publicResponse.headers.get('X-Robots-Tag')).toBeNull();
        const privateResponse = proxy(new NextRequest('https://spmnacional.org.br/atendente'));
        expect(privateResponse.headers.get('Content-Security-Policy')).not.toContain('google-analytics');
        expect(privateResponse.headers.get('Content-Security-Policy')).not.toContain('googletagmanager');
    });
    it('redireciona cookie inválido, sem confiar na mera presença', () => {
        const response = proxy(
            new NextRequest('https://spm.example/admin/noticias', {
                headers: { cookie: 'spm_session=forged; __Host-spm_session=forged' },
            }),
        );
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toContain(
            '/atendente?proximo=%2Fadmin%2Fnoticias',
        );
    });
    it('deixa login aberto e gera nonce diferente por resposta, sobrescrevendo o enviado', () => {
        const request = new NextRequest('https://spm.example/atendente', {
            headers: { 'x-nonce': 'attacker', 'Content-Security-Policy': 'script-src *' },
        });
        const first = proxy(request);
        const second = proxy(request);
        expect(first.headers.get('x-middleware-next')).toBe('1');
        const policy = first.headers.get('Content-Security-Policy');
        expect(policy).toContain('nonce-');
        expect(policy).not.toContain('attacker');
        expect(policy).not.toBe(second.headers.get('Content-Security-Policy'));
        expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
        expect(first.headers.get('Cache-Control')).toContain('no-store');
        expect(first.headers.get('Referrer-Policy')).toBe('no-referrer');
    });
});
