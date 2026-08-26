'use client';

import { useState } from 'react';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import PageCta from '@/components/PageCta';

interface Principio {
    title: string;
    body: string;
}

const principios: Principio[] = [
    {
        title: 'Universalidade, indivisibilidade e interdependência dos direitos humanos',
        body: 'Direitos humanos não se fatiam. A lei parte do princípio de que o direito à vida, à saúde, ao trabalho e à liberdade formam um conjunto indissociável, válido para qualquer pessoa em território nacional.',
    },
    {
        title: 'Repúdio e prevenção à xenofobia, ao racismo e a quaisquer formas de discriminação',
        body: 'O Estado brasileiro assume o dever de combater ativamente a hostilidade contra quem migra — e não apenas de se abster de discriminar.',
    },
    {
        title: 'Não criminalização da migração',
        body: 'Estar em situação migratória irregular é uma questão administrativa, não um crime. Esse foi um dos rompimentos mais importantes com o antigo Estatuto do Estrangeiro.',
    },
    {
        title: 'Acolhida humanitária',
        body: 'Prevê a possibilidade de acolhida de pessoas apátridas ou vindas de países em situação de grave instabilidade, conflito armado, calamidade ou violação de direitos humanos.',
    },
    {
        title: 'Igualdade de tratamento e de oportunidade ao migrante e a seus familiares',
        body: 'Migrantes têm acesso a serviços públicos, direitos trabalhistas e proteção social em igualdade de condições com brasileiros.',
    },
    {
        title: 'Acesso igualitário a serviços, programas e benefícios sociais',
        body: 'Inclui saúde, educação, assistência jurídica, previdência social, trabalho, moradia e serviço bancário — sem exigência de reciprocidade do país de origem.',
    },
    {
        title: 'Promoção do reconhecimento acadêmico e do exercício profissional',
        body: 'Facilita a revalidação de diplomas e o reconhecimento de qualificações obtidas no exterior, atacando um dos maiores gargalos da inserção laboral.',
    },
    {
        title: 'Proteção integral e atenção ao superior interesse da criança e do adolescente migrante',
        body: 'Crianças migrantes desacompanhadas ou separadas recebem proteção prioritária, e o interesse da criança prevalece sobre qualquer procedimento migratório.',
    },
];

