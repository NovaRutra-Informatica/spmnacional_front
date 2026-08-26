import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Animate from '@/components/Animate';
import AnimateLink from '@/components/AnimateLink';
import PageCta from '@/components/PageCta';
import PageHero from '@/components/PageHero';
import { renderMarkdown } from '@/lib/markdown';
import { getSemanaEdicao, listSemanaAnos } from '@/lib/server/queries';

// Cada edição vem do Postgres — o build do Docker roda sem banco.
export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ ano: string }>;
}

/** Cartão de navegação entre edições, no rodapé da página. */
interface NavCard {
    href: string;
    icon: string;
    title: string;
    text: string;
    label: string;
}

/** Aceita só ano com quatro dígitos: evita consulta com NaN vinda da URL. */
function parseAno(value: string): number | null {
    if (!/^\d{4}$/.test(value)) return null;
    return Number(value);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { ano } = await params;
    const parsed = parseAno(ano);
    if (parsed === null) return { title: 'Semana do Migrante' };

    const edicao = await getSemanaEdicao(parsed);
    if (!edicao) return { title: 'Semana do Migrante' };

    return {
        title: `Material ${edicao.ano} — ${edicao.edicao}`,
        description: `${edicao.tema} · ${edicao.lema} — ${edicao.periodo}.`,
    };
}

