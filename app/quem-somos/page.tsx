import type { Metadata } from 'next';
import PageContent from './PageContent';

export const metadata: Metadata = {
    title: 'Quem Somos',
};

export default function Page() {
    return <PageContent />;
}
