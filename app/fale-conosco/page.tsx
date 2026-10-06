import { pageMetadata } from '@/lib/seo';
import StructuredData from '@/components/StructuredData';
import { CONTACT_FAQS } from '@/lib/content/contact';
import PublicTranslation from '@/components/PublicTranslation';
import PageContent from './PageContent';

export const metadata = pageMetadata('/fale-conosco');

export default function Page() {
    return (
        <>
            <StructuredData
                data={{
                    '@context': 'https://schema.org',
                    '@type': 'FAQPage',
                    mainEntity: CONTACT_FAQS.map((faq) => ({
                        '@type': 'Question',
                        name: faq.question,
                        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
                    })),
                }}
            />
            <PublicTranslation pageKey="fale-conosco">{<PageContent />}</PublicTranslation>
        </>
    );
}
