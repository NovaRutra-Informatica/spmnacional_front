'use client';

import { useState } from 'react';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import PageCta from '@/components/PageCta';

interface Objetivo {
    title: string;
    body: string;
}

const objetivos: Objetivo[] = [
    {
        title: 'Ampliar a ação pastoral junto aos migrantes em todo o país',
        body: 'Suscitar, acompanhar e fortalecer equipes locais em dioceses, paróquias e comunidades, especialmente nas regiões de fronteira, nos grandes centros urbanos e nas rotas de migração interna.',
    },
    {
        title: 'Formar lideranças migrantes',
        body: 'Investir na formação de migrantes como protagonistas — e não como assistidos —, partilhando responsabilidades em conselhos, coordenações e equipes de base.',
    },
    {
        title: 'Denunciar as causas da migração forçada',
        body: 'Evidenciar as estruturas que empurram pessoas para fora de sua terra: concentração fundiária, monoculturas, conflitos armados, crises climáticas, desemprego e violência.',
    },
    {
        title: 'Enfrentar o tráfico de pessoas e o trabalho escravo',
        body: 'Acompanhar denúncias e articular com o Ministério Público do Trabalho, a Defensoria Pública e a rede social presente nas cadeias da cana, da laranja, do eucalipto e do café.',
    },
    {
        title: 'Valorizar a cultura e a religiosidade popular dos povos migrantes',
        body: 'Reconhecer festas, línguas, músicas e expressões de fé como patrimônio e como caminho de integração — com atenção especial à juventude e às mulheres migrantes.',
    },
    {
        title: 'Construir uma sociedade justa e solidária',
        body: 'Atuar em rede com movimentos sociais, pastorais sociais, universidades e organismos internacionais na incidência por políticas públicas migratórias.',
    },
];

