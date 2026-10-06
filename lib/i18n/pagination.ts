export const PUBLIC_PAGE_SIZE = 12;
export function publicPageNumber(value: unknown): number {
    return typeof value === 'string' && /^[1-9]\d{0,4}$/.test(value) ? Number(value) : 1;
}
export function publicCategory(value: unknown): string | undefined {
    return typeof value === 'string' &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
        value.length <= 100
        ? value
        : undefined;
}