export default async function Page({ params }: PageProps) {
    const { ano } = await params;
    const parsed = parseAno(ano);
    if (parsed === null) notFound();

    const [edicao, anos] = await Promise.all([getSemanaEdicao(parsed), listSemanaAnos()]);
    if (!edicao) notFound();

    // `listSemanaAnos` já vem em ordem decrescente: o vizinho anterior é o
    // maior ano abaixo do atual, e o seguinte é o menor ano acima dele.
    const anterior = anos.find((valor) => valor < edicao.ano) ?? null;
    const seguinte = [...anos].reverse().find((valor) => valor > edicao.ano) ?? null;

    const vizinhos: NavCard[] = [];

    if (anterior !== null) {
        vizinhos.push({
            href: `/semana-do-migrante/${anterior}`,
            icon: 'fa-arrow-left-long',
            title: `Edição anterior · ${anterior}`,
            text: `Tema, lema e subsídios da Semana do Migrante de ${anterior}.`,
            label: `Ver material ${anterior}`,
        });
    }

    if (seguinte !== null) {
        vizinhos.push({
            href: `/semana-do-migrante/${seguinte}`,
            icon: 'fa-arrow-right-long',
            title: `Edição seguinte · ${seguinte}`,
            text: `Tema, lema e subsídios da Semana do Migrante de ${seguinte}.`,
            label: `Ver material ${seguinte}`,
        });
    }

    vizinhos.push({
        href: '/semana-do-migrante',
        icon: 'fa-calendar-days',
        title: 'Todas as edições',
        text: 'A história da Semana do Migrante e os materiais de cada ano.',
        label: 'Ver histórico',
    });

    const resumoHtml = renderMarkdown(edicao.resumo);

    return (
        <>
            <PageHero
                eyebrow={`${edicao.edicao} · ${edicao.ano}`}
                title={edicao.tema}
                subtitle={`${edicao.lema} — ${edicao.periodo}.`}
                crumbs={[
                    { label: 'Semana do Migrante', link: '/semana-do-migrante' },
                    { label: `Material ${edicao.ano}` },
                ]}
            />

            <section className="section">
                <div className="container">
                    <Animate className="law-meta">
                        <div>
                            <span>Edição</span>
                            <strong>{edicao.edicao}</strong>
                        </div>
                        <div>
                            <span>Tema</span>
                            <strong>{edicao.tema}</strong>
                        </div>
                        <div>
                            <span>Lema</span>
                            <strong>{edicao.lema}</strong>
                        </div>
                        <div>
                            <span>Período</span>
                            <strong>{edicao.periodo}</strong>
                        </div>
                    </Animate>

                    <Animate className="prose">
                        <span className="eyebrow">Sobre o tema</span>
                        <h2>{edicao.lema}</h2>

                        {/* Saída do renderMarkdown: o HTML de entrada já foi escapado. */}
                        {resumoHtml && <div dangerouslySetInnerHTML={{ __html: resumoHtml }} />}

                        {edicao.citacao && <blockquote>{edicao.citacao}</blockquote>}

                        {edicao.objetivos.length > 0 && (
                            <>
                                <h3>Objetivos da edição</h3>
                                <ul>
                                    {edicao.objetivos.map((objetivo) => (
                                        <li key={objetivo}>{objetivo}</li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </Animate>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Downloads</span>
                        <h2>Materiais da {edicao.edicao}</h2>
                        <p>
                            Reprodução livre para fins pastorais e educativos, com indicação da
                            fonte. Se precisar de material impresso, fale com o secretariado
                            nacional.
                        </p>
                    </Animate>

                    {edicao.materiais.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-folder-open"></i>
                            <h3>Materiais em preparação</h3>
                            <p>
                                Os subsídios desta edição ainda não foram publicados. Solicite ao
                                secretariado nacional pelo e-mail spm.nac@terra.com.br.
                            </p>
                        </div>
                    ) : (
                        <Animate className="doc-list">
                            {edicao.materiais.map((material) =>
                                material.fileUrl ? (
                                    <a
                                        className="doc-item"
                                        href={material.fileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        key={material.id}
                                    >
                                        <span className="doc-item__icon">
                                            <i className={'fas ' + material.icon}></i>
                                        </span>
                                        <span className="doc-item__info">
                                            <strong>{material.title}</strong>
                                            <span>{material.meta}</span>
                                        </span>
                                        <span className="doc-item__action">
                                            <i className="fas fa-download"></i> Baixar
                                        </span>
                                    </a>
                                ) : (
                                    // Sem arquivo anexado ainda: mostra o item, mas sem link morto.
                                    <div className="doc-item" key={material.id}>
                                        <span className="doc-item__icon">
                                            <i className={'fas ' + material.icon}></i>
                                        </span>
                                        <span className="doc-item__info">
                                            <strong>{material.title}</strong>
                                            <span>{material.meta}</span>
                                        </span>
                                        <span className="doc-item__action">
                                            <i className="fas fa-clock"></i> Em breve
                                        </span>
                                    </div>
                                ),
                            )}
                        </Animate>
                    )}
                </div>
            </section>

            {edicao.programacao.length > 0 && (
                <section className="section">
                    <div className="container">
                        <Animate className="section-head">
                            <span className="eyebrow">Programação</span>
                            <h2>O roteiro da semana</h2>
                            <p>
                                Uma proposta de programação para a edição. Adapte livremente à
                                realidade da sua comunidade — o roteiro é sugestão, não obrigação.
                            </p>
                        </Animate>

                        <Animate as="ul" className="timeline">
                            {edicao.programacao.map((item) => (
                                <li className="timeline__item" key={item.id}>
                                    <span className="timeline__year">{item.dia}</span>
                                    <h3>{item.title}</h3>
                                    <p>{item.text}</p>
                                </li>
                            ))}
                        </Animate>
                    </div>
                </section>
            )}

            <section className="section section--light">
                <div className="container">
                    <div className={vizinhos.length > 2 ? 'grid grid--3' : 'grid grid--2'}>
                        {vizinhos.map((vizinho) => (
                            <AnimateLink
                                className="card card--accent"
                                href={vizinho.href}
                                key={vizinho.href}
                            >
                                <div className="card__icon">
                                    <i className={'fas ' + vizinho.icon}></i>
                                </div>
                                <h3>{vizinho.title}</h3>
                                <p>{vizinho.text}</p>
                                <span className="card__link">
                                    {vizinho.label} <i className="fas fa-arrow-right"></i>
                                </span>
                            </AnimateLink>
                        ))}
                    </div>
                </div>
            </section>

            <PageCta
                title="Vai organizar a Semana na sua cidade?"
                text="Conte com o apoio da equipe do SPM mais próxima: ajudamos na formação, na articulação com o poder público e na mobilização das comunidades migrantes."
                primaryLabel="Pedir apoio"
                primaryLink="/fale-conosco"
                secondaryLabel="Onde estamos"
                secondaryLink="/onde-estamos"
            />
        </>
    );
}
