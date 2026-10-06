import { headers } from 'next/headers';
import { serializeJsonLd } from '@/lib/structured-data';

export default async function StructuredData({ data }: { data: Record<string, unknown> }) {
    const nonce = (await headers()).get('x-nonce') ?? undefined;
    return (
        <script
            type="application/ld+json"
            nonce={nonce}
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
        />
    );
}
