import type { Metadata } from 'next';
import PageContent from './PageContent';

export const metadata: Metadata = { title: 'Como Ajudar' };

export default function Page() {
    return <PageContent />;
}
