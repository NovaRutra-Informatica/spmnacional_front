import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    retention: vi.fn(),
    cleanup: vi.fn(),
    secret: 'synthetic-retention-cron-secret-for-unit-tests',
}));
vi.mock('@/lib/server/env', () => ({ env: { cronSecret: mocks.secret } }));
vi.mock('@/lib/server/data-retention', () => ({ executeDataRetention: mocks.retention }));
vi.mock('@/lib/server/media-deletion', () => ({ processPendingMediaDeletions: mocks.cleanup }));
import { POST } from '@/app/api/cron/retencao/route';

function request(authorized = true) {
    return new Request('https://spm.test/api/cron/retencao', {
        method: 'POST',
        headers: authorized ? { authorization: `Bearer ${mocks.secret}` } : {},
    });
}

describe('retention cron and durable storage cleanup', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.retention.mockResolvedValue({ continuationRequired: false, processed: {} });
        mocks.cleanup.mockResolvedValue({ deleted: 2, failed: 0, skipped: 0, pending: 0 });
    });

    it('does not run retention or storage cleanup without the cron secret', async () => {
        expect((await POST(request(false))).status).toBe(401);
        expect(mocks.retention).not.toHaveBeenCalled();
        expect(mocks.cleanup).not.toHaveBeenCalled();
    });

    it('runs both jobs and exposes only aggregate operational counts', async () => {
        const response = await POST(request());
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            ok: true,
            mediaDeletion: { deleted: 2, pending: 0 },
        });
        expect(mocks.cleanup).toHaveBeenCalledOnce();
    });

    it('returns a retryable failure when a queued storage cleanup failed', async () => {
        mocks.cleanup.mockResolvedValue({ deleted: 0, failed: 1, skipped: 0, pending: 1 });
        const response = await POST(request());
        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('60');
        expect(await response.json()).toMatchObject({ ok: false, mediaDeletion: { failed: 1 } });
    });

    it('does not leak a database failure to scheduler callers or logs', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.cleanup.mockRejectedValueOnce(new Error('postgresql://secret@private-host/db'));
        const response = await POST(request());
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain('private-host');
        expect(JSON.stringify(log.mock.calls)).not.toContain('private-host');
    });
    it('keeps exhausted poison jobs observable even when no automatic retry remains', async () => {
        mocks.cleanup.mockResolvedValue({ deleted: 0, failed: 0, skipped: 0, pending: 0, deadLetters: 1 });
        const response = await POST(request());
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ mediaDeletion: { deadLetters: 1 } });
    });
});
