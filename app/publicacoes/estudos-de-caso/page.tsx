import Link from '@/components/LocalizedLink';
import PageHero from '@/components/PageHero';
import PublicTranslation from '@/components/PublicTranslation';
import { CASE_STUDIES, publishedCaseStudies } from '@/lib/content/case-studies';
import { contentMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata() {
    return {
        ...contentMetadata(
            '/publicacoes/estudos-de-caso',
            'Estudos de caso',
            'Conheça estudos de caso publicados pelo Serviço Pastoral dos Migrantes, com contexto, ações, resultados e fontes.',
        ),
        ...(publishedCaseStudies(CASE_STUDIES).length === 0
            ? { robots: { index: false, follow: true } }
            : {}),
    };
}

export default function CaseStudiesPage() {
    const cases = publishedCaseStudies(CASE_STUDIES);
    return (
        <PublicTranslation pageKey="publicacoes/estudos-de-caso">
            <PageHero
                title="Estudos de caso"
                subtitle="Ações da rede, com contexto, resultados e fontes para consulta."
                crumbs={[
                    { label: 'Publicações', link: '/publicacoes' },
                    { label: 'Estudos de caso' },
                ]}
            />
            <section className="section">
                <div className="container">
                    {cases.length === 0 ? (
                        <div className="empty-state">
                            <h2>Nenhum estudo de caso publicado no momento</h2>
                            <p>
                                Você pode conhecer as frentes de atuação do SPM e acompanhar as
                                notícias da rede.
                            </p>
                            <Link className="btn btn--cta" href="/o-que-fazemos">
                                Conhecer nossa atuação
                            </Link>{' '}
                            <Link className="btn btn--outline" href="/publicacoes/blog">
                                Ler notícias
                            </Link>
                        </div>
                    ) : (
                        cases.map((item) => (
                            <article className="prose" key={item.slug} id={item.slug}>
                                <h2>{item.title}</h2>
                                <h3>Contexto</h3>
                                <p>{item.context}</p>
                                <h3>Ações realizadas</h3>
                                <p>{item.actions}</p>
                                <h3>Resultados relatados</h3>
                                <p>{item.outcomes}</p>
                                <p>
                                    Fonte:{' '}
                                    <a
                                        href={item.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {item.sourceLabel}
                                        <span className="sr-only"> (abre em nova aba)</span>
                                    </a>
                                </p>
                            </article>
                        ))
                    )}
                    <p className="text-center">
                        Quer conversar sobre uma ação da sua comunidade?{' '}
                        <Link href="/fale-conosco">Fale com a equipe</Link>.
                    </p>
                </div>
            </section>
        </PublicTranslation>
    );
}
