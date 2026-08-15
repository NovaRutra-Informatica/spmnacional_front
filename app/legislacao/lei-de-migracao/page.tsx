import type { Metadata } from 'next';
import PageContent from './PageContent';

export const metadata: Metadata = { title: 'Lei nº 13.445/2017 — Lei de Migração' };

export default function Page() {
    return <PageContent />;
}
