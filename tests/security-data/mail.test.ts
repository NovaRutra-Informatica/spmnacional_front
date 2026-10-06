import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), enabled: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.create } }));
vi.mock('@/lib/server/env', () => ({
    env: {
        appUrl: 'https://spm.test',
        mail: {
            host: 'smtp.test',
            port: 587,
            secure: false,
            user: 'user',
            password: 'secret',
            from: 'SPM <hello@spm.test>',
            notifyTo: 'staff@spm.test',
        },
    },
    isMailEnabled: mocks.enabled,
}));
import {
    sendContactAcknowledgement,
    sendContactNotification,
    sendMail,
    sendNewsletterConfirmation,
    sendUserInvite,
} from '@/lib/server/mail';

describe('transactional mail safety', () => {
    beforeEach(() => {
        mocks.enabled.mockReturnValue(true);
        mocks.create.mockReturnValue({ sendMail: mocks.send });
        mocks.send.mockReset().mockResolvedValue({ messageId: 'test' });
    });

    it('requires TLS, refuses file/network content and escapes text in generated HTML', async () => {
        expect(
            await sendMail({
                to: 'person@spm.test',
                subject: 'Olá',
                text: '<script>bad</script>\n\nOlá & tudo bem',
            }),
        ).toBe(true);
        expect(mocks.create).toHaveBeenCalledWith(
            expect.objectContaining({
                requireTLS: true,
                tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
                disableFileAccess: true,
                disableUrlAccess: true,
                connectionTimeout: 10_000,
            }),
        );
        expect(mocks.send.mock.calls[0][0].html).toContain('&lt;script&gt;');
        expect(mocks.send.mock.calls[0][0].html).not.toContain('<script>');
    });

    it('refuses header injection and excessive recipient arrays', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(
            await sendMail({
                to: 'person@spm.test',
                subject: 'Hi\r\nBcc: attacker@test',
                text: 'body',
            }),
        ).toBe(false);
        expect(
            await sendMail({ to: Array(51).fill('person@spm.test'), subject: 'Hi', text: 'body' }),
        ).toBe(false);
        expect(mocks.send).not.toHaveBeenCalled();
        expect(JSON.stringify(log.mock.calls)).not.toContain('attacker');
    });

    it('preserves a stable outbox Message-ID and refuses malformed identifiers', async () => {
        const messageId = '<spm-contact-f6623d88-a368-4aef-9aa3-cb32e376c490@spmnacional.org.br>';
        await sendContactAcknowledgement({ name: 'Pessoa', email: 'person@spm.test' }, messageId);
        expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ messageId }));
        mocks.send.mockClear();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        for (const invalid of [
            'plain-id',
            '<id@test>\r\nBcc: attacker@test',
            '<id@test><another@test>',
        ]) {
            expect(
                await sendMail({
                    to: 'person@spm.test',
                    subject: 'Hi',
                    text: 'body',
                    messageId: invalid,
                }),
            ).toBe(false);
        }
        expect(mocks.send).not.toHaveBeenCalled();
    });

    it('does not log recipients, subjects, tokens or provider error messages', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.enabled.mockReturnValue(false);
        expect(
            await sendMail({
                to: 'private@example.com',
                subject: 'Very private',
                text: 'token-secret',
            }),
        ).toBe(false);
        mocks.enabled.mockReturnValue(true);
        mocks.send.mockRejectedValueOnce(new Error('private@example.com token-secret'));
        expect(
            await sendMail({
                to: 'private@example.com',
                subject: 'Very private',
                text: 'token-secret',
            }),
        ).toBe(false);
        expect(JSON.stringify([...info.mock.calls, ...error.mock.calls])).not.toMatch(
            /private|token-secret/,
        );
    });

    it('builds the expected transactional messages without remote template loading', async () => {
        expect(
            await sendContactNotification({
                name: 'Pessoa',
                email: 'person@test',
                subject: 'Ajuda',
                language: 'pt',
                message: 'Texto',
            }),
        ).toBe(true);
        expect(await sendContactAcknowledgement({ name: 'Pessoa', email: 'person@test' })).toBe(
            true,
        );
        expect(
            await sendUserInvite({
                name: 'Equipe',
                email: 'person@test',
                inviteUrl: 'https://spm.test/convite?token=synthetic',
                roleName: 'Editor',
            }),
        ).toBe(true);
        expect(
            await sendNewsletterConfirmation({
                email: 'person@test',
                confirmUrl: 'https://spm.test/confirmar?token=synthetic',
            }),
        ).toBe(true);
        expect(mocks.send).toHaveBeenCalledTimes(4);
    });
});
