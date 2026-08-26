import type { Metadata } from 'next';
import { listRegionais } from '@/lib/server/queries';
import PageContent, { type RegionalItem } from './PageContent';

// A página lê as unidades do Postgres — o build do Docker roda sem banco.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Onde estamos' };

export default async function Page() {
    const regionais = await listRegionais();

    // Só os campos que a tela usa: nada de createdAt/updatedAt cru no cliente.
    const items: RegionalItem[] = regionais.map((regional) => ({
        id: regional.id,
        uf: regional.uf,
        name: regional.name,
        region: regional.region,
        description: regional.description,
        focus: regional.focus,
        address: regional.address,
        city: regional.city,
        phone: regional.phone,
        email: regional.email,
    }));

    // Números da faixa calculados sobre o que está publicado, não fixos no código.
    const stats = {
        unidades: items.length,
        ufs: new Set(items.map((item) => item.uf)).size,
        regioes: new Set(items.map((item) => item.region)).size,
    };

    return <PageContent regionais={items} stats={stats} />;
}
