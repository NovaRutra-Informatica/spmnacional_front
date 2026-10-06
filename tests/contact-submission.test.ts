import { describe, expect, it } from 'vitest';
import {
    contactAttemptFingerprint,
    newContactSubmissionKey,
} from '@/lib/config/contact-submission';

function form(message = 'Mensagem sintética de teste') {
    const data = new FormData();
    data.set('name', 'Pessoa sintética');
    data.set('email', 'synthetic@example.invalid');
    data.set('message', message);
    return data;
}

describe('contact attempt keys', () => {
    it('uses a fresh UUIDv4 without embedding visitor data', () => {
        const first = newContactSubmissionKey();
        expect(first).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        expect(newContactSubmissionKey()).not.toBe(first);
    });
    it('preserves the same attempt for unchanged retries', () => {
        expect(contactAttemptFingerprint(form())).toBe(contactAttemptFingerprint(form()));
    });
    it('detects an edited message after an attempted send', () => {
        expect(contactAttemptFingerprint(form('Texto A'))).not.toBe(
            contactAttemptFingerprint(form('Texto B')),
        );
    });
    it('ignores the attempt key, honeypot and fields unrelated to message content', () => {
        const first = form();
        const second = form();
        second.set('idempotencyKey', newContactSubmissionKey());
        second.set('website', 'synthetic trap');
        second.set('tracking', 'discard');
        expect(contactAttemptFingerprint(first)).toBe(contactAttemptFingerprint(second));
    });
});
