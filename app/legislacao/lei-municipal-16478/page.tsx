import type { Metadata } from 'next';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import PageCta from '@/components/PageCta';

export const metadata: Metadata = { title: 'Lei Municipal nº 16.478/2016' };

interface Principio {
    icon: string;
    title: string;
    text: string;
}

const principios: Principio[] = [
    {
        icon: 'fa-equals',
        title: 'Igualdade de direitos e de oportunidades',
        text: 'Imigrantes têm acesso aos serviços e programas municipais nas mesmas condições que qualquer munícipe.',
    },
    {
        icon: 'fa-passport',
        title: 'Promoção da regularização',
        text: 'O município deve estimular e facilitar a regularização da situação migratória da população imigrante.',
    },
    {
        icon: 'fa-scale-balanced',
        title: 'Universalidade e indivisibilidade dos direitos',
        text: 'Os direitos humanos das pessoas imigrantes são universais, indivisíveis e interdependentes.',
    },
    {
        icon: 'fa-hand-fist',
        title: 'Combate à xenofobia e ao racismo',
        text: 'Enfrentamento ativo à xenofobia, ao racismo, ao preconceito e a toda forma de discriminação.',
    },
    {
        icon: 'fa-hospital',
        title: 'Acesso universal a serviços públicos',
        text: 'Promoção dos direitos sociais por meio do acesso universal aos serviços públicos municipais.',
    },
    {
        icon: 'fa-people-roof',
        title: 'Convivência familiar e comunitária',
        text: 'Fomento à convivência familiar e comunitária como dimensão essencial da integração.',
    },
    {
        icon: 'fa-earth-americas',
        title: 'Reconhecimento da diversidade cultural',
        text: 'Valorização das identidades, das línguas e das culturas trazidas pelas comunidades imigrantes.',
    },
    {
        icon: 'fa-users-gear',
        title: 'Participação social',
        text: 'Participação da população imigrante na formulação e no controle das políticas que lhe dizem respeito.',
    },
];

