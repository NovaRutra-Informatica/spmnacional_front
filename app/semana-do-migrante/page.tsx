import type { Metadata } from 'next';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import PageCta from '@/components/PageCta';
import AnimateLink from '@/components/AnimateLink';
import { listSemanaEdicoes } from '@/lib/server/queries';

// Lê as edições do Postgres — sem isso o build sem banco quebraria no prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Semana do Migrante' };

interface Material {
    icon: string;
    title: string;
    text: string;
}

/** Capa de reserva para edições cadastradas sem imagem. */
const FALLBACK_COVER = '/assets/hero-bg-large.jpeg';

const materiais: Material[] = [
    {
        icon: 'fa-book-open',
        title: 'Texto-base',
        text: 'Aprofundamento do tema do ano, com dados, análise de conjuntura e referências bíblicas.',
    },
    {
        icon: 'fa-bible',
        title: 'Círculos bíblicos',
        text: 'Roteiros de encontro para grupos e comunidades, com dinâmica, leitura e compromisso.',
    },
    {
        icon: 'fa-image',
        title: 'Cartazes',
        text: 'Versões grande e pequena, em alta resolução, para impressão em paróquias e escolas.',
    },
    {
        icon: 'fa-church',
        title: 'Roteiro de celebração',
        text: 'Sugestão litúrgica para a missa do Dia do Migrante e para celebrações da palavra.',
    },
    {
        icon: 'fa-hands-praying',
        title: 'Novena e orações',
        text: 'Preces e novena preparatória para rezar em família, em comunidade ou nos grupos de base.',
    },
    {
        icon: 'fa-shirt',
        title: 'Identidade visual',
        text: 'Marca da edição, artes para redes sociais e arquivos para camisetas e faixas.',
    },
];

