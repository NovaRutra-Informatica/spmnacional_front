/** Conteúdo editorial: publicar exige fonte, autorização e data já alcançada. */
export interface CaseStudy {
    slug: string;
    title: string;
    context: string;
    actions: string;
    outcomes: string;
    sourceUrl: string;
    sourceLabel: string;
    authorizationConfirmed: boolean;
    published: boolean;
    publishedAt: string;
}

// A equipe ainda não forneceu casos autorizados. Nenhum exemplo vai para o site.
export const CASE_STUDIES: readonly CaseStudy[] = [];

export function publishedCaseStudies(cases: readonly CaseStudy[], now = new Date()): CaseStudy[] {
    return cases.filter((item) => {
        if (!item.authorizationConfirmed || !item.published) return false;
        if (
            ![
                item.slug,
                item.title,
                item.context,
                item.actions,
                item.outcomes,
                item.sourceLabel,
            ].every((value) => value.trim())
        )
            return false;
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) return false;
        const publishedAt = new Date(item.publishedAt);
        if (!Number.isFinite(publishedAt.getTime()) || publishedAt > now) return false;
        try {
            const source = new URL(item.sourceUrl);
            return source.protocol === 'https:' && !source.username && !source.password;
        } catch {
            return false;
        }
    });
}
