import { describe, expect, it, vi } from 'vitest';
import { isSessionToken, safeAdminDestination } from '@/lib/server/auth-security';
import { contentSecurityPolicy } from '@/lib/content-security-policy';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/server/env', () => ({ env: { appUrl: 'https://spm.example' } }));
vi.mock('@/lib/server/db', () => ({ prisma: {} }));

import { isTrustedMutationOrigin } from '@/lib/server/request-origin';
import { trustedClientIp } from '@/lib/server/audit';

describe('destino após login', () => {
    it.each(['/admin', '/admin/noticias', '/admin/noticias?q=teste#lista'])(
        'preserva o destino interno %s',
        (value) => expect(safeAdminDestination(value)).toBe(value),
    );
    it.each([
        '',
        'https://evil.example/admin',
        '//evil.example/admin',
        '/administrador',
        '/admin/../../fale-conosco',
        '/admin/%2e%2e/fale-conosco',
        '/admin\\evil',
        '/admin/%5cevil',
        '/admin/%00',
        '/admin/\n',
        '/admin/%ZZ',
    ])('rejeita destino não confiável %j', (value) =>
        expect(safeAdminDestination(value)).toBe('/admin'),
    );
});

describe('tokens de sessão opacos', () => {
    it('aceita somente o formato de 32 bytes base64url', () => {
        expect(isSessionToken('a'.repeat(43))).toBe(true);
        for (const value of [null, undefined, '', 'a'.repeat(42), 'a'.repeat(44), '+'.repeat(43)]) {
            expect(isSessionToken(value)).toBe(false);
        }
    });
});

describe('origem canônica das mutações', () => {
    const check = (origin: string | null, extras: Record<string, string> = {}, dev = false) =>
        isTrustedMutationOrigin(
            new Headers({ ...(origin === null ? {} : { origin }), ...extras }),
            'https://spm.example',
            dev,
        );
    it('aceita o site configurado sem confiar no host do proxy', () => {
        expect(check('https://spm.example', { host: 'container:8080' })).toBe(true);
    });
    it.each([
        null,
        'null',
        'https://evil.example',
        'http://spm.example',
        'https://spm.example:444',
        'https://spm.example/path',
        'https://spm.example/',
        'https://user@spm.example',
    ])('rejeita Origin %j', (origin) => expect(check(origin)).toBe(false));
    it('não permite bypass com X-Forwarded-Host ou Sec-Fetch-Site', () => {
        expect(
            check('https://evil.example', {
                'x-forwarded-host': 'evil.example',
                host: 'evil.example',
            }),
        ).toBe(false);
        expect(check('https://spm.example', { 'sec-fetch-site': 'cross-site' })).toBe(false);
    });
    it('libera porta de desenvolvimento apenas para loopback e host exato', () => {
        expect(check('http://localhost:3001', { host: 'localhost:3001' }, true)).toBe(true);
        expect(check('http://localhost:3001', { host: 'localhost:3001' })).toBe(false);
        expect(check('http://localhost:3001', { 'x-forwarded-host': 'localhost:3001' }, true)).toBe(
            false,
        );
    });
});

describe('endereços atrás de proxy', () => {
    it('não confia em cabeçalhos sem configuração explícita', () => {
        expect(trustedClientIp('203.0.113.1', '')).toBeNull();
        expect(trustedClientIp('203.0.113.1', 'oops')).toBeNull();
    });
    it('seleciona o hop certo sem eliminar posições inválidas', () => {
        expect(trustedClientIp('198.51.100.2, 203.0.113.1, 10.0.0.1', '1')).toBe('203.0.113.1');
        expect(trustedClientIp('198.51.100.2, invalid, 10.0.0.1', '1')).toBeNull();
        expect(trustedClientIp('198.51.100.2, invalid', '0')).toBeNull();
        expect(trustedClientIp('203.0.113.1', '1')).toBeNull();
    });
});

describe('CSP privada com nonce', () => {
    it('não autoriza scripts inline/event handlers nem eval em produção', () => {
        const policy = contentSecurityPolicy(true, 'a'.repeat(43));
        const scripts = policy.split('; ').find((part) => part.startsWith('script-src '));
        expect(scripts).toContain("'nonce-" + 'a'.repeat(43) + "'");
        expect(scripts).toContain("'strict-dynamic'");
        expect(scripts).not.toContain('unsafe-inline');
        expect(policy).not.toContain('unsafe-eval');
        expect(policy).toContain("script-src-attr 'none'");
    });
    it('mantém modo público estático e rejeita injeção em nonce', () => {
        expect(contentSecurityPolicy(true).match(/script-src[^;]+/)?.[0]).toBe("script-src 'self'");
        expect(() => contentSecurityPolicy(true, "a'; default-src *")).toThrow();
    });
});
