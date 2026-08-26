import type { Metadata } from 'next';
import PageContent from './PageContent';

export const metadata: Metadata = {
    title: 'Fale Conosco',
    description:
        'Fale com o Serviço Pastoral dos Migrantes: orientação migratória, denúncias, voluntariado, doações e imprensa. Atendimento gratuito e sigiloso.',
};

export default function Page() {
    return <PageContent />;
}
