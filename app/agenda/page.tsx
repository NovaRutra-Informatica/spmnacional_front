import type { Metadata } from 'next';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageCta from '@/components/PageCta';
import PageHero from '@/components/PageHero';
import { formatDateLong } from '@/lib/labels';
import { listAgendaEvents } from '@/lib/server/queries';

// A agenda é lida do Postgres a cada visita — nada de prerender no build.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Agenda',
    description:
        'Datas nacionais do Serviço Pastoral dos Migrantes: Semana do Migrante, Dia do Migrante, encontros e formações.',
};

/**
 * Rótulo de período. Eventos de um dia só mostram uma data; os que se
 * estendem por vários dias mostram início e fim.
 */
function periodLabel(startsAt: Date, endsAt: Date): string {
    const inicio = formatDateLong(startsAt);
    const fim = formatDateLong(endsAt);
    return inicio === fim ? inicio : `${inicio} a ${fim}`;
}

export default async function Page() {
    const [proximos, realizados] = await Promise.all([
        listAgendaEvents(),
        listAgendaEvents({ past: true, take: 6 }),
    ]);

    return (
        <>
            <PageHero
                eyebrow="Calendário"
                title="Agenda"
                subtitle="As datas que organizam o ano do SPM: a Semana do Migrante, o Dia do Migrante, encontros nacionais, formações e celebrações."
                crumbs={[{ label: 'Agenda' }]}
            />

            <section className="section">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Próximos compromissos</span>
                        <h2>O que vem pela frente</h2>
                        <p>
                            Datas confirmadas pelo secretariado nacional. As equipes regionais
                            organizam, além destas, a própria programação local.
                        </p>
                    </Animate>

                    {proximos.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-calendar-day"></i>
                            <h3>Nenhum compromisso agendado no momento</h3>
                            <p>
                                Assim que a Coordenação Nacional confirmar as próximas datas, elas
                                aparecem aqui. Acompanhe também o{' '}
                                <Link href="/publicacoes/blog">blog</Link>.
                            </p>
                        </div>
                    ) : (
                        <Animate as="ul" className="timeline">
                            {proximos.map((evento) => (
                                <li className="timeline__item" key={evento.id}>
                                    <span className="timeline__year">
                                        {periodLabel(evento.startsAt, evento.endsAt)}
                                    </span>
                                    <h3>{evento.title}</h3>
                                    {evento.description && <p>{evento.description}</p>}
                                    {evento.location && (
                                        <p style={{ marginTop: '0.5rem' }}>
                                            <i className="fas fa-location-dot"></i>{' '}
                                            {evento.location}
                                        </p>
                                    )}
                                    {evento.url && (
                                        <p style={{ marginTop: '0.5rem' }}>
                                            <a
                                                href={evento.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                Mais informações{' '}
                                                <i className="fas fa-arrow-right"></i>
                                            </a>
                                        </p>
                                    )}
                                </li>
                            ))}
                        </Animate>
                    )}

                    <Animate className="callout">
                        <i className="fas fa-circle-info"></i>
                        <p>
                            <strong>Como esta agenda é montada.</strong> Ela reúne as datas
                            nacionais do SPM — Semana do Migrante, Dia do Migrante, encontros e
                            formações — cadastradas pelo secretariado nacional. A agenda também pode
                            ser sincronizada com o Google Calendar da organização, de modo que os
                            eventos criados lá apareçam aqui automaticamente. Para incluir uma data
                            regional, <Link href="/fale-conosco">fale com o secretariado</Link>.
                        </p>
                    </Animate>
                </div>
            </section>

            {realizados.length > 0 && (
                <section className="section section--light">
                    <div className="container">
                        <Animate className="section-head">
                            <span className="eyebrow">Memória</span>
                            <h2>Eventos já realizados</h2>
                            <p>
                                Os compromissos mais recentes que já aconteceram, para consulta e
                                registro.
                            </p>
                        </Animate>

                        <div className="grid grid--3">
                            {realizados.map((evento) => (
                                <Animate className="card card--flat" key={evento.id}>
                                    <span className="badge-pill badge-pill--accent">
                                        {periodLabel(evento.startsAt, evento.endsAt)}
                                    </span>
                                    <h3>{evento.title}</h3>
                                    {evento.description && <p>{evento.description}</p>}
                                    {evento.location && (
                                        <p>
                                            <i className="fas fa-location-dot"></i>{' '}
                                            {evento.location}
                                        </p>
                                    )}
                                </Animate>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            <PageCta />
        </>
    );
}
