import { cloneElement, isValidElement, type ReactNode } from 'react';

/** Only presentation fields are translated; never URLs, IDs, form values or callbacks. */
const textProps = new Set([
    'title',
    'subtitle',
    'eyebrow',
    'text',
    'description',
    'excerpt',
    'label',
    'desc',
    'category',
    'primaryLabel',
    'secondaryLabel',
    'alt',
    'placeholder',
    'aria-label',
]);
const dataProps = new Set([
    'crumbs',
    'posts',
    'featured',
    'categories',
    'events',
    'documentos',
    'editais',
    'regionais',
    'edicoes',
    'testemunhos',
    'slides',
]);
const excludedTags = new Set(['script', 'style', 'code', 'pre', 'textarea']);

export function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function isTranslatableText(value: string): boolean {
    const text = normalizeText(value);
    return (
        text.length > 1 &&
        /\p{L}/u.test(text) &&
        !/^(https?:|mailto:|tel:|\/|#)/i.test(text) &&
        !/^[^\s@]+@[^\s@]+$/.test(text)
    );
}

export function mapPublicTree(node: ReactNode, translate: (value: string) => string): ReactNode {
    const text = (value: string) => {
        if (!isTranslatableText(value)) return value;
        const normalized = normalizeText(value);
        const translated = translate(normalized);
        return translated === normalized
            ? value
            : `${/^\s/.test(value) ? ' ' : ''}${translated}${/\s$/.test(value) ? ' ' : ''}`;
    };
    const data = (value: unknown, key = ''): unknown => {
        if (typeof value === 'string')
            return (textProps.has(key) || key === 'categories') && !/^[A-Z0-9_]+$/.test(value)
                ? text(value)
                : value;
        if (Array.isArray(value)) return value.map((entry) => data(entry, key));
        if (
            value &&
            typeof value === 'object' &&
            Object.getPrototypeOf(value) === Object.prototype
        ) {
            return Object.fromEntries(
                Object.entries(value).map(([field, entry]) => [
                    field,
                    key === 'categories' && field === 'name' && typeof entry === 'string'
                        ? text(entry)
                        : data(entry, field),
                ]),
            );
        }
        return value;
    };
    const visit = (value: ReactNode): ReactNode => {
        if (typeof value === 'string') return text(value);
        if (Array.isArray(value)) return value.map(visit);
        if (!isValidElement<Record<string, unknown>>(value)) return value;
        if (
            (typeof value.type === 'string' && excludedTags.has(value.type)) ||
            value.props.translate === 'no' ||
            value.props['data-no-translation']
        )
            return value;
        const props: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value.props)) {
            if (key === 'children') props.children = visit(entry as ReactNode);
            else if (textProps.has(key) && typeof entry === 'string') props[key] = text(entry);
            else if (dataProps.has(key)) props[key] = data(entry, key);
        }
        return cloneElement(value, props);
    };
    return visit(node);
}

export function collectPublicText(node: ReactNode): string[] {
    const texts = new Set<string>();
    mapPublicTree(node, (text) => {
        texts.add(text);
        return text;
    });
    return [...texts];
}
