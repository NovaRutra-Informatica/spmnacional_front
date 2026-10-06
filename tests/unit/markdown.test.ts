import { describe, expect, it } from 'vitest';
import { excerptFromMarkdown, readingMinutes, renderMarkdown } from '../../lib/markdown';

describe('conteúdo editorial seguro', () => {
    it('escapa HTML e preserva formatação editorial', () => {
        expect(renderMarkdown('<script>alert(1)</script>')).toBe(
            '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
        );
        expect(
            renderMarkdown('## Título\n\n**forte** e *ênfase*\n\n- um\n- dois\n\n> citação'),
        ).toContain('<strong>forte</strong>');
    });
    it.each(['javascript:alert', 'data:text/html,test', '//evil.example', '/\\evil.example'])(
        'recusa href %s',
        (href) => {
            expect(renderMarkdown(`[texto](${href})`)).not.toContain('<a ');
        },
    );
    it('escapa URL uma só vez e não formata markdown dentro do atributo', () => {
        expect(renderMarkdown('[ler](https://example.org?q=1&next=2)')).toContain(
            'href="https://example.org?q=1&amp;next=2"',
        );
        expect(renderMarkdown('[**ler**](/pagina?q=**text**)')).toBe(
            '<p><a href="/pagina?q=**text**"><strong>ler</strong></a></p>',
        );
        expect(renderMarkdown('[ler](https://example.org/"onclick="x)')).not.toContain(
            '"onclick="',
        );
    });
    it('renderiza blocos e metadados sem HTML', () => {
        expect(renderMarkdown('')).toBe('');
        expect(renderMarkdown('### Sub\n\n1. Um\n2. Dois\n\n---\n\nA\nB')).toBe(
            '<h4>Sub</h4>\n<ol><li>Um</li><li>Dois</li></ol>\n<hr />\n<p>A<br />B</p>',
        );
        expect(excerptFromMarkdown('## Olá **mundo** [link](/a)')).toBe('Olá mundo link');
        expect(excerptFromMarkdown('um texto com muitas palavras', 10)).toMatch(/…$/);
        expect(readingMinutes('')).toBe(1);
        expect(readingMinutes('palavra '.repeat(400))).toBe(2);
    });
});
