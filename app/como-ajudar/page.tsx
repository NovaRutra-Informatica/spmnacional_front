import { pageMetadata } from '@/lib/seo';
import PublicTranslation from '@/components/PublicTranslation';
import PageContent from './PageContent';

export const metadata = pageMetadata('/como-ajudar');

export default function Page() {
    return <PublicTranslation pageKey="como-ajudar">{<PageContent />}</PublicTranslation>;
}
