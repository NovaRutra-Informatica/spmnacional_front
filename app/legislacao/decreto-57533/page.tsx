import type { Metadata } from 'next';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import PageCta from '@/components/PageCta';

export const metadata: Metadata = { title: 'Decreto nº 57.533/2016' };

interface Eixo {
    icon: string;
    area: string;
    text: string;
}

const eixos: Eixo[] = [
    {
        icon: 'fa-notes-medical',
        area: 'Saúde',
        text: 'Atendimento nas unidades básicas independentemente da situação migratória, capacitação intercultural das equipes e produção de material informativo em outras línguas.',
    },
    {
        icon: 'fa-briefcase',
        area: 'Trabalho e renda',
        text: 'Inclusão de imigrantes nos programas municipais de qualificação, intermediação de mão de obra e apoio ao empreendedorismo, com enfrentamento à exploração laboral.',
    },
    {
        icon: 'fa-house',
        area: 'Moradia',
        text: 'Consideração da população imigrante nas políticas habitacionais e nas ações voltadas a cortiços e moradias precárias.',
    },
    {
        icon: 'fa-graduation-cap',
        area: 'Educação',
        text: 'Garantia de matrícula na rede municipal sem exigências documentais indevidas e ações de acolhimento linguístico para estudantes imigrantes.',
    },
    {
        icon: 'fa-shield-heart',
        area: 'Prevenção da violência',
        text: 'Ações de prevenção e enfrentamento à violência contra imigrantes, com atenção prioritária a mulheres, crianças e adolescentes.',
    },
    {
        icon: 'fa-people-group',
        area: 'Participação comunitária',
        text: 'Fortalecimento de coletivos e associações de imigrantes por meio de editais públicos, oficinas de capacitação e apoio à formalização de novos grupos.',
    },
];

