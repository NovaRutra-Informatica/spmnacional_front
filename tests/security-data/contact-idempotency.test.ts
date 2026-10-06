import { describe, expect, it } from 'vitest';
import {
    CONTACT_ATTEMPT_TTL_MS,
    contactAttemptKeyHash,
    contactPayloadHash,
    contactReplayStatus,
    isIdempotencyClaimConflict,
} from '@/lib/server/contact-idempotency';

const key = 'f6623d88-a368-4aef-9aa3-cb32e376c490';
const payload = {
    name: 'Pessoa sintética',
    email: 'person@example.test',
    phone: '',
    city: '',
    subject: 'Outro',
    language: 'Português',
    message: 'Mensagem apenas de teste.',
};
describe('contact attempt identifiers disclose no key or content', () => {
    it.each([
        '',
        'caller-row-id',
        '1'.repeat(1000),
        key.replace('-4aef-', '-1aef-'),
        key.replace('-9aa3-', '-7aa3-'),
    ])('rejects malformed or non-v4 client identifiers: %s', (value) => {
        expect(contactAttemptKeyHash(value)).toBeNull();
    });
    it('normalizes the retry UUID and uses distinct HMAC domains', () => {
        const hash = contactAttemptKeyHash(key);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(hash).toBe(contactAttemptKeyHash(key.toUpperCase()));
        expect(hash).not.toContain(key);
        expect(hash).not.toBe(contactPayloadHash(payload));
    });
    it('fingerprints exactly the accepted content without plaintext persistence', () => {
        const hash = contactPayloadHash(payload);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(hash).toBe(contactPayloadHash({ ...payload, email: payload.email.toUpperCase() }));
        for (const field of Object.keys(payload) as Array<keyof typeof payload>) {
            if (field === 'email') continue;
            expect(
                contactPayloadHash({ ...payload, [field]: `${payload[field]}changed` }),
            ).not.toBe(hash);
        }
        expect(hash).not.toContain(payload.message);
    });
    it('allows only equal content inside the seven-day retry window', () => {
        const now = new Date('2026-10-02T12:00:00Z');
        const hash = contactPayloadHash(payload);
        const existing = {
            payloadHash: hash,
            expiresAt: new Date(now.getTime() + CONTACT_ATTEMPT_TTL_MS),
        };
        expect(contactReplayStatus(existing, hash, now)).toBe('replay');
        expect(
            contactReplayStatus(
                existing,
                contactPayloadHash({ ...payload, message: 'Outro conteúdo' }),
                now,
            ),
        ).toBe('conflict');
        expect(contactReplayStatus({ ...existing, payloadHash: 'broken' }, hash, now)).toBe(
            'conflict',
        );
        expect(contactReplayStatus({ ...existing, expiresAt: now }, hash, now)).toBe('expired');
        expect(contactReplayStatus({ ...existing, expiresAt: new Date(NaN) }, hash, now)).toBe(
            'expired',
        );
    });
    it('only retries the database unique-claim race, not arbitrary infrastructure errors', () => {
        expect(isIdempotencyClaimConflict({ code: 'P2002' })).toBe(true);
        expect(isIdempotencyClaimConflict({ code: 'P2025' })).toBe(false);
        expect(isIdempotencyClaimConflict(new Error('database details'))).toBe(false);
        expect(isIdempotencyClaimConflict(null)).toBe(false);
    });
});
