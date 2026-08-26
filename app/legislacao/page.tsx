import type { Metadata } from 'next';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import PageCta from '@/components/PageCta';
import AnimateLink from '@/components/AnimateLink';

export const metadata: Metadata = { title: 'Legislação' };

interface Norma {
    title: string;
    text: string;
}

const outrasNormas: Norma[] = [
    {
        title: 'Lei nº 9.474/1997 — Lei do Refúgio',
        text: 'Define os mecanismos de reconhecimento da condição de refugiado no Brasil e cria o CONARE. Foi uma das primeiras legislações do gênero na América Latina.',
    },
    {
        title: 'Decreto nº 9.199/2017',
        text: 'Regulamenta a Lei de Migração, detalhando procedimentos de vistos, autorizações de residência, registro e documentação.',
    },
    {
        title: 'Constituição Federal de 1988, art. 5º',
        text: 'Garante a igualdade de direitos entre brasileiros e estrangeiros residentes no país — fundamento de toda a política migratória brasileira.',
    },
    {
        title: 'Convenção de 1951 e Protocolo de 1967',
        text: 'Tratados internacionais sobre o Estatuto dos Refugiados, ratificados pelo Brasil e incorporados ao ordenamento jurídico nacional.',
    },
    {
        title: 'Pacto Global para Migração Segura, Ordenada e Regular',
        text: 'Marco cooperativo adotado pela ONU em 2018, que orienta boas práticas migratórias entre os países signatários.',
    },
    {
        title: 'Lei nº 13.344/2016',
        text: 'Dispõe sobre prevenção e repressão ao tráfico interno e internacional de pessoas e sobre medidas de atenção às vítimas.',
    },
];

export default function Page() {
    return (
        <>
            <PageHero
                eyebrow="Direitos"
                title="Legislação"
                subtitle="Migrar não é crime. Conheça as leis que garantem direitos a quem chega, a quem passa e a quem decide ficar."
                crumbs={[{ label: 'Legislação' }]}
            />

            <section className="section">
                <div className="container">
                    <Animate className="prose">
                        <span className="eyebrow">Por que esta página existe</span>
                        <h2>Direito que não se conhece não se exerce</h2>
                        <p className="lead">
                            Boa parte das violações que acompanhamos não acontece por falta de lei —
                            acontece por desconhecimento. De quem migra, mas também de quem atende
                            no balcão, na escola, no posto de saúde e na delegacia.
                        </p>
                        <p>
                            Reunimos aqui as principais normas que estruturam os direitos das
                            pessoas migrantes no Brasil, com uma leitura acessível de cada uma. Não
                            substituem a orientação jurídica individual, mas servem como ponto de
                            partida — para migrantes, agentes de pastoral, servidores públicos e
                            estudantes.
                        </p>
                    </Animate>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">As três principais</span>
                        <h2>Leis que mudaram o jogo</h2>
                        <p>
                            Uma federal e duas municipais — porque a política migratória se realiza,
                            na prática, na cidade onde a pessoa vive.
                        </p>
                    </Animate>

                    <div className="grid grid--3">
                        <AnimateLink
                            className="card card--accent"
                            href="/legislacao/lei-de-migracao"
                        >
                            <div className="card__icon">
                                <i className="fas fa-scale-balanced"></i>
                            </div>
                            <span className="badge-pill badge-pill--accent">Federal · 2017</span>
                            <h3>Lei nº 13.445/2017</h3>
                            <p>
                                A Lei de Migração. Substituiu o Estatuto do Estrangeiro e passou a
                                tratar quem migra como sujeito de direitos, e não como ameaça à
                                segurança nacional.
                            </p>
                            <span className="card__link">
                                Ler resumo <i className="fas fa-arrow-right"></i>
                            </span>
                        </AnimateLink>

                        <AnimateLink
                            className="card card--accent delay-100"
                            href="/legislacao/lei-municipal-16478"
                        >
                            <div className="card__icon">
                                <i className="fas fa-city"></i>
                            </div>
                            <span className="badge-pill badge-pill--accent">
                                Municipal · SP · 2016
                            </span>
                            <h3>Lei nº 16.478/2016</h3>
                            <p>
                                Institui a Política Municipal para a População Imigrante em São
                                Paulo e cria o Conselho Municipal de Imigrantes.
                            </p>
                            <span className="card__link">
                                Ler resumo <i className="fas fa-arrow-right"></i>
                            </span>
                        </AnimateLink>

                        <AnimateLink
                            className="card card--accent delay-200"
                            href="/legislacao/decreto-57533"
                        >
                            <div className="card__icon">
                                <i className="fas fa-file-signature"></i>
                            </div>
                            <span className="badge-pill badge-pill--accent">
                                Municipal · SP · 2016
                            </span>
                            <h3>Decreto nº 57.533/2016</h3>
                            <p>
                                Regulamenta a lei municipal e define como cada secretaria da
                                Prefeitura deve executar a política para imigrantes.
                            </p>
                            <span className="card__link">
                                Ler resumo <i className="fas fa-arrow-right"></i>
                            </span>
                        </AnimateLink>
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Contexto</span>
                        <h2>Outras normas que você precisa conhecer</h2>
                        <p>
                            A proteção de quem migra não cabe em uma lei só. Ela se monta como um
                            mosaico de normas nacionais e tratados internacionais.
                        </p>
                    </Animate>

                    <div className="grid grid--2">
                        {outrasNormas.map((n) => (
                            <Animate className="card card--flat" key={n.title}>
                                <h3>{n.title}</h3>
                                <p>{n.text}</p>
                            </Animate>
                        ))}
                    </div>
                </div>
            </section>

            <section className="section section--brand">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <h2>O que a lei garante, na prática</h2>
                        <p style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
                            Quatro direitos que valem para toda pessoa migrante em território
                            brasileiro — independentemente da situação documental.
                        </p>
                    </Animate>

                    <Animate className="grid grid--4">
                        <div className="card card--flat">
                            <h3>Saúde</h3>
                            <p>
                                Atendimento no SUS é universal. Nenhuma unidade de saúde pode exigir
                                documento migratório para prestar atendimento.
                            </p>
                        </div>
                        <div className="card card--flat">
                            <h3>Educação</h3>
                            <p>
                                Crianças e adolescentes migrantes têm direito à matrícula na rede
                                pública, mesmo sem documentação completa.
                            </p>
                        </div>
                        <div className="card card--flat">
                            <h3>Trabalho</h3>
                            <p>
                                Direitos trabalhistas valem para todos. Situação migratória
                                irregular não autoriza salário menor nem jornada abusiva.
                            </p>
                        </div>
                        <div className="card card--flat">
                            <h3>Justiça</h3>
                            <p>
                                Toda pessoa migrante pode acionar a Defensoria Pública e denunciar
                                violações, sem risco de deportação por isso.
                            </p>
                        </div>
                    </Animate>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="callout callout--action">
                        <i className="fas fa-triangle-exclamation"></i>
                        <p>
                            <strong>Está passando por uma violação de direitos?</strong> Procure a
                            equipe do SPM mais próxima em{' '}
                            <Link href="/onde-estamos">Onde estamos</Link> ou escreva para nós em{' '}
                            <Link href="/fale-conosco">Fale Conosco</Link>. O atendimento é gratuito
                            e sigiloso.
                        </p>
                    </Animate>
                </div>
            </section>

            <PageCta />
        </>
    );
}
