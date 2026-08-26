import type { Metadata } from 'next';
import Animate from '@/components/Animate';
import PageCta from '@/components/PageCta';
import PageHero from '@/components/PageHero';
import { getFeaturedTestemunho, listTestemunhos } from '@/lib/server/queries';

export const metadata: Metadata = { title: 'Testemunhos' };

// A página lê o Postgres: sem isto o `docker build` (que roda sem banco) quebraria no prerender.
export const dynamic = 'force-dynamic';

export default async function TestemunhosPage() {
    const [destaque, publicados] = await Promise.all([getFeaturedTestemunho(), listTestemunhos()]);

    // O destaque já ocupa o bloco de cima; sem este filtro ele apareceria repetido na grade.
    const testemunhos = publicados.filter((testemunho) => testemunho.id !== destaque?.id);

    // A onda do herói precisa ter a cor da seção que vem logo abaixo: com destaque é a seção
    // branca; sem destaque, a primeira seção visível é a clara.
    const waveFill = destaque ? '#ffffff' : '#f8f9fa';

    return (
        <>
            <PageHero
                eyebrow="Vozes"
                title="Testemunhos"
                subtitle="Antes de qualquer relatório, existe uma pessoa contando o que viveu. Estas são algumas das histórias que sustentam tudo o que fazemos."
                crumbs={[{ label: 'Publicações', link: '/publicacoes' }, { label: 'Testemunhos' }]}
                waveFill={waveFill}
            />

            {destaque && (
                <section className="section">
                    <div className="container">
                        <Animate className="split">
                            <div
                                className="split__media"
                                style={
                                    destaque.photoUrl
                                        ? { backgroundImage: `url(${destaque.photoUrl})` }
                                        : undefined
                                }
                            ></div>
                            <div className="prose">
                                <span className="eyebrow">Testemunho em destaque</span>
                                <blockquote style={{ marginTop: '0' }}>{destaque.text}</blockquote>
                                <p>
                                    <strong>{destaque.personName}</strong>
                                    <br />
                                    <span
                                        style={{
                                            color: 'var(--color-text-muted)',
                                            fontSize: '0.92rem',
                                        }}
                                    >
                                        {destaque.origin}
                                    </span>
                                </p>
                            </div>
                        </Animate>
                    </div>
                </section>
            )}

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Histórias da rede</span>
                        <h2>Quem migra conta</h2>
                        <p>
                            Relatos colhidos pelas equipes regionais do SPM. Publicados com
                            autorização, alguns com nomes alterados a pedido de quem contou.
                        </p>
                    </Animate>

                    <div className="grid grid--3">
                        {testemunhos.map((testemunho) => (
                            <Animate className="testimony-card" key={testemunho.id}>
                                <p className="testimony-card__text">{testemunho.text}</p>
                                <div className="testimony-card__author">
                                    <span className="testimony-card__avatar">
                                        {testemunho.initials}
                                    </span>
                                    <span>
                                        <strong>{testemunho.personName}</strong>
                                        <span>{testemunho.origin}</span>
                                    </span>
                                </div>
                            </Animate>
                        ))}
                    </div>

                    {!testemunhos.length && (
                        <div className="empty-state">
                            <i className="fas fa-comment-dots"></i>
                            <h3>
                                {destaque
                                    ? 'Por enquanto, só o testemunho em destaque'
                                    : 'Nenhum testemunho publicado no momento'}
                            </h3>
                            <p>
                                Estamos escutando novas histórias. Assim que houver autorização de
                                quem contou, elas aparecem aqui.
                            </p>
                        </div>
                    )}
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="prose">
                        <span className="eyebrow">Nosso compromisso</span>
                        <h2>Como tratamos essas histórias</h2>
                        <p>
                            Testemunho não é matéria-prima de campanha. É a narrativa de alguém
                            sobre a própria vida — e quem conta segue sendo dono dela.
                        </p>
                        <ul>
                            <li>
                                <strong>Consentimento informado.</strong> Nada é publicado sem
                                autorização explícita, dada em língua que a pessoa compreenda.
                            </li>
                            <li>
                                <strong>Direito ao anonimato.</strong> Quem prefere pode ter nome,
                                imagem e localidade alterados ou omitidos.
                            </li>
                            <li>
                                <strong>Direito de retirada.</strong> Qualquer pessoa pode pedir a
                                remoção do próprio relato a qualquer momento, sem justificar.
                            </li>
                            <li>
                                <strong>Sem exploração da dor.</strong> Não publicamos imagens de
                                sofrimento para comover doadores. Contamos histórias inteiras, não
                                só a parte trágica.
                            </li>
                        </ul>

                        <div className="callout callout--action">
                            <i className="fas fa-microphone-lines"></i>
                            <p>
                                <strong>Você tem uma história para contar?</strong> Se você é
                                migrante e quer partilhar sua experiência — anonimamente ou não —,
                                escreva para{' '}
                                <a href="mailto:testemunhos@spmnacional.org.br">
                                    testemunhos@spmnacional.org.br
                                </a>
                                . Escutamos antes de qualquer coisa.
                            </p>
                        </div>
                    </Animate>
                </div>
            </section>

            <PageCta />
        </>
    );
}