export default function PageContent() {
    const [openPrinciple, setOpenPrinciple] = useState<number | null>(null);

    const toggle = (i: number) => {
        setOpenPrinciple(openPrinciple === i ? null : i);
    };

    return (
        <>
            <PageHero
                eyebrow="Legislação federal"
                title="Lei nº 13.445/2017 — Lei de Migração"
                subtitle="A norma que substituiu o Estatuto do Estrangeiro e passou a tratar quem migra como sujeito de direitos, e não como questão de segurança nacional."
                crumbs={[
                    { label: 'Legislação', link: '/legislacao' },
                    { label: 'Lei de Migração' },
                ]}
            />

            <section className="section">
                <div className="container">
                    <Animate className="law-meta">
                        <div>
                            <span>Sanção</span>
                            <strong>24 de maio de 2017</strong>
                        </div>
                        <div>
                            <span>Vigência</span>
                            <strong>Desde 21 de novembro de 2017</strong>
                        </div>
                        <div>
                            <span>Revoga</span>
                            <strong>Lei nº 6.815/1980 (Estatuto do Estrangeiro)</strong>
                        </div>
                        <div>
                            <span>Regulamentação</span>
                            <strong>Decreto nº 9.199/2017</strong>
                        </div>
                    </Animate>

                    <Animate className="prose">
                        <span className="eyebrow">O que ela faz</span>
                        <h2>Uma mudança de paradigma</h2>
                        <p className="lead">
                            A Lei de Migração dispõe sobre os direitos e os deveres do migrante e do
                            visitante, regula sua entrada e estada no país e estabelece princípios e
                            diretrizes para as políticas públicas voltadas também ao emigrante
                            brasileiro.
                        </p>
                        <p>
                            Até 2017, a legislação migratória brasileira ainda era a de 1980 —
                            escrita sob a ditadura militar, com foco na <em>defesa nacional</em> e
                            na proteção do trabalhador brasileiro contra a concorrência estrangeira.
                            O “estrangeiro” era, na letra da lei, um risco a ser controlado.
                        </p>
                        <p>
                            A Lei nº 13.445 inverte essa lógica. Ela ancora a política migratória
                            nos direitos humanos e na Constituição de 1988, cujos princípios
                            basilares incluem a fraternidade e a solidariedade. O combate à
                            xenofobia deixa de ser retórica e vira diretriz legal, e a migração
                            deixa de ser criminalizada.
                        </p>

                        <div className="callout">
                            <i className="fas fa-quote-left"></i>
                            <p>
                                <strong>Art. 4º</strong> — Ao migrante é garantida no território
                                nacional, em condição de igualdade com os nacionais, a
                                inviolabilidade do direito à vida, à liberdade, à igualdade, à
                                segurança e à propriedade.
                            </p>
                        </div>
                    </Animate>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Art. 3º</span>
                        <h2>Princípios e diretrizes da política migratória</h2>
                        <p>
                            A lei elenca mais de vinte princípios. Selecionamos os que mais impactam
                            o dia a dia de quem acompanha pessoas migrantes.
                        </p>
                    </Animate>

                    <Animate className="accordion">
                        {principios.map((p, i) => (
                            <div className="accordion__item" key={p.title}>
                                <button
                                    className={`accordion__head${openPrinciple === i ? ' is-open' : ''}`}
                                    type="button"
                                    aria-expanded={openPrinciple === i}
                                    onClick={() => toggle(i)}
                                >
                                    {p.title}
                                    <i className="fas fa-chevron-down"></i>
                                </button>
                                {openPrinciple === i && (
                                    <>
                                        <div className="accordion__body">
                                            <p>{p.body}</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </Animate>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Direitos garantidos</span>
                        <h2>O que a lei assegura a quem migra</h2>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Direito de acesso à informação</span>
                        <p>
                            O migrante deve ser informado sobre as garantias que lhe são asseguradas
                            para fins de regularização migratória — em linguagem que compreenda. A
                            lei também garante confidencialidade quanto aos seus dados pessoais.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Direito de ir e vir</span>
                        <p>
                            É garantido o direito de sair, de permanecer e de reingressar em
                            território nacional, mesmo enquanto pendente pedido de autorização de
                            residência, prorrogação de estada ou transformação de visto.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Acesso a serviços públicos</span>
                        <p>
                            Saúde, assistência social, educação pública, previdência social,
                            serviços bancários e assistência jurídica integral e gratuita são
                            acessíveis a quem migra, em igualdade com os nacionais.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Reunião familiar</span>
                        <p>
                            A autorização de residência para fins de reunião familiar alcança
                            cônjuge ou companheiro, filhos, ascendentes e irmãos — reconhecendo que
                            ninguém migra sozinho.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Vedação à deportação coletiva</span>
                        <p>
                            São vedadas a deportação e a expulsão coletivas. Cada caso deve ser
                            analisado individualmente, com direito a defesa e a recurso.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Participação política e associação</span>
                        <p>
                            O migrante tem direito de associação, inclusive sindical, e de
                            participação em manifestações e reivindicações de direitos — para fins
                            pacíficos.
                        </p>
                    </Animate>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Antes e depois</span>
                        <h2>O que mudou na prática</h2>
                    </Animate>

                    <Animate className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Tema</th>
                                    <th>Estatuto do Estrangeiro (1980)</th>
                                    <th>Lei de Migração (2017)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>
                                        <strong>Lógica central</strong>
                                    </td>
                                    <td>Segurança nacional e proteção do mercado interno</td>
                                    <td>Direitos humanos e não discriminação</td>
                                </tr>
                                <tr>
                                    <td>
                                        <strong>Nomenclatura</strong>
                                    </td>
                                    <td>“Estrangeiro”</td>
                                    <td>
                                        “Migrante”, “imigrante”, “visitante”, “residente
                                        fronteiriço”
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <strong>Irregularidade migratória</strong>
                                    </td>
                                    <td>Tratada com forte viés punitivo</td>
                                    <td>Questão administrativa, sem criminalização</td>
                                </tr>
                                <tr>
                                    <td>
                                        <strong>Acolhida humanitária</strong>
                                    </td>
                                    <td>Sem previsão expressa</td>
                                    <td>Prevista como princípio e como modalidade de visto</td>
                                </tr>
                                <tr>
                                    <td>
                                        <strong>Participação política</strong>
                                    </td>
                                    <td>Restrita, com vedação a manifestações</td>
                                    <td>Direito de associação e de reivindicação assegurado</td>
                                </tr>
                                <tr>
                                    <td>
                                        <strong>Emigrante brasileiro</strong>
                                    </td>
                                    <td>Praticamente ausente</td>
                                    <td>Capítulo próprio com diretrizes de política pública</td>
                                </tr>
                            </tbody>
                        </table>
                    </Animate>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="prose">
                        <span className="eyebrow">Nossa leitura</span>
                        <h2>Lei boa, aplicação desigual</h2>
                        <p>
                            O SPM participou ativamente da mobilização que resultou na aprovação da
                            Lei de Migração e reconhece nela um avanço histórico. Mas nossa
                            experiência de base mostra que o texto ainda não chegou a todos os
                            balcões de atendimento do país.
                        </p>
                        <p>
                            Persistem exigências indevidas de documentos, recusas de matrícula
                            escolar, negativas de atendimento em saúde e demora excessiva em
                            processos de regularização. Por isso, o monitoramento da aplicação da
                            lei é uma das frentes permanentes da nossa{' '}
                            <Link href="/o-que-fazemos">incidência política</Link>.
                        </p>

                        <div className="callout callout--action">
                            <i className="fas fa-book"></i>
                            <p>
                                <strong>Texto oficial.</strong> A íntegra da Lei nº 13.445/2017 está
                                disponível no Portal da Legislação da Presidência da República e no
                                Portal de Imigração do Ministério da Justiça. Esta página é um
                                resumo didático e não substitui a consulta ao texto legal nem a
                                orientação jurídica individual.
                            </p>
                        </div>
                    </Animate>
                </div>
            </section>

            <PageCta
                title="Precisa de orientação sobre sua situação migratória?"
                text="As equipes do SPM oferecem escuta e orientação gratuita sobre regularização, refúgio, reunião familiar e denúncias de violação de direitos."
                primaryLabel="Falar com o SPM"
                primaryLink="/fale-conosco"
                secondaryLabel="Ver outras leis"
                secondaryLink="/legislacao"
            />
        </>
    );
}
