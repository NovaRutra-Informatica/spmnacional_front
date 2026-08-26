import type { Metadata } from 'next';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import PageCta from '@/components/PageCta';

export const metadata: Metadata = {
    title: 'Estrutura e Coordenação',
};

interface Member {
    initials: string;
    name: string;
    role: string;
    place: string;
}

interface Instancia {
    nivel: string;
    periodicidade: string;
    composicao: string;
    atribuicao: string;
}

/**
 * Composição eleita na Assembleia Nacional de 3 a 5 de novembro de 2023.
 * Fontes: CNBB e Vatican News.
 */
const coordenacao: Member[] = [
    {
        initials: 'JB',
        name: 'Dom João Aparecido Bergamasco, SAC',
        role: 'Presidente',
        place: 'Bispo de Primavera do Leste-Paranatinga (MT)',
    },
    {
        initials: 'VM',
        name: 'Pe. Valdecir Mayer Molinari, CS',
        role: 'Vice-presidente',
        place: 'Missionário de São Carlos — scalabriniano',
    },
    {
        initials: 'IC',
        name: 'Irmã Ires De Costa, MSCS',
        role: 'Secretária',
        place: 'Irmã missionária scalabriniana',
    },
    {
        initials: 'MO',
        name: 'Márcia Maria de Oliveira',
        role: 'Vice-secretária',
        place: 'Coordenação Nacional do SPM',
    },
    {
        initials: 'AS',
        name: 'Arivaldo José Sezyshta',
        role: 'Tesoureiro',
        place: 'Coordenação Nacional do SPM',
    },
    {
        initials: 'GT',
        name: 'Gilvanda Torres',
        role: 'Vice-tesoureira',
        place: 'Coordenação Nacional do SPM',
    },
    {
        initials: 'JS',
        name: 'José Roberto Saraiva dos Santos',
        role: 'Coordenação colegiada',
        place: 'Coordenação Nacional do SPM',
    },
    {
        initials: 'RN',
        name: 'Rosana Maria Taveira do Nascimento',
        role: 'Coordenação colegiada',
        place: 'Coordenação Nacional do SPM',
    },
    {
        initials: 'MS',
        name: 'Maria Ozania da Silva',
        role: 'Coordenação colegiada',
        place: 'Coordenação Nacional do SPM',
    },
    {
        initials: 'AG',
        name: 'Pe. Alfredinho Gonçalves',
        role: 'Assessor',
        place: 'Assessoria da Coordenação Nacional',
    },
    {
        initials: 'AB',
        name: 'Anibal Brasil Freire Bardales',
        role: 'Assessor',
        place: 'Assessoria da Coordenação Nacional',
    },
];

const instancias: Instancia[] = [
    {
        nivel: 'Assembleia Nacional',
        periodicidade: 'A cada dois anos',
        composicao: 'Delegados das equipes regionais e de base, migrantes e assessoria',
        atribuicao: 'Define as prioridades do biênio e elege a Coordenação Nacional',
    },
    {
        nivel: 'Coordenação Nacional',
        periodicidade: 'Reuniões periódicas ao longo do biênio',
        composicao: 'Presidência, vice-presidência e coordenadores nacionais',
        atribuicao: 'Conduz a execução do plano nacional e representa o SPM',
    },
    {
        nivel: 'Secretariado Nacional',
        periodicidade: 'Permanente',
        composicao: 'Equipe sediada em São Paulo (SP)',
        atribuicao: 'Comunicação, projetos, formação, finanças e apoio às regionais',
    },
    {
        nivel: 'Equipes Regionais',
        periodicidade: 'Encontros regionais anuais',
        composicao: 'Agentes de pastoral, religiosos e lideranças migrantes',
        atribuicao: 'Adaptam o plano nacional à realidade de cada território',
    },
    {
        nivel: 'Equipes de Base',
        periodicidade: 'Cotidiano das comunidades',
        composicao: 'Paróquias, casas de acolhida, coletivos e associações de migrantes',
        atribuicao: 'Acolhem, orientam, organizam e denunciam violações no dia a dia',
    },
];

