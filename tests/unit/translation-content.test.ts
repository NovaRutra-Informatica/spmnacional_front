import { describe, expect, it } from 'vitest';
import { isPublicLocale, localeDirection, normalizePublicLocale } from '../../lib/i18n/config';
import { readTranslationConfig } from '../../lib/i18n/translation-config';
import { prepareTranslation, translationBatches } from '../../lib/server/translation-content';
import { renderMarkdown } from '../../lib/markdown';

describe('idiomas e configuração conservadora de tradução', () => {
    it('limita idiomas ao escopo e usa árabe RTL', () => {
        expect(isPublicLocale('ar')).toBe(true);
        expect(isPublicLocale('de')).toBe(false);
        expect(normalizePublicLocale('en-US')).toBe('pt');
        expect(localeDirection('ar')).toBe('rtl');
        expect(localeDirection('fr')).toBe('ltr');
    });
    it('fica desligado por padrão e limita caracteres por dia', () => {
        expect(readTranslationConfig({})).toEqual({
            enabled: false,
            project: '',
            location: 'global',
            dailyCharacterLimit: 50000,
        });
        expect(
            readTranslationConfig({
                TRANSLATION_ENABLED: 'true',
                GOOGLE_CLOUD_PROJECT: 'spm-test-123',
                TRANSLATION_DAILY_CHARACTER_LIMIT: '0',
            }).dailyCharacterLimit,
        ).toBe(0);
    });
    it.each([
        { TRANSLATION_ENABLED: 'yes' },
        { TRANSLATION_ENABLED: 'true' },
        { TRANSLATION_ENABLED: 'true', GOOGLE_CLOUD_PROJECT: 'https://evil.invalid' },
        { TRANSLATION_LOCATION: 'global/../anything' },
        { TRANSLATION_DAILY_CHARACTER_LIMIT: '-1' },
        { TRANSLATION_DAILY_CHARACTER_LIMIT: 'Infinity' },
        { TRANSLATION_DAILY_CHARACTER_LIMIT: '10000001' },
    ])('rejeita configuração inválida %j', (config) =>
        expect(() => readTranslationConfig(config)).toThrow(),
    );
});

describe('segmentação da tradução sem HTML remoto', () => {
    it('ordena campos no hash e invalida quando a fonte ou formato mudam', () => {
        const first = prepareTranslation({ title: 'Olá', text: 'Tudo bem?' }, 'text');
        expect(prepareTranslation({ text: 'Tudo bem?', title: 'Olá' }, 'text').sourceHash).toBe(
            first.sourceHash,
        );
        expect(
            prepareTranslation({ title: 'Olá!', text: 'Tudo bem?' }, 'text').sourceHash,
        ).not.toBe(first.sourceHash);
        expect(
            prepareTranslation({ title: 'Olá', text: 'Tudo bem?' }, 'markdown').sourceHash,
        ).not.toBe(first.sourceHash);
        expect(first.restore(first.segments)).toEqual({ title: 'Olá', text: 'Tudo bem?' });
    });
    it('preserva estrutura Markdown e não envia destinos de links ao provedor', () => {
        const content =
            '## Título\n\n> Citação\n\n- **Primeiro** item\n- [Leia aqui](https://example.test/fonte)\n\n---\n\n1. Final';
        const prepared = prepareTranslation({ content }, 'markdown');
        expect(prepared.segments.join('|')).not.toContain('https://');
        expect(prepared.restore(prepared.segments).content).toBe(content);
        const translated = prepared.restore(
            prepared.segments.map((value) => value.toUpperCase()),
        ).content;
        expect(translated).toContain('## TÍTULO');
        expect(translated).toContain('[LEIA AQUI](https://example.test/fonte)');
        expect(translated).toContain('**PRIMEIRO**');
    });
    it('não permite criar links ou HTML executável a partir da resposta de tradução', () => {
        const prepared = prepareTranslation({ content: 'Texto' }, 'markdown');
        const translated = prepared.restore([
            '[clique](javascript:alert) <script>alert(1)</script>',
        ]).content;
        const html = renderMarkdown(translated);
        expect(html).not.toContain('<a ');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });
    it('mantém separação de palavras em chunks longos e unicode intacto', () => {
        const content = `${'olá 😀 '.repeat(1000)}final`;
        const prepared = prepareTranslation({ content }, 'text');
        expect(prepared.segments.length).toBeGreaterThan(1);
        expect(prepared.segments.every((value) => Array.from(value).length <= 4000)).toBe(true);
        expect(prepared.restore(prepared.segments).content).toBe(content);
        expect(prepared.segments.join('')).not.toContain('\uFFFD');
    });
    it('não traduz conteúdo vazio e nunca aceita resposta vazia ou parcial', () => {
        const prepared = prepareTranslation({ empty: '', spaces: '  ', title: 'Título' }, 'text');
        expect(prepared.segments).toEqual(['Título']);
        expect(() => prepared.restore([])).toThrow();
        expect(() => prepared.restore([''])).toThrow();
        expect(prepared.restore(['Title'])).toEqual({ empty: '', spaces: '  ', title: 'Title' });
    });
    it('recusa quantidade ou tamanho de fonte excessivo e nomes de campo não seguros', () => {
        expect(() => prepareTranslation({ content: 'a'.repeat(100001) }, 'text')).toThrow();
        expect(() =>
            prepareTranslation(
                Object.fromEntries(Array.from({ length: 513 }, (_, i) => [`field${i}`, 'a'])),
                'text',
            ),
        ).toThrow();
        expect(() => prepareTranslation({ '__proto__.x': 'a' }, 'text')).toThrow();
    });
    it('limita lotes a 20 mil codepoints e 128 segmentos', () => {
        const batches = translationBatches(Array.from({ length: 140 }, () => '😀'.repeat(200)));
        expect(batches).toHaveLength(2);
        expect(
            batches.every(
                (batch) =>
                    batch.length <= 128 &&
                    batch.reduce((sum, value) => sum + Array.from(value).length, 0) <= 20000,
            ),
        ).toBe(true);
    });
});