export default function Page() {
    return (
        <>
            <PageHero
                eyebrow="Legislação municipal · São Paulo"
                title="Lei nº 16.478/2016"
                subtitle="Institui a Política Municipal para a População Imigrante de São Paulo, define seus objetivos, princípios, diretrizes e ações prioritárias, e cria o Conselho Municipal de Imigrantes."
                crumbs={[
                    { label: 'Legislação', link: '/legislacao' },
                    { label: 'Lei nº 16.478/2016' },
                ]}
            />

            <section className="section">
                <div className="container">
                    <Animate className="law-meta">
                        <div>
                            <span>Promulgação</span>
                            <strong>8 de julho de 2016</strong>
                        </div>
                        <div>
                            <span>Âmbito</span>
                            <strong>Município de São Paulo</strong>
                        </div>
                        <div>
                            <span>Regulamentada por</span>
                            <strong>Decreto nº 57.533/2016</strong>
                        </div>
                        <div>
                            <span>Cria</span>
                            <strong>Conselho Municipal de Imigrantes (CMI)</strong>
                        </div>
                    </Animate>

                    <Animate className="prose">
                        <span className="eyebrow">Por que importa</span>
                        <h2>A política migratória se realiza na cidade</h2>
                        <p className="lead">
                            Uma lei federal define quem pode entrar e permanecer. Mas é no município
                            que a pessoa imigrante procura o posto de saúde, matricula o filho na
                            escola, busca creche e enfrenta o aluguel. É ali que a política
                            migratória vira — ou não — realidade.
                        </p>
                        <p>
                            São Paulo é a cidade brasileira com a maior população imigrante. Ao
                            aprovar a Lei nº 16.478/2016, o município se tornou referência nacional
                            ao assumir formalmente a responsabilidade de acolher, integrar e
                            garantir direitos a essa população — um ano antes mesmo da entrada em
                            vigor da Lei de Migração federal.
                        </p>
                        <p>
                            O SPM, cujo secretariado nacional fica em São Paulo, participou da
                            mobilização social que levou à aprovação da lei e segue acompanhando sua
                            implementação por meio do Conselho Municipal de Imigrantes.
                        </p>
                    </Animate>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Fundamentos</span>
                        <h2>Princípios da Política Municipal para a População Imigrante</h2>
                        <p>
                            Os princípios que devem orientar toda ação da Prefeitura de São Paulo
                            voltada à população imigrante.
                        </p>
                    </Animate>

                    <div className="grid grid--2">
                        {principios.map((p) => (
                            <Animate className="card" key={p.title}>
                                <div className="card__icon">
                                    <i className={'fas ' + p.icon}></i>
                                </div>
                                <h3>{p.title}</h3>
                                <p>{p.text}</p>
                            </Animate>
                        ))}
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Ações prioritárias</span>
                        <h2>O que a lei determina que o município faça</h2>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Acesso a serviços públicos</span>
                        <p>
                            Garantir que imigrantes acessem saúde, educação, assistência social,
                            cultura, esporte e trabalho sem discriminação e sem exigências indevidas
                            de documentação.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Atendimento em outras línguas</span>
                        <p>
                            Promover a capacitação de servidores públicos para o atendimento
                            intercultural e viabilizar tradução e interpretação nos serviços
                            municipais.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">
                            Trabalho decente e geração de renda
                        </span>
                        <p>
                            Fomentar a inserção produtiva, o empreendedorismo e o combate à
                            exploração do trabalho imigrante, especialmente em oficinas de costura e
                            na construção civil.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Moradia</span>
                        <p>
                            Incluir a população imigrante nas políticas municipais de habitação e
                            enfrentar a exploração em cortiços e em moradias precárias.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Enfrentamento à violência</span>
                        <p>
                            Prevenir e enfrentar a violência contra imigrantes, com atenção
                            específica a mulheres, crianças, adolescentes e pessoas LGBTQIA+
                            imigrantes.
                        </p>
                    </Animate>

                    <Animate className="law-article">
                        <span className="law-article__num">Participação social</span>
                        <p>
                            Fortalecer coletivos e associações de imigrantes e organizações da
                            sociedade civil, por meio de editais, oficinas de capacitação e apoio à
                            constituição de novas entidades.
                        </p>
                    </Animate>
                </div>
            </section>

            <section className="section section--brand">
                <div className="container">
                    <Animate className="split">
                        <div
                            className="prose prose--wide"
                            style={{ color: 'rgba(255, 255, 255, 0.85)' }}
                        >
                            <span className="eyebrow">Controle social</span>
                            <h2 style={{ color: '#fff' }}>O Conselho Municipal de Imigrantes</h2>
                            <p style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
                                A lei cria o CMI como espaço permanente de participação, com
                                representantes do poder público e da sociedade civil — incluindo
                                pessoas imigrantes eleitas por suas próprias comunidades.
                            </p>
                            <p style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
                                É no conselho que se acompanha a execução da política, se propõem
                                prioridades e se cobra o cumprimento das ações previstas em lei.
                                Para o SPM, esse é um dos espaços mais estratégicos de incidência:
                                ele transforma a experiência de base em política pública.
                            </p>
                        </div>
                        <div className="stat-band" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <div className="stat-band__item">
                                <strong>2016</strong>
                                <span>Ano de criação do CMI</span>
                            </div>
                            <div className="stat-band__item">
                                <strong>Paritário</strong>
                                <span>Poder público e sociedade civil</span>
                            </div>
                            <div className="stat-band__item">
                                <strong>Eleito</strong>
                                <span>Representantes escolhidos pelas comunidades</span>
                            </div>
                            <div className="stat-band__item">
                                <strong>Consultivo</strong>
                                <span>Acompanha e propõe a política municipal</span>
                            </div>
                        </div>
                    </Animate>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="callout">
                        <i className="fas fa-file-signature"></i>
                        <p>
                            <strong>Esta lei só ganhou força depois de regulamentada.</strong> O{' '}
                            <Link href="/legislacao/decreto-57533">Decreto nº 57.533/2016</Link>{' '}
                            definiu quais secretarias fazem o quê e como a política é executada no
                            dia a dia da Prefeitura.
                        </p>
                    </Animate>

                    <Animate className="callout callout--action">
                        <i className="fas fa-book"></i>
                        <p>
                            <strong>Texto oficial.</strong> A íntegra da Lei nº 16.478, de 8 de
                            julho de 2016, está disponível no Catálogo de Legislação Municipal da
                            Prefeitura de São Paulo. Esta página é um resumo didático produzido pelo
                            SPM.
                        </p>
                    </Animate>
                </div>
            </section>

            <PageCta
                title="Mora em São Paulo e teve um direito negado?"
                text="Recusa de matrícula, negativa de atendimento em saúde ou exigência indevida de documento são violações. Registre conosco — nós encaminhamos."
                primaryLabel="Registrar situação"
                primaryLink="/fale-conosco"
                secondaryLabel="Ler o decreto"
                secondaryLink="/legislacao/decreto-57533"
            />
        </>
    );
}
