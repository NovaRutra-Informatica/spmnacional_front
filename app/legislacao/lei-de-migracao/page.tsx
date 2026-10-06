import { pageMetadata } from '@/lib/seo';
import PublicTranslation from '@/components/PublicTranslation';
import PageContent from './PageContent';

export const metadata = pageMetadata('/legislacao/lei-de-migracao');

export default function Page() {
    return (
        <PublicTranslation pageKey="legislacao/lei-de-migracao">
            {<PageContent />}
        </PublicTranslation>
    );
}