export default function Page() {
    return (
        <>
            <PageHero
                eyebrow="Governança"
                title="Estrutura e coordenação"
                subtitle="O SPM é uma rede: as decisões sobem das equipes de base para a assembleia nacional — e voltam como plano de trabalho para todo o país."
                crumbs={[{ label: 'Quem Somos', link: '/quem-somos' }, { label: 'Estrutura' }]}
                waveFill="#f8f9fa"
            />

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Como nos organizamos</span>
                        <h2>Cinco instâncias, uma só caminhada</h2>
                        <p>
                            Cada instância tem função própria, mas nenhuma decide sozinha. É esse
                            desenho que garante que a pauta de uma equipe de fronteira chegue à mesa
                            nacional.
                        </p>
                    </Animate>

                    <Animate className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Instância</th>
                                    <th>Periodicidade</th>
                                    <th>Composição</th>
                                    <th>Atribuição</th>
                                </tr>
                            </thead>
                            <tbody>
                                {instancias.map((i) => (
                                    <tr key={i.nivel}>
                                        <td>
                                            <strong style={{ color: 'var(--color-brand-primary)' }}>
                                                {i.nivel}
                                            </strong>
                                        </td>
                                        <td>{i.periodicidade}</td>
                                        <td>{i.composicao}</td>
                                        <td>{i.atribuicao}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Animate>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Coordenação Nacional</span>
                        <h2>Quem conduz o serviço</h2>
                        <p>
                            Equipe eleita na Assembleia Nacional realizada de 3 a 5 de novembro de
                            2023, responsável por acompanhar as regionais e representar o SPM junto
                            à CNBB e à sociedade.
                        </p>
                    </Animate>

                    <div className="grid grid--3">
                        {coordenacao.map((m) => (
                            <Animate className="card" key={m.name}>
                                <div className="card__icon card__icon--initials">{m.initials}</div>
                                <h3>{m.name}</h3>
                                <span className="badge-pill badge-pill--accent">{m.role}</span>
                                <p>{m.place}</p>
                            </Animate>
                        ))}
                    </div>

                    <Animate className="callout">
                        <i className="fas fa-circle-info"></i>
                        <p>
                            <strong>
                                Composição eleita na Assembleia Nacional de 3 a 5 de novembro de
                                2023.
                            </strong>{' '}
                            Os mandatos são bienais e a próxima assembleia pode alterar esta lista.
                            As atas oficiais estão em{' '}
                            <Link href="/quem-somos/documentos">Documentos</Link>.
                        </p>
                    </Animate>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="split">
                        <div
                            className="split__media"
                            style={{ backgroundImage: "url('/assets/house.jpg')" }}
                        ></div>
                        <div className="prose">
                            <span className="eyebrow">Secretariado Nacional</span>
                            <h2>A casa que sustenta a rede</h2>
                            <p>
                                Em São Paulo funciona o secretariado nacional do SPM. É de lá que
                                saem os subsídios da Semana do Migrante, as notas públicas, a
                                prestação de contas dos projetos e o apoio administrativo às equipes
                                regionais.
                            </p>
                            <p>A equipe se organiza em cinco frentes permanentes:</p>
                            <ul>
                                <li>
                                    <strong>Formação</strong> — produção de materiais e cursos
                                </li>
                                <li>
                                    <strong>Incidência</strong> — acompanhamento legislativo e de
                                    conselhos
                                </li>
                                <li>
                                    <strong>Comunicação</strong> — blog, redes e campanhas
                                </li>
                                <li>
                                    <strong>Projetos</strong> — captação, execução e relatórios
                                </li>
                                <li>
                                    <strong>Administrativo-financeiro</strong> — contas e
                                    conformidade
                                </li>
                            </ul>
                            <Link className="btn btn--outline" href="/fale-conosco">
                                Falar com o secretariado <i className="fas fa-arrow-right"></i>
                            </Link>
                        </div>
                    </Animate>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Vínculo eclesial</span>
                        <h2>Onde o SPM se situa na Igreja no Brasil</h2>
                    </Animate>

                    <div className="grid grid--3">
                        <Animate className="numbered-card">
                            <span className="numbered-card__num">01</span>
                            <h3>CNBB</h3>
                            <p>
                                Conferência Nacional dos Bispos do Brasil — instância que reconhece
                                e acompanha o SPM como organismo pastoral.
                            </p>
                        </Animate>
                        <Animate className="numbered-card delay-100">
                            <span className="numbered-card__num">02</span>
                            <h3>Ação Sociotransformadora</h3>
                            <p>
                                A comissão episcopal que reúne as pastorais sociais — da terra, do
                                povo da rua, carcerária, operária, entre outras.
                            </p>
                        </Animate>
                        <Animate className="numbered-card delay-200">
                            <span className="numbered-card__num">03</span>
                            <h3>Mobilidade Humana</h3>
                            <p>
                                O setor específico onde o SPM atua junto com scalabrinianos, Cáritas
                                e demais serviços voltados a migrantes e refugiados.
                            </p>
                        </Animate>
                    </div>
                </div>
            </section>

            <PageCta
                title="Quer aproximar sua diocese do SPM?"
                text="Ajudamos comunidades e paróquias a formar equipes de pastoral migratória, com material, assessoria e acompanhamento."
                primaryLabel="Fale com a coordenação"
                primaryLink="/fale-conosco"
                secondaryLabel="Ver onde já estamos"
                secondaryLink="/onde-estamos"
            />
        </>
    );
}
