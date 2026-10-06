import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    enabled: vi.fn(),
    find: vi.fn(),
    upsert: vi.fn(),
    remove: vi.fn(),
    transaction: vi.fn(),
    log: vi.fn(),
}));
vi.mock('@/lib/server/env', () => ({
    env: {
        google: { calendarId: 'spm@group.calendar.google.com', calendarApiKey: 'private-test-key' },
    },
    isGoogleCalendarEnabled: mocks.enabled,
}));
vi.mock('@/lib/server/db', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/server/logger', () => ({ logError: mocks.log }));
import { sincronizarAgenda } from '@/lib/server/google-calendar';

const event = (id = 'event-1') => ({
    id,
    summary: 'Encontro',
    start: { date: '2027-02-01' },
    end: { date: '2027-02-02' },
    htmlLink: 'https://calendar.google.com/event',
});
const page = (items: unknown[] = [], nextPageToken?: string) =>
    Response.json({ kind: 'calendar#events', items, ...(nextPageToken ? { nextPageToken } : {}) });

describe('calendar sync integrity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.enabled.mockReturnValue(true);
        mocks.find.mockResolvedValue([]);
        mocks.upsert.mockResolvedValue({});
        mocks.remove.mockResolvedValue({ count: 1 });
        mocks.transaction.mockImplementation(async (work) =>
            work({
                agendaEvent: {
                    findMany: mocks.find,
                    upsert: mocks.upsert,
                    deleteMany: mocks.remove,
                },
            }),
        );
    });
    afterEach(() => vi.unstubAllGlobals());

    it('fetches short pages using nextPageToken before any writes and scopes deletion', async () => {
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(page([event()], 'next-page'))
            .mockResolvedValueOnce(page([event('event-2')]));
        vi.stubGlobal('fetch', fetch);
        expect(await sincronizarAgenda()).toEqual({
            ok: true,
            partial: false,
            criados: 2,
            atualizados: 0,
            removidos: 1,
        });
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls[1][0].searchParams.get('pageToken')).toBe('next-page');
        expect(fetch.mock.calls[0][0].searchParams.has('key')).toBe(false);
        expect(fetch.mock.calls[0][1]).toMatchObject({
            redirect: 'error',
            headers: { 'X-Goog-Api-Key': 'private-test-key' },
        });
        expect(mocks.remove).toHaveBeenCalledWith({
            where: expect.objectContaining({
                calendarId: 'spm@group.calendar.google.com',
                source: 'GOOGLE_CALENDAR',
                googleEventId: { notIn: ['event-1', 'event-2'] },
            }),
        });
        expect(mocks.upsert.mock.calls[0][0].update).not.toHaveProperty('published');
        expect(mocks.upsert.mock.calls[0][0].create.endsAt.toISOString()).toBe(
            '2027-02-01T23:59:59.999Z',
        );
    });

    it('never deletes absent events when the bounded pagination budget is exhausted', async () => {
        const fetch = vi
            .fn()
            .mockImplementation(async () =>
                page(
                    [event(`event-${fetch.mock.calls.length}`)],
                    `page-${fetch.mock.calls.length}`,
                ),
            );
        vi.stubGlobal('fetch', fetch);
        const result = await sincronizarAgenda();
        expect(result).toMatchObject({ ok: true, partial: true, criados: 10, removidos: 0 });
        expect(fetch).toHaveBeenCalledTimes(10);
        expect(mocks.remove).not.toHaveBeenCalled();
    });

    it('keeps existing data when a later page fails', async () => {
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(page([event()], 'next'))
            .mockResolvedValueOnce(new Response('', { status: 503 }));
        vi.stubGlobal('fetch', fetch);
        expect((await sincronizarAgenda()).ok).toBe(false);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it.each([
        {},
        { kind: 'calendar#events', items: [{ ...event(), start: { date: '2027-02-30' } }] },
        { kind: 'calendar#events', items: [{ ...event(), end: { date: '2027-01-01' } }] },
        { kind: 'calendar#events', items: 'not-an-array' },
    ])('fails closed for malformed upstream response', async (payload) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
        expect((await sincronizarAgenda()).ok).toBe(false);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('rejects pagination cycles', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(async () => page([event()], 'repeat')),
        );
        expect((await sincronizarAgenda()).ok).toBe(false);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('rejects unsafe URLs while accepting valid timed events', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                page([
                    {
                        ...event(),
                        htmlLink: 'javascript:alert(1)',
                        start: { dateTime: '2027-02-01T10:00:00-03:00' },
                        end: { dateTime: '2027-02-01T11:00:00-03:00' },
                    },
                ]),
            ),
        );
        expect((await sincronizarAgenda()).ok).toBe(true);
        expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ url: null, allDay: false });
    });

    it('does not overwrite an event belonging to a different calendar', async () => {
        mocks.find.mockResolvedValue([{ googleEventId: 'event-1', calendarId: 'other-calendar' }]);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(page([event()])));
        expect((await sincronizarAgenda()).ok).toBe(false);
        expect(mocks.upsert).not.toHaveBeenCalled();
        expect(mocks.remove).not.toHaveBeenCalled();
    });

    it('reports unavailable integration instead of claiming a successful sync', async () => {
        mocks.enabled.mockReturnValue(false);
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        expect((await sincronizarAgenda()).ok).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
    });
});