export default function Page() {
    return (
        <>
            <PageHero
                eyebrow="Legislação municipal · São Paulo"
                title="Decreto nº 57.533/2016"
                subtitle="Regulamenta a Lei nº 16.478/2016 e define os procedimentos e as ações que o Executivo municipal deve adotar para implementar a Política Municipal para a População Imigrante."
                crumbs={[
                    { label: 'Legislação', link: '/legislacao' },
                    { label: 'Decreto nº 57.533/2016' },
                ]}
                waveFill="#f8f9fa"
            />

            <section className="section section--light">
                <div className="container">
                    <Animate className="law-meta">
                        <div>
                            <span>Data</span>
                            <strong>15 de dezembro de 2016</strong>
                        </div>
                        <div>
                            <span>Regulamenta</span>
                            <strong>Lei nº 16.478, de 8 de julho de 2016</strong>
                        </div>
                        <div>
                            <span>Alcance</span>
                            <strong>Todo o Poder Executivo do Município de São Paulo</strong>
                        </div>
                        <div>
                            <span>Sigla</span>
                            <strong>PMPI — Política Municipal para a População Imigrante</strong>
                        </div>
                    </Animate>

                    <Animate className="prose">
                        <span className="eyebrow">Do papel à prática</span>
                        <h2>Uma lei sem regulamento é uma intenção</h2>
                        <p className="lead">
                            Cinco meses depois de aprovada a lei municipal, o Decreto nº 57.533
                            respondeu à pergunta que faltava: <em>quem faz o quê?</em>
                        </p>
                        <p>
                            O decreto define os procedimentos e as ações a serem adotados no âmbito
                            do Poder Executivo municipal para a implementação da PMPI. Ele distribui
                            responsabilidades entre as secretarias, estabelece diretrizes de
                            atendimento e detalha os mecanismos de participação da população
                            imigrante.
                        </p>
                        <p>
                            Para quem acompanha migrantes na ponta, esse é o documento mais útil do
                            conjunto: é ele que permite dizer a um servidor público, com respaldo
                            normativo, qual é a obrigação do órgão em que ele trabalha.
                        </p>
                    </Animate>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Eixos de implementação</span>
                        <h2>O que cada área do município deve garantir</h2>
                        <p>
                            O decreto organiza a política em eixos temáticos, atribuindo
                            responsabilidades setoriais e prevendo articulação intersecretarial.
                        </p>
                    </Animate>

                    <div className="grid grid--2">
                        {eixos.map((e) => (
                            <Animate className="card" key={e.area}>
                                <div className="card__icon">
                                    <i className={'fas ' + e.icon}></i>
                                </div>
                                <h3>{e.area}</h3>
                                <p>{e.text}</p>
                            </Animate>
                        ))}
                    </div>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Destaques normativos</span>
                        <h2>Pontos que o SPM considera decisivos</h2>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">
                            Fortalecimento de coletivos imigrantes
                        </span>
                        <p>
                            O Poder Público municipal deve incentivar o fortalecimento e a
                            articulação de coletivos e associações de imigrantes e de organizações
                            da sociedade civil que promovam ações voltadas a essa população.
                        </p>
                        <p>Entre as iniciativas previstas:</p>
                        <ul>
                            <li>editais públicos de fomento;</li>
                            <li>oficinas de capacitação;</li>
                            <li>
                                apoio a grupos que buscam constituir formalmente suas associações.
                            </li>
                        </ul>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">
                            Atendimento sem barreira documental
                        </span>
                        <p>
                            Os serviços municipais não podem condicionar o atendimento à
                            apresentação de documento migratório específico. A situação migratória
                            irregular não pode ser motivo de recusa de acesso a serviço público
                            municipal.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Formação de servidores</span>
                        <p>
                            Prevê a capacitação continuada dos servidores municipais para o
                            atendimento intercultural, incluindo noções de legislação migratória e
                            enfrentamento à xenofobia.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Produção de dados</span>
                        <p>
                            Determina a coleta e a sistematização de informações sobre a população
                            imigrante atendida pelos serviços municipais — condição para planejar
                            políticas com base em evidências.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Conselho Municipal de Imigrantes</span>
                        <p>
                            Detalha o funcionamento do CMI, incluindo o processo eleitoral dos
                            representantes da sociedade civil e das comunidades imigrantes,
                            garantindo que a política tenha controle social permanente.
                        </p>
                    </Animate>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <div className="grid grid--2">
                        <Animate className="card card--accent">
                            <div className="card__icon">
                                <i className="fas fa-arrow-left-long"></i>
                            </div>
                            <h3>Leia primeiro a lei</h3>
                            <p>
                                O decreto regulamenta a Lei nº 16.478/2016. Entender os princípios e
                                objetivos da lei ajuda a interpretar corretamente o regulamento.
                            </p>
                            <Link className="card__link" href="/legislacao/lei-municipal-16478">
                                Ir para a Lei nº 16.478/2016 <i className="fas fa-arrow-right"></i>
                            </Link>
                        </Animate>

                        <Animate className="card card--accent">
                            <div className="card__icon">
                                <i className="fas fa-scale-balanced"></i>
                            </div>
                            <h3>E no plano federal?</h3>
                            <p>
                                A Lei de Migração define os direitos válidos em todo o território
                                nacional. Municípios podem ampliar — nunca restringir — essas
                                garantias.
                            </p>
                            <Link className="card__link" href="/legislacao/lei-de-migracao">
                                Ir para a Lei nº 13.445/2017 <i className="fas fa-arrow-right"></i>
                            </Link>
                        </Animate>
                    </div>

                    <Animate className="callout callout--action">
                        <i className="fas fa-book"></i>
                        <p>
                            <strong>Texto oficial.</strong> A íntegra do Decreto nº 57.533, de 15 de
                            dezembro de 2016, está disponível no Catálogo de Legislação Municipal da
                            Prefeitura de São Paulo. Esta página é um resumo didático produzido pelo
                            SPM.
                        </p>
                    </Animate>
                </div>
            </section>

            <PageCta />
        </>
    );
}
