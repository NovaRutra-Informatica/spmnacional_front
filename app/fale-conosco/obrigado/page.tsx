import type { Metadata } from 'next';
import Link from '@/components/LocalizedLink';
import PageHero from '@/components/PageHero';
import PublicTranslation from '@/components/PublicTranslation';
import { CONTACT_RESPONSE_MESSAGE } from '@/lib/content/contact';

export const metadata: Metadata = {
    title: 'Mensagem recebida',
    description: 'Confirmação do envio de contato ao Serviço Pastoral dos Migrantes.',
    robots: { index: false, follow: false },
};

export default function ContactThankYou() {
    return (
        <PublicTranslation pageKey="fale-conosco/obrigado">
            <PageHero
                eyebrow="Contato"
                title="Obrigado pelo contato"
                subtitle={CONTACT_RESPONSE_MESSAGE}
                crumbs={[
                    { label: 'Fale conosco', link: '/fale-conosco' },
                    { label: 'Confirmação' },
                ]}
            />
            <section className="section">
                <div className="container">
                    <div className="prose">
                        <h2>Sua mensagem foi recebida</h2>
                        <p>
                            A equipe do secretariado nacional dará continuidade ao contato. Enquanto
                            isso, você pode conhecer as equipes regionais ou acompanhar nossas
                            publicações.
                        </p>
                        <div className="hero-slide__actions">
                            <Link className="btn btn--cta" href="/onde-estamos">
                                Encontrar uma equipe
                            </Link>
                            <Link className="btn btn--outline" href="/publicacoes/blog">
                                Ler publicações
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </PublicTranslation>
    );
}
