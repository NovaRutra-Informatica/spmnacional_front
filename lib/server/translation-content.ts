import 'server-only';
import { createHash } from 'node:crypto';

export type TranslationFormat = 'text' | 'markdown';
export const MAX_SOURCE_CHARACTERS = 100_000;
const MAX_SEGMENTS = 2048;
const CHUNK_CHARACTERS = 4000;
type Part = { literal: string } | { segment: number };

export interface PreparedTranslation {
    sourceHash: string;
    segments: string[];
    characters: number;
    restore: (translated: string[]) => Record<string, string>;
}

/**
 * Só traduz texto puro. Marcadores do Markdown reduzido e destinos de links
 * não passam pelo provedor. Nunca retornar HTML para dangerouslySetInnerHTML:
 * o consumidor continua usando React/ renderMarkdown, que escapam o conteúdo.
 */
export function prepareTranslation(
    fields: Record<string, string>,
    format: TranslationFormat,
): PreparedTranslation {
    const keys = Object.keys(fields).sort();
    if (
        !['text', 'markdown'].includes(format) ||
        keys.length < 1 ||
        keys.length > 512 ||
        keys.some((key) => !/^[a-zA-Z][a-zA-Z0-9_.-]{0,95}$/.test(key)) ||
        keys.some((key) => typeof fields[key] !== 'string' || fields[key].length > 200_000) ||
        keys.reduce((sum, key) => sum + Array.from(fields[key]).length, 0) > MAX_SOURCE_CHARACTERS
    ) {
        throw new Error('Translation source exceeds allowed limits');
    }
    const segments: string[] = [];
    const templates: Record<string, Part[]> = {};
    const text = (parts: Part[], value: string) => {
        // Não cobra espaços nem permite ao tradutor apagar a estrutura das linhas.
        const whitespace = value.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
        if (whitespace[1]) parts.push({ literal: whitespace[1] });
        const points = Array.from(whitespace[2]);
        while (points.length) {
            let size = Math.min(CHUNK_CHARACTERS, points.length);
            if (size < points.length) {
                for (let offset = size - 1; offset > size / 2; offset--) {
                    if (/\s/.test(points[offset])) {
                        size = offset + 1;
                        break;
                    }
                }
            }
            const chunk = points.splice(0, size).join('');
            const chunkWhitespace = chunk.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
            if (chunkWhitespace[1]) parts.push({ literal: chunkWhitespace[1] });
            if (chunkWhitespace[2]) {
                parts.push({ segment: segments.length });
                segments.push(chunkWhitespace[2]);
            }
            if (chunkWhitespace[3]) parts.push({ literal: chunkWhitespace[3] });
        }
        if (whitespace[3]) parts.push({ literal: whitespace[3] });
    };
    for (const key of keys) {
        const parts: Part[] = [];
        templates[key] = parts;
        if (format === 'text') {
            text(parts, fields[key]);
            continue;
        }
        const lines = fields[key].split(/(\r?\n)/);
        for (const line of lines) {
            if (/^(?:\r?\n|\s*|-{3,})$/.test(line)) {
                parts.push({ literal: line });
                continue;
            }
            const prefix = line.match(/^(?:#{1,6}\s+|>\s?|[-*]\s+|\d+\.\s+)/)?.[0] ?? '';
            if (prefix) parts.push({ literal: prefix });
            const body = line.slice(prefix.length);
            const tokens = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*|\*/g;
            let offset = 0;
            for (const match of body.matchAll(tokens)) {
                text(parts, body.slice(offset, match.index));
                if (match[1] !== undefined) {
                    parts.push({ literal: '[' });
                    text(parts, match[1]);
                    parts.push({ literal: `](${match[2]})` });
                } else parts.push({ literal: match[0] });
                offset = match.index + match[0].length;
            }
            text(parts, body.slice(offset));
        }
    }
    if (segments.length > MAX_SEGMENTS) throw new Error('Too many translation segments');
    return {
        sourceHash: createHash('sha256')
            .update(JSON.stringify(['nmt-v1', format, keys.map((key) => [key, fields[key]])]))
            .digest('hex'),
        segments,
        characters: segments.reduce((sum, segment) => sum + Array.from(segment).length, 0),
        restore(translated) {
            if (
                translated.length !== segments.length ||
                translated.some((value) => typeof value !== 'string' || !value.trim())
            )
                throw new Error('Incomplete translation response');
            return Object.fromEntries(
                keys.map((key) => [
                    key,
                    templates[key]
                        .map((part) => {
                            if ('literal' in part) return part.literal;
                            const value = translated[part.segment];
                            // O provedor não pode criar links nem comandos de Markdown novos.
                            return format === 'markdown'
                                ? value
                                      .replace(/[\r\n]+/g, ' ')
                                      .replaceAll('[', '［')
                                      .replaceAll(']', '］')
                                      .replaceAll('*', '＊')
                                : value;
                        })
                        .join(''),
                ]),
            );
        },
    };
}

/** A API conta pontos de código, não bytes nem unidades UTF-16. */
export function translationBatches(segments: string[]): string[][] {
    const batches: string[][] = [];
    let current: string[] = [];
    let characters = 0;
    for (const segment of segments) {
        const size = Array.from(segment).length;
        if (current.length && (characters + size > 20_000 || current.length >= 128)) {
            batches.push(current);
            current = [];
            characters = 0;
        }
        current.push(segment);
        characters += size;
    }
    if (current.length) batches.push(current);
    return batches;
}
