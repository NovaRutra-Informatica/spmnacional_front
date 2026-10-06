import { beforeEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({ authSecret: 'a'.repeat(48), encryptionKey: '' }));
vi.mock('@/lib/server/env', () => ({ env: config }));
import {
    decryptSensitive,
    decryptSensitiveOrLegacy,
    encryptSensitive,
    generateToken,
    hashPassword,
    hashToken,
    maskSensitive,
    verifyPassword,
} from '@/lib/server/crypto';

describe('cryptography boundaries', () => {
    beforeEach(() => {
        config.encryptionKey = Buffer.alloc(32, 7).toString('base64');
    });

    it('hashes with random salt and verifies normalized passwords', async () => {
        const first = await hashPassword('Senhaé!123');
        const second = await hashPassword('Senhaé!123');
        expect(first).not.toBe(second);
        expect(await verifyPassword('Senhae\u0301!123', first)).toBe(true);
        expect(await verifyPassword('outra senha', first)).toBe(false);
    });

    it.each([
        null,
        '',
        'scrypt$$',
        'scrypt$YWJj$',
        'scrypt$!!!$!!!!',
        'scrypt$YQ==$YQ==',
        'sha256$a$b',
    ])('refuses malformed password record %s', async (stored) => {
        expect(await verifyPassword('qualquer senha', stored)).toBe(false);
    });

    it('rejects oversized and empty passwords before deriving', async () => {
        await expect(hashPassword('')).rejects.toThrow();
        await expect(hashPassword('é'.repeat(1024))).rejects.toThrow();
        expect(await verifyPassword('a'.repeat(1025), 'scrypt$$')).toBe(false);
    });

    it('round trips personal data with fresh nonces and authenticates every field', () => {
        const plain = 'Nome: João; telefone confidencial';
        const encrypted = encryptSensitive(plain)!;
        expect(encryptSensitive(plain)).not.toBe(encrypted);
        expect(decryptSensitive(encrypted)).toBe(plain);
        const parts = encrypted.split('.');
        parts[2] = Buffer.from(parts[2], 'base64url').subarray(0, 4).toString('base64url');
        expect(decryptSensitive(parts.join('.'))).toBeNull();
        expect(decryptSensitive(`${encrypted}x`)).toBeNull();
        expect(decryptSensitive(encrypted.replace('v1.', 'v2.'))).toBeNull();
        config.encryptionKey = Buffer.alloc(32, 8).toString('base64');
        expect(decryptSensitive(encrypted)).toBeNull();
    });

    it('does not silently downgrade encryption and only permits explicitly marked legacy data', () => {
        expect(encryptSensitive('')).toBeNull();
        expect(decryptSensitiveOrLegacy('antigo', null)).toBe('antigo');
        expect(decryptSensitiveOrLegacy('antigo', new Date())).toBeNull();
        config.encryptionKey = 'not-a-key';
        expect(() => encryptSensitive('privado')).toThrow();
        expect(decryptSensitive('v1.a.b.c')).toBeNull();
    });

    it('hashes opaque tokens without keeping raw token material', () => {
        const token = generateToken();
        expect(token).toMatch(/^[\w-]{43}$/);
        expect(hashToken(token)).toHaveLength(64);
        expect(hashToken(token)).not.toBe(hashToken(generateToken()));
        expect(maskSensitive('João')).toBe('J••o');
        expect(maskSensitive(null)).toBe('—');
    });
});