export default function PageContent() {
    const [openObjective, setOpenObjective] = useState<number | null>(0);

    const toggle = (i: number) => {
        setOpenObjective(openObjective === i ? null : i);
    };

    return (
        <>
            <PageHero
                eyebrow="Institucional"
                title="Quem somos"
                subtitle="O Serviço Pastoral dos Migrantes é um organismo da Conferência Nacional dos Bispos do Brasil que, desde 1985, caminha ao lado de quem migra — acolhendo, organizando e defendendo direitos."
                crumbs={[{ label: 'Quem Somos' }]}
            />

            <section className="section">
                <div className="container with-aside">
                    <Animate className="prose prose--wide">
                        <span className="eyebrow">Nossa identidade</span>
                        <h2>Um serviço da Igreja no Brasil junto a quem migra</h2>

                        <p className="lead">
                            O <strong>Serviço Pastoral dos Migrantes (SPM)</strong> nasceu em 1985
                            como fruto da Campanha da Fraternidade de 1980, cujo lema —{' '}
                            <em>“Para onde vais?”</em> — colocou o êxodo rural e a migração no
                            centro da reflexão da Igreja no Brasil.
                        </p>

                        <p>
                            Somos um organismo vinculado à <strong>Pastoral Social da CNBB</strong>,
                            dentro da Comissão para a Ação Sociotransformadora, no setor de
                            Mobilidade Humana. Isso significa que nossa ação não é apenas
                            assistencial: ela articula a caridade concreta com a defesa de direitos
                            e com a transformação das estruturas que produzem a migração forçada.
                        </p>

                        <p>
                            Atuamos com <strong>migrantes internos</strong> — brasileiros e
                            brasileiras que se deslocam dentro do próprio país atrás de trabalho e
                            de terra — e com <strong>imigrantes e refugiados</strong> de todas as
                            origens: haitianos, venezuelanos, bolivianos, senegaleses, congoleses,
                            sírios, bengaleses, entre tantos outros povos que hoje constroem o
                            Brasil.
                        </p>

                        <blockquote>
                            “Fui migrante e vocês me acolheram.”
                            <br />
                            <small>— Mateus 25, 35</small>
                        </blockquote>

                        <p>
                            Nosso trabalho não pergunta pela raça, pelo credo, pela cultura, pelo
                            gênero ou pela situação documental de ninguém. Acolhemos porque a
                            dignidade humana não depende de carimbo em passaporte.
                        </p>

                        <h3>Raízes que vêm de longe</h3>

                        <p>
                            A presença da Igreja junto aos migrantes no Brasil é anterior ao SPM.
                            Ela remonta ao final do século XIX, com{' '}
                            <strong>São João Batista Scalabrini</strong> e{' '}
                            <strong>Madre Assunta Marchetti</strong>, que fundaram as congregações
                            dos Missionários e das Missionárias de São Carlos (1887 e 1895) para
                            acompanhar as levas de imigrantes que chegavam às Américas. É dessa raiz
                            — e do impulso da Doutrina Social da Igreja inaugurada pela encíclica{' '}
                            <em>Rerum Novarum</em> (1891) — que o SPM se reconhece herdeiro.
                        </p>

                        <Link className="btn btn--outline" href="/quem-somos/historia">
                            Conheça nossa história completa <i className="fas fa-arrow-right"></i>
                        </Link>
                    </Animate>

                    <aside className="aside-sticky">
                        <div className="aside-box">
                            <h4>Dados rápidos</h4>
                            <ul>
                                <li>
                                    <strong>Fundação:</strong> 1985 (oficializado em 1986)
                                </li>
                                <li>
                                    <strong>Vínculo:</strong> Pastoral Social da CNBB
                                </li>
                                <li>
                                    <strong>Sede nacional:</strong> São Paulo — SP
                                </li>
                                <li>
                                    <strong>Metodologia:</strong> FIA
                                </li>
                                <li>
                                    <strong>Dia do Migrante:</strong> 25 de junho
                                </li>
                                <li>
                                    <strong>Semana do Migrante:</strong> 3ª semana de junho
                                </li>
                                <li>
                                    <strong>Assembleias nacionais:</strong> a cada dois anos
                                </li>
                            </ul>
                        </div>

                        <div className="aside-box">
                            <h4>Navegue por aqui</h4>
                            <ul>
                                <li>
                                    <Link href="/quem-somos/historia">Nossa história →</Link>
                                </li>
                                <li>
                                    <Link href="/quem-somos/estrutura">
                                        Estrutura e coordenação →
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/quem-somos/documentos">
                                        Documentos institucionais →
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/onde-estamos">Onde estamos →</Link>
                                </li>
                            </ul>
                        </div>
                    </aside>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">O que nos move</span>
                        <h2>Missão, visão e valores</h2>
                        <p>
                            Três afirmações simples que orientam cada decisão, cada mutirão e cada
                            documento que assinamos.
                        </p>
                    </Animate>

                    <div className="grid grid--3">
                        <Animate className="card card--accent">
                            <div className="card__icon">
                                <i className="fas fa-compass"></i>
                            </div>
                            <h3>Missão</h3>
                            <p>
                                Construir processos organizativos e defender os direitos humanos,
                                econômicos, sociais, culturais, religiosos e ambientais das pessoas
                                migrantes, sendo presença profética no enfrentamento da (i)migração
                                forçada.
                            </p>
                        </Animate>

                        <Animate className="card card--accent delay-100">
                            <div className="card__icon">
                                <i className="fas fa-eye"></i>
                            </div>
                            <h3>Visão</h3>
                            <p>
                                Suscitar, articular e dinamizar a organização coletiva dos migrantes
                                à luz de uma evangelização inculturada, para que sejam protagonistas
                                da história na construção de uma sociedade justa e solidária.
                            </p>
                        </Animate>

                        <Animate className="card card--accent delay-200">
                            <div className="card__icon">
                                <i className="fas fa-hands-holding-circle"></i>
                            </div>
                            <h3>Valores</h3>
                            <p>
                                Acolhida incondicional, dignidade da pessoa humana, solidariedade,
                                protagonismo migrante, respeito às diferenças e trabalho em rede —
                                sinal do Reino de Deus entre os povos.
                            </p>
                        </Animate>
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Metodologia</span>
                        <h2>FIA: Formação, Incidência e Articulação</h2>
                        <p>
                            O jeito do SPM de trabalhar cabe em três palavras. Elas se sustentam
                            mutuamente — e nenhuma delas funciona sozinha.
                        </p>
                    </Animate>

                    <div className="grid grid--3">
                        <Animate className="numbered-card">
                            <span className="numbered-card__num">01</span>
                            <h3>Formação</h3>
                            <p>
                                Educação permanente sobre o fenômeno migratório para migrantes,
                                agentes de pastoral, comunidades e poder público. Cursos, oficinas,
                                círculos bíblicos e subsídios que transformam a compreensão da
                                migração.
                            </p>
                        </Animate>

                        <Animate className="numbered-card delay-100">
                            <span className="numbered-card__num">02</span>
                            <h3>Incidência</h3>
                            <p>
                                Presença ativa nos espaços onde a política migratória se decide:
                                conselhos, audiências públicas, conferências, campanhas legislativas
                                e denúncia de violações de direitos.
                            </p>
                        </Animate>

                        <Animate className="numbered-card delay-200">
                            <span className="numbered-card__num">03</span>
                            <h3>Articulação</h3>
                            <p>
                                Nada se faz sozinho. Caminhamos com a Cáritas, os Missionários e
                                Missionárias Scalabrinianos, a Rede Clamor, movimentos sociais,
                                universidades e organismos internacionais.
                            </p>
                        </Animate>
                    </div>

                    <Animate className="callout">
                        <i className="fas fa-circle-info"></i>
                        <p>
                            <strong>Quer entender como isso vira ação concreta?</strong> A página{' '}
                            <Link href="/o-que-fazemos">O que fazemos</Link> detalha cada frente de
                            trabalho — da acolhida humanitária à assessoria jurídica e à geração de
                            renda.
                        </p>
                    </Animate>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Caminhos</span>
                        <h2>Acolher, proteger, promover e integrar</h2>
                        <p>
                            Os quatro verbos propostos pelo Papa Francisco descrevem bem o percurso
                            que acompanhamos junto de cada pessoa migrante.
                        </p>
                    </Animate>

                    <div className="grid grid--4">
                        <Animate className="card">
                            <div className="card__icon">
                                <i className="fas fa-door-open"></i>
                            </div>
                            <h3>Acolher</h3>
                            <p>
                                Ampliar as opções de entrada segura e legal, garantir abrigo,
                                alimentação e escuta a quem acaba de chegar.
                            </p>
                        </Animate>
                        <Animate className="card delay-100">
                            <div className="card__icon">
                                <i className="fas fa-shield-halved"></i>
                            </div>
                            <h3>Proteger</h3>
                            <p>
                                Defender direitos, orientar sobre regularização migratória e
                                enfrentar o tráfico de pessoas e o trabalho análogo à escravidão.
                            </p>
                        </Animate>
                        <Animate className="card delay-200">
                            <div className="card__icon">
                                <i className="fas fa-seedling"></i>
                            </div>
                            <h3>Promover</h3>
                            <p>
                                Favorecer o desenvolvimento integral: língua portuguesa,
                                qualificação profissional, revalidação de diplomas e geração de
                                renda.
                            </p>
                        </Animate>
                        <Animate className="card delay-300">
                            <div className="card__icon">
                                <i className="fas fa-people-group"></i>
                            </div>
                            <h3>Integrar</h3>
                            <p>
                                Construir convivência intercultural de mão dupla, em que a
                                comunidade que recebe também se deixa transformar.
                            </p>
                        </Animate>
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Prioridades</span>
                        <h2>Nossos objetivos</h2>
                        <p>
                            Clique em cada objetivo para entender como ele se traduz em prática
                            pastoral.
                        </p>
                    </Animate>

                    <Animate className="accordion">
                        {objetivos.map((obj, i) => (
                            <div className="accordion__item" key={obj.title}>
                                <button
                                    className={`accordion__head${openObjective === i ? ' is-open' : ''}`}
                                    type="button"
                                    aria-expanded={openObjective === i}
                                    onClick={() => toggle(i)}
                                >
                                    {obj.title}
                                    <i className="fas fa-chevron-down"></i>
                                </button>
                                {openObjective === i && (
                                    <div className="accordion__body">
                                        <p>{obj.body}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </Animate>
                </div>
            </section>

            <section className="section section--brand">
                <div className="container">
                    <Animate className="stat-band">
                        <div className="stat-band__item">
                            <strong>1985</strong>
                            <span>Ano de fundação do SPM</span>
                        </div>
                        <div className="stat-band__item">
                            <strong>40+</strong>
                            <span>Edições da Semana do Migrante</span>
                        </div>
                        <div className="stat-band__item">
                            <strong>24</strong>
                            <span>Estados com presença da rede</span>
                        </div>
                        <div className="stat-band__item">
                            <strong>3</strong>
                            <span>Pilares: Formação, Incidência, Articulação</span>
                        </div>
                    </Animate>
                </div>
            </section>

            <PageCta />
        </>
    );
}