export default async function Page() {
    const edicoes = await listSemanaEdicoes();

    // A edição mais recente comanda o atalho do CTA no fim da página.
    const anoMaisRecente = edicoes.length > 0 ? edicoes[0].ano : null;

    return (
        <>
            <PageHero
                eyebrow="Campanha anual"
                title="Semana do Migrante"
                subtitle="Todo mês de junho, comunidades de todo o Brasil param para escutar quem migra. Uma semana de conscientização, celebração e compromisso."
                crumbs={[{ label: 'Semana do Migrante' }]}
            />

            <section className="section">
                <div className="container with-aside">
                    <Animate className="prose prose--wide">
                        <span className="eyebrow">O que é</span>
                        <h2>Um momento forte de conscientização e acolhida</h2>
                        <p className="lead">
                            A Semana do Migrante acontece anualmente na terceira semana de junho e
                            culmina no <strong>Dia do Migrante, celebrado em 25 de junho</strong> no
                            Brasil. É a principal campanha de mobilização do Serviço Pastoral dos
                            Migrantes.
                        </p>
                        <p>
                            A história começa antes do próprio SPM. Em 1969, o Papa Paulo VI
                            institui a celebração do Dia do Migrante. Dez anos depois, em 1979, a
                            CNBB determina que, no Brasil, a data seja 25 de junho. O primeiro Dia
                            do Migrante brasileiro é celebrado em 1981, com o lema{' '}
                            <em>“Por que somos obrigados a sair da nossa terra?”</em>
                        </p>
                        <p>
                            Em 1986, um ano depois da fundação do SPM, a celebração se amplia para
                            uma semana inteira. A primeira Semana do Migrante teve como lema{' '}
                            <em>“Tomareis posse da terra e nela habitareis”</em>. De lá para cá,
                            foram mais de quarenta edições consecutivas.
                        </p>

                        <h3>Como o tema é escolhido</h3>
                        <p>
                            Cada edição dialoga com a Campanha da Fraternidade do ano e com a
                            conjuntura migratória. Em 2024, o tema foi a casa comum e a crise
                            climática; em 2025, a esperança, no ano em que o SPM completou quarenta
                            anos; em 2026, a moradia — em sintonia direta com a Campanha da
                            Fraternidade sobre o direito de morar.
                        </p>
                        <p>
                            A definição passa pelas equipes regionais e é aprovada pela Coordenação
                            Nacional. Os subsídios são produzidos com meses de antecedência para que
                            as comunidades tenham tempo de preparar a semana.
                        </p>
                    </Animate>

                    <aside className="aside-sticky">
                        <div className="aside-box">
                            <h4>Datas que organizam o ano</h4>
                            <ul>
                                <li>
                                    <strong>25 de junho</strong> — Dia do Migrante (Brasil)
                                </li>
                                <li>
                                    <strong>3ª semana de junho</strong> — Semana do Migrante
                                </li>
                                <li>
                                    <strong>Setembro</strong> — Dia Mundial do Migrante e do
                                    Refugiado
                                </li>
                                <li>
                                    <strong>18 de dezembro</strong> — Dia Internacional do Migrante
                                </li>
                                <li>
                                    <Link href="/agenda">Ver a agenda completa →</Link>
                                </li>
                            </ul>
                        </div>

                        {edicoes.length > 0 && (
                            <div className="aside-box">
                                <h4>Materiais por edição</h4>
                                <ul>
                                    {edicoes.map((edicao) => (
                                        <li key={edicao.id}>
                                            <Link href={`/semana-do-migrante/${edicao.ano}`}>
                                                Material {edicao.ano} →
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </aside>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Edições recentes</span>
                        <h2>Escolha o ano e baixe o material</h2>
                        <p>
                            Todos os subsídios são de livre reprodução para fins pastorais e
                            educativos, com indicação da fonte.
                        </p>
                    </Animate>

                    {edicoes.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-calendar-days"></i>
                            <h3>Nenhuma edição publicada ainda</h3>
                            <p>
                                Os subsídios da próxima Semana do Migrante serão disponibilizados
                                aqui assim que forem aprovados pela Coordenação Nacional.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid--3">
                            {edicoes.map((edicao) => (
                                <AnimateLink
                                    className="post-card"
                                    href={`/semana-do-migrante/${edicao.ano}`}
                                    key={edicao.id}
                                >
                                    <div
                                        className="post-card__img"
                                        style={{
                                            backgroundImage: `url(${edicao.coverUrl ?? FALLBACK_COVER})`,
                                        }}
                                    >
                                        <span className="post-card__tag">{edicao.edicao}</span>
                                    </div>
                                    <div className="post-card__body">
                                        <span className="post-card__date">{edicao.periodo}</span>
                                        <h3>{edicao.tema}</h3>
                                        <p>{edicao.lema}</p>
                                        <span className="post-card__link">
                                            Baixar material {edicao.ano}{' '}
                                            <i className="fas fa-arrow-right"></i>
                                        </span>
                                    </div>
                                </AnimateLink>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Subsídios</span>
                        <h2>O que produzimos a cada edição</h2>
                        <p>
                            Um conjunto completo de materiais para que qualquer comunidade consiga
                            organizar a semana, mesmo sem experiência prévia com o tema migratório.
                        </p>
                    </Animate>

                    <div className="grid grid--3">
                        {materiais.map((m) => (
                            <Animate className="card" key={m.title}>
                                <div className="card__icon">
                                    <i className={'fas ' + m.icon}></i>
                                </div>
                                <h3>{m.title}</h3>
                                <p>{m.text}</p>
                            </Animate>
                        ))}
                    </div>
                </div>
            </section>

            <section className="section section--brand">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <h2>Como organizar a Semana na sua comunidade</h2>
                        <p style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
                            Não é preciso estrutura nem orçamento. É preciso disposição para
                            escutar.
                        </p>
                    </Animate>

                    <Animate className="grid grid--4">
                        <div className="card card--flat">
                            <h3>1. Forme um grupo</h3>
                            <p>
                                Reúna três ou quatro pessoas da comunidade — de preferência
                                incluindo alguém que tenha migrado.
                            </p>
                        </div>
                        <div className="card card--flat">
                            <h3>2. Baixe o material</h3>
                            <p>
                                Comece pelo texto-base e pelo roteiro de círculos bíblicos da edição
                                do ano.
                            </p>
                        </div>
                        <div className="card card--flat">
                            <h3>3. Convide a cidade</h3>
                            <p>
                                Escolas, sindicatos, coletivos de migrantes e poder público local: a
                                semana é pública, não é só de igreja.
                            </p>
                        </div>
                        <div className="card card--flat">
                            <h3>4. Conte para nós</h3>
                            <p>
                                Envie fotos e relatos ao secretariado nacional. Publicamos as
                                experiências no blog e nos materiais seguintes.
                            </p>
                        </div>
                    </Animate>
                </div>
            </section>

            <PageCta
                title="Precisa de apoio para organizar a Semana?"
                text="O secretariado nacional envia orientações, ajuda a articular com a diocese e indica a equipe do SPM mais próxima de você."
                primaryLabel="Pedir apoio"
                primaryLink="/fale-conosco"
                secondaryLabel={
                    anoMaisRecente === null ? 'Ver a agenda' : `Ver material ${anoMaisRecente}`
                }
                secondaryLink={
                    anoMaisRecente === null ? '/agenda' : `/semana-do-migrante/${anoMaisRecente}`
                }
            />
        </>
    );
}
