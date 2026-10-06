import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    read: vi.fn(),
    claim: vi.fn(),
    complete: vi.fn(),
    release: vi.fn(),
    reserve: vi.fn(),
    token: vi.fn(),
    log: vi.fn(),
}));
vi.mock('../../lib/server/translation-store', () => ({
    translationId: () => 'cache-id',
    readTranslation: mocks.read,
    claimTranslation: mocks.claim,
    completeTranslation: mocks.complete,
    releaseTranslation: mocks.release,
    reserveTranslationCharacters: mocks.reserve,
}));
vi.mock('../../lib/server/google-auth', () => ({ getGoogleAccessToken: mocks.token }));
vi.mock('../../lib/server/logger', () => ({ logError: mocks.log }));
import { translatePublicFields } from '../../lib/server/translation';

const input = { key: 'post:published-test', locale: 'en' as const, fields: { title: 'Olá mundo' } };
const fetchMock = vi.fn();
beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('TRANSLATION_ENABLED', 'true');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'spm-test-123');
    vi.stubEnv('TRANSLATION_LOCATION', 'global');
    vi.stubEnv('TRANSLATION_DAILY_CHARACTER_LIMIT', '50000');
    vi.stubGlobal('fetch', fetchMock);
    mocks.read.mockResolvedValue(null);
    mocks.claim.mockResolvedValue({ token: 'lease-token', attempts: 1 });
    mocks.complete.mockResolvedValue(true);
    mocks.release.mockResolvedValue(undefined);
    mocks.reserve.mockResolvedValue(true);
    mocks.token.mockResolvedValue('synthetic-access-token');
    fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ translations: [{ translatedText: 'Hello world' }] })),
    );
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('serviço server-only de tradução pública', () => {
    it('não consulta banco nem rede para fonte em português', async () => {
        expect(await translatePublicFields({ ...input, locale: 'pt' })).toEqual({
            fields: input.fields,
            translated: false,
            status: 'source',
        });
        expect(mocks.read).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('não faz chamada faturável antes de habilitação explícita', async () => {
        vi.stubEnv('TRANSLATION_ENABLED', 'false');
        expect((await translatePublicFields(input)).status).toBe('disabled');
        expect(mocks.read).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('usa cache sem chamar Google nem reservar orçamento', async () => {
        mocks.read.mockResolvedValue({ title: 'Hello cached' });
        expect(await translatePublicFields(input)).toEqual({
            fields: { title: 'Hello cached' },
            translated: true,
            status: 'cached',
        });
        expect(mocks.reserve).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('deduplica requisição de outra instância via lease e preserva o português', async () => {
        mocks.claim.mockResolvedValue(null);
        expect(await translatePublicFields(input)).toEqual({
            fields: input.fields,
            translated: false,
            status: 'pending',
        });
        expect(mocks.token).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('releitura aproveita conclusão concorrente', async () => {
        mocks.read.mockResolvedValueOnce(null).mockResolvedValueOnce({ title: 'Ready' });
        mocks.claim.mockResolvedValue(null);
        expect((await translatePublicFields(input)).status).toBe('cached');
    });
    it('reserva custo antes do fetch e usa endpoint/modelo/idiomas fixos', async () => {
        const result = await translatePublicFields(input);
        expect(result).toEqual({
            fields: { title: 'Hello world' },
            translated: true,
            status: 'translated',
        });
        expect(mocks.reserve).toHaveBeenCalledWith(9, 50000);
        expect(mocks.token).toHaveBeenCalledWith([
            'https://www.googleapis.com/auth/cloud-translation',
        ]);
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe(
            'https://translation.googleapis.com/v3/projects/spm-test-123/locations/global:translateText',
        );
        expect(JSON.parse(options.body)).toEqual({
            contents: ['Olá mundo'],
            mimeType: 'text/plain',
            sourceLanguageCode: 'pt',
            targetLanguageCode: 'en',
            model: 'projects/spm-test-123/locations/global/models/general/nmt',
        });
        expect(options).toMatchObject({ redirect: 'error', cache: 'no-store' });
        expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(
            fetchMock.mock.invocationCallOrder[0],
        );
        expect(mocks.complete).toHaveBeenCalledWith('cache-id', 'lease-token', {
            title: 'Hello world',
        });
    });
    it('limite diário falha fechado e não chama Google', async () => {
        mocks.reserve.mockResolvedValue(false);
        expect((await translatePublicFields(input)).status).toBe('budget_exceeded');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.release).toHaveBeenCalledWith('cache-id', 'lease-token', 300);
    });
    it('orçamento zero atende cache, mas não tenta lease, token ou rede em miss', async () => {
        vi.stubEnv('TRANSLATION_DAILY_CHARACTER_LIMIT', '0');
        expect((await translatePublicFields(input)).status).toBe('budget_exceeded');
        expect(mocks.claim).not.toHaveBeenCalled();
        expect(mocks.token).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
        mocks.read.mockResolvedValue({ title: 'Cached while offline' });
        expect((await translatePublicFields(input)).status).toBe('cached');
    });
    it('sem credenciais mantém português e não reserva caracteres', async () => {
        mocks.token.mockResolvedValue(null);
        expect((await translatePublicFields(input)).status).toBe('unavailable');
        expect(mocks.reserve).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it.each([403, 429, 500])(
        'erro %i não apaga o original nem grava tradução parcial',
        async (status) => {
            fetchMock.mockResolvedValue(new Response('upstream-error', { status }));
            expect(await translatePublicFields(input)).toEqual({
                fields: input.fields,
                translated: false,
                status: 'unavailable',
            });
            expect(mocks.complete).not.toHaveBeenCalled();
            expect(mocks.reserve).toHaveBeenCalledTimes(1);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(mocks.release).toHaveBeenCalledWith('cache-id', 'lease-token', 60);
        },
    );
    it.each([
        {},
        { translations: [] },
        { translations: [{ translatedText: '' }] },
        { translations: [{ translatedText: 'a'.repeat(513) }] },
        { translations: [{ translatedText: 'bad\u0000text' }] },
    ])('rejeita resposta inválida %j', async (response) => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify(response)));
        expect((await translatePublicFields(input)).status).toBe('unavailable');
        expect(mocks.complete).not.toHaveBeenCalled();
    });
    it('falha de rede aplica backoff exponencial sem vazar fonte no log', async () => {
        mocks.claim.mockResolvedValue({ token: 'lease-token', attempts: 5 });
        fetchMock.mockRejectedValue(new Error('provider may contain sensitive text'));
        expect((await translatePublicFields(input)).status).toBe('unavailable');
        expect(mocks.release).toHaveBeenCalledWith('cache-id', 'lease-token', 960);
    });
    it('recusa tradução concluída por lease perdido', async () => {
        mocks.complete.mockResolvedValue(false);
        expect((await translatePublicFields(input)).status).toBe('pending');
    });
    it('banco indisponível falha fechado, sem Google', async () => {
        mocks.read.mockRejectedValue(new Error('DB unavailable'));
        expect((await translatePublicFields(input)).status).toBe('unavailable');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('idioma e chave manipulados não alcançam banco/provedor', async () => {
        expect(
            (await translatePublicFields({ ...input, key: 'https://bad.invalid?url=x' })).status,
        ).toBe('invalid');
        expect((await translatePublicFields({ ...input, locale: 'de' as 'en' })).status).toBe(
            'invalid',
        );
        expect(mocks.read).not.toHaveBeenCalled();
    });
    it('fonte acima do limite não alcança banco/provedor', async () => {
        expect(
            (await translatePublicFields({ ...input, fields: { content: 'a'.repeat(100001) } }))
                .status,
        ).toBe('invalid');
        expect(mocks.read).not.toHaveBeenCalled();
    });
    it('fonte vazia não cria cache ou reserva faturável', async () => {
        expect((await translatePublicFields({ ...input, fields: { title: '   ' } })).status).toBe(
            'source',
        );
        expect(mocks.read).not.toHaveBeenCalled();
    });
    it('resposta excessiva falha antes de interpretar JSON', async () => {
        fetchMock.mockResolvedValue(
            new Response('{}', { headers: { 'content-length': '1048577' } }),
        );
        expect((await translatePublicFields(input)).status).toBe('unavailable');
        expect(mocks.complete).not.toHaveBeenCalled();
    });
    it('falha no segundo lote não grava tradução parcial', async () => {
        const manyFields = Object.fromEntries(
            Array.from({ length: 6 }, (_, i) => [`text${i}`, 'a'.repeat(4000)]),
        );
        fetchMock
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        translations: Array.from({ length: 5 }, () => ({
                            translatedText: 'Translated',
                        })),
                    }),
                ),
            )
            .mockResolvedValueOnce(new Response('failure', { status: 500 }));
        expect(await translatePublicFields({ ...input, fields: manyFields })).toEqual({
            fields: manyFields,
            translated: false,
            status: 'unavailable',
        });
        expect(mocks.reserve).toHaveBeenCalledWith(24000, 50000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(mocks.complete).not.toHaveBeenCalled();
    });
});
