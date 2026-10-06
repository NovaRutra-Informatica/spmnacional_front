export interface TranslationConfig {
    enabled: boolean;
    project: string;
    location: string;
    dailyCharacterLimit: number;
}

/** Sem configuração explícita nenhuma chamada faturável é feita. */
export function readTranslationConfig(
    values: Record<string, string | undefined>,
): TranslationConfig {
    const enabled = values.TRANSLATION_ENABLED === 'true';
    const project = values.GOOGLE_CLOUD_PROJECT?.trim() ?? '';
    const location = values.TRANSLATION_LOCATION?.trim() || 'global';
    const rawLimit = values.TRANSLATION_DAILY_CHARACTER_LIMIT?.trim() || '50000';
    const dailyCharacterLimit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : NaN;
    if (
        (values.TRANSLATION_ENABLED && !['true', 'false'].includes(values.TRANSLATION_ENABLED)) ||
        (enabled && !/^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]{6,20})$/.test(project)) ||
        !/^(?:global|[a-z]+(?:-[a-z]+)+[0-9])$/.test(location) ||
        !Number.isSafeInteger(dailyCharacterLimit) ||
        dailyCharacterLimit < 0 ||
        dailyCharacterLimit > 10_000_000
    ) {
        throw new Error('Invalid Cloud Translation configuration');
    }
    return { enabled, project, location, dailyCharacterLimit };
}
