import { pageMetadata } from '@/lib/seo';
import PublicTranslation from '@/components/PublicTranslation';
import PageContent from './PageContent';

export const metadata = pageMetadata('/quem-somos');

export default function Page() {
    return <PublicTranslation pageKey="quem-somos">{<PageContent />}</PublicTranslation>;
}
