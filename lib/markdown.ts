/**
 * Renderizador de Markdown reduzido, sem dependência externa.
 *
 * Suporta o que a redação do SPM realmente usa: parágrafos, subtítulos,
 * listas, citação, negrito, itálico e link. O texto é escapado ANTES de
 * qualquer formatação, então nem um editor comprometido consegue injetar
 * HTML na página pública.
 */

const ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Só http(s) e mailto viram link; qualquer outro esquema fica como texto. */
function safeHref(href: string): string | null {
    const trimmed = href.trim();
    if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed) || trimmed.startsWith('/')) {
        return escapeHtml(trimmed);
    }
    return null;
}

function inline(text: string): string {
    let output = escapeHtml(text);

    // [texto](destino)
    output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
        const safe = safeHref(href);
        return safe ? `<a href="${safe}">${label}</a>` : label;
    });

    output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

    return output;
}

export function renderMarkdown(source: string): string {
    if (!source?.trim()) return '';

    const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/);
    const html: string[] = [];

    for (const rawBlock of blocks) {
        const block = rawBlock.trim();
        if (!block) continue;

        // Subtítulos
        if (block.startsWith('### ')) {
            html.push(`<h4>${inline(block.slice(4))}</h4>`);
            continue;
        }
        if (block.startsWith('## ')) {
            html.push(`<h3>${inline(block.slice(3))}</h3>`);
            continue;
        }

        // Citação
        if (block.startsWith('> ')) {
            const quote = block
                .split('\n')
                .map((line) => line.replace(/^>\s?/, ''))
                .join(' ');
            html.push(`<blockquote>${inline(quote)}</blockquote>`);
            continue;
        }

        // Lista não ordenada
        if (/^[-*]\s/.test(block)) {
            const items = block
                .split('\n')
                .filter((line) => /^[-*]\s/.test(line.trim()))
                .map((line) => `<li>${inline(line.trim().replace(/^[-*]\s+/, ''))}</li>`)
                .join('');
            html.push(`<ul>${items}</ul>`);
            continue;
        }

        // Lista ordenada
        if (/^\d+\.\s/.test(block)) {
            const items = block
                .split('\n')
                .filter((line) => /^\d+\.\s/.test(line.trim()))
                .map((line) => `<li>${inline(line.trim().replace(/^\d+\.\s+/, ''))}</li>`)
                .join('');
            html.push(`<ol>${items}</ol>`);
            continue;
        }

        // Separador
        if (/^-{3,}$/.test(block)) {
            html.push('<hr />');
            continue;
        }

        html.push(`<p>${inline(block).replace(/\n/g, '<br />')}</p>`);
    }

    return html.join('\n');
}

/** Resumo em texto puro, para meta description e prévia no painel. */
export function excerptFromMarkdown(source: string, maxLength = 200): string {
    const plain = source
        .replace(/\r\n/g, '\n')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^[-*]\s+/gm, '')
        .replace(/^>\s?/gm, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (plain.length <= maxLength) return plain;
    return `${plain.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}

/** Tempo de leitura aproximado, em minutos. */
export function readingMinutes(source: string): number {
    const words = source.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
}
