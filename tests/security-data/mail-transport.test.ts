import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import nodemailer from 'nodemailer';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const parseAddress = require('nodemailer/lib/addressparser') as (
    value: string,
) => Array<{ address?: string; name?: string }>;

describe('real mail transport regressions, without SMTP or network access', () => {
    it('preserves UTF-8 text and addresses on the installed transport', async () => {
        const transport = nodemailer.createTransport({
            jsonTransport: true,
            disableFileAccess: true,
            disableUrlAccess: true,
        });
        const result = await transport.sendMail({
            from: 'SPM <contato@example.test>',
            to: 'Pessoa <pessoa@example.test>',
            subject: 'Mensagem recebida — ação e acolhimento',
            text: 'Texto sintético de teste, sem dados reais.',
        });
        const message = JSON.parse(String(result.message));
        expect(message.to).toEqual([{ address: 'pessoa@example.test', name: 'Pessoa' }]);
        expect(message.subject).toBe('Mensagem recebida — ação e acolhimento');
        expect(message.text).toContain('sem dados reais');
    });

    it('rejects local-file and remote attachment loading before any delivery', async () => {
        const transport = nodemailer.createTransport({
            jsonTransport: true,
            disableFileAccess: true,
            disableUrlAccess: true,
        });
        for (const path of ['./.env', 'https://example.test/private']) {
            await expect(
                transport.sendMail({
                    from: 'sender@example.test',
                    to: 'receiver@example.test',
                    subject: 'Synthetic test',
                    attachments: [{ filename: 'test.txt', path }],
                }),
            ).rejects.toThrow(/access rejected/i);
        }
    });

    it('handles adversarial comment and free-text inputs within a bounded execution time', () => {
        const started = performance.now();
        const comments = parseAddress(`${'(comment)'.repeat(10_000)} user@example.test`);
        const fallback = parseAddress(`${'word '.repeat(10_000)}<`);
        expect(comments.some((item) => item.address === 'user@example.test')).toBe(true);
        expect(Array.isArray(fallback)).toBe(true);
        // A generous budget detects pathological backtracking without depending on millisecond precision.
        expect(performance.now() - started).toBeLessThan(2_000);
    });
});
