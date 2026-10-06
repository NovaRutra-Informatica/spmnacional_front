import { renderMarkdown } from '@/lib/markdown';
import { getPublicLocale } from '@/lib/server/public-locale';
import { translatePublicFields } from '@/lib/server/translation';
import TranslationNotice from './TranslationNotice';

export default async function TranslatedMarkdown({
    content,
    contentKey,
}: {
    content: string;
    contentKey: string;
}) {
    const locale = await getPublicLocale();
    const result = await translatePublicFields({
        key: `markdown:${contentKey}`,
        locale,
        fields: { content },
        format: 'markdown',
    });
    return (
        <div
            translate="no"
            lang={result.translated ? `${locale}-x-mtfrom-pt` : 'pt-BR'}
            dir={result.translated && locale === 'ar' ? 'rtl' : 'ltr'}
        >
            <TranslationNotice locale={locale} translated={result.translated} />
            {/* The provider result is untrusted: the same safe Markdown renderer is always applied. */}
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(result.fields.content) }} />
        </div>
    );
}
