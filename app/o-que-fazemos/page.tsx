import type { Metadata } from 'next';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import PageCta from '@/components/PageCta';
import AnimateLink from '@/components/AnimateLink';

export const metadata: Metadata = { title: 'O que fazemos' };

interface Frente {
    icon: string;
    title: string;
    text: string;
    items: string[];
}

const frentes: Frente[] = [
    {
        icon: 'fa-house-chimney-crack',
        title: 'Acolhida humanitária',
        text: 'Casas do Migrante, centros de referência e pontos de escuta em fronteiras, rodoviárias e periferias.',
        items: [
            'Abrigo temporário para pessoas e famílias',
            'Alimentação, higiene e roupas',
            'Escuta qualificada e encaminhamento à rede socioassistencial',
            'Apoio a pessoas em trânsito nas rotas de fronteira',
        ],
    },
    {
        icon: 'fa-scale-balanced',
        title: 'Assessoria jurídica e regularização',
        text: 'Orientação sobre a Lei de Migração, autorização de residência, refúgio, reunião familiar e naturalização.',
        items: [
            'Mutirões de documentação com Polícia Federal e Defensoria',
            'Orientação sobre CPF, CTPS, CRNM e protocolo',
            'Apoio a pedidos de refúgio e de reunião familiar',
            'Encaminhamento de denúncias de violação de direitos',
        ],
    },
    {
        icon: 'fa-briefcase',
        title: 'Trabalho e geração de renda',
        text: 'Enfrentamos a exploração no trabalho e apoiamos a autonomia econômica de quem chega.',
        items: [
            'Cursos de qualificação e português como língua de acolhimento',
            'Apoio a cooperativas e empreendimentos de economia solidária',
            'Denúncia de trabalho análogo à escravidão e de aliciamento',
            'Articulação com sindicatos e com o Ministério Público do Trabalho',
        ],
    },
    {
        icon: 'fa-people-arrows',
        title: 'Enfrentamento ao tráfico de pessoas',
        text: 'Prevenção, identificação e acompanhamento de vítimas nas rotas mais vulneráveis do país.',
        items: [
            'Campanhas de informação em fronteiras e rodoviárias',
            'Formação de agentes públicos e comunitários',
            'Acompanhamento e proteção de pessoas identificadas',
            'Participação em comitês estaduais de enfrentamento',
        ],
    },
    {
        icon: 'fa-landmark',
        title: 'Incidência política',
        text: 'Presença nos espaços onde a política migratória é decidida — do município à ONU.',
        items: [
            'Conselhos de imigrantes e conferências de direitos humanos',
            'Audiências públicas e acompanhamento legislativo',
            'Notas públicas e campanhas nacionais',
            'Monitoramento da implementação da Lei nº 13.445/2017',
        ],
    },
    {
        icon: 'fa-graduation-cap',
        title: 'Formação e comunicação',
        text: 'Produzimos material para que comunidades, escolas e paróquias compreendam a migração.',
        items: [
            'Subsídios anuais da Semana do Migrante',
            'Círculos bíblicos e roteiros de celebração',
            'Cartilhas de direitos em várias línguas',
            'Blog, boletins e formação de multiplicadores',
        ],
    },
];

export default function Page() {
    return (
        <>
            <PageHero
                eyebrow="Nossa atuação"
                title="O que fazemos"
                subtitle="Da porta da casa de acolhida à mesa de negociação de políticas públicas: seis frentes que se sustentam pela metodologia FIA."
                crumbs={[{ label: 'O que fazemos' }]}
            />

            <section className="section">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Método</span>
                        <h2>Assistir não basta. É preciso organizar.</h2>
                        <p>
                            O SPM não separa a caridade concreta da luta por direitos. Toda acolhida
                            abre porta para a formação; toda formação alimenta a incidência; toda
                            incidência só se sustenta em rede.
                        </p>
                    </Animate>

                    <div className="grid grid--3">
                        <Animate className="numbered-card">
                            <span className="numbered-card__num">F</span>
                            <h3>Formação</h3>
                            <p>
                                Compreender o fenômeno migratório antes de agir sobre ele — com
                                migrantes, agentes de pastoral e comunidades.
                            </p>
                        </Animate>
                        <Animate className="numbered-card delay-100">
                            <span className="numbered-card__num">I</span>
                            <h3>Incidência</h3>
                            <p>
                                Transformar experiência de base em política pública, em lei e em
                                orçamento público.
                            </p>
                        </Animate>
                        <Animate className="numbered-card delay-200">
                            <span className="numbered-card__num">A</span>
                            <h3>Articulação</h3>
                            <p>
                                Somar com quem já está no território: Cáritas, scalabrinianos, Rede
                                Clamor, universidades e movimentos sociais.
                            </p>
                        </Animate>
                    </div>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Frentes de trabalho</span>
                        <h2>Seis frentes, um só compromisso</h2>
                        <p>
                            Cada equipe regional adapta essas frentes à realidade do seu território
                            — mas todas partem do mesmo princípio: a pessoa migrante é sujeito,
                            nunca objeto.
                        </p>
                    </Animate>

                    <div className="grid grid--2">
                        {frentes.map((f) => (
                            <Animate className="card" key={f.title}>
                                <div className="card__icon">
                                    <i className={'fas ' + f.icon}></i>
                                </div>
                                <h3>{f.title}</h3>
                                <p>{f.text}</p>
                                <ul
                                    style={{
                                        margin: '0 0 1.25rem',
                                        paddingLeft: '1.1rem',
                                        color: '#666',
                                    }}
                                >
                                    {f.items.map((item) => (
                                        <li
                                            key={item}
                                            style={{
                                                marginBottom: '0.4rem',
                                                fontSize: '0.9rem',
                                            }}
                                        >
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </Animate>
                        ))}
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="split">
                        <div
                            className="split__media"
                            style={{ backgroundImage: "url('/assets/venezuelana.jpeg')" }}
                        ></div>
                        <div className="prose">
                            <span className="eyebrow">Público acompanhado</span>
                            <h2>Com quem caminhamos</h2>
                            <p>
                                O SPM nasceu olhando para a <strong>migração interna</strong>:
                                trabalhadores e trabalhadoras que deixam o Nordeste e o Norte rumo
                                aos canaviais, às colheitas de laranja e café, às obras e às
                                periferias metropolitanas.
                            </p>
                            <p>
                                Com o tempo, o Brasil também se tornou destino. Hoje acompanhamos{' '}
                                <strong>imigrantes e refugiados</strong> de dezenas de
                                nacionalidades — do Haiti, da Venezuela, da Bolívia, do Senegal, do
                                Congo, do Mali, da Nigéria, da Síria, de Bangladesh e da China,
                                entre outros.
                            </p>
                            <p>
                                Há ainda quem migre dentro do próprio deslocamento: mulheres chefes
                                de família, juventude sem perspectiva de trabalho, povos indígenas
                                transfronteiriços como os Warao, e pessoas atingidas por eventos
                                climáticos extremos.
                            </p>
                            <blockquote>
                                Não existe migração “boa” ou “ruim”. Existe migração livre e
                                migração forçada — e é contra a segunda que trabalhamos.
                            </blockquote>
                        </div>
                    </Animate>
                </div>
            </section>

            <section className="section section--brand">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <h2>O que enfrentamos hoje</h2>
                        <p style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
                            Os desafios mudaram desde 1985 — mas a raiz continua a mesma: gente
                            obrigada a sair de casa.
                        </p>
                    </Animate>

                    <Animate className="grid grid--4">
                        <div className="card card--flat">
                            <h3>Xenofobia e racismo</h3>
                            <p>
                                Discurso de ódio nas redes, discriminação religiosa e barreiras de
                                acesso a serviços públicos.
                            </p>
                        </div>
                        <div className="card card--flat">
                            <h3>Moradia</h3>
                            <p>
                                Aluguel abusivo, cortiços superlotados e despejos que atingem
                                primeiro quem acabou de chegar.
                            </p>
                        </div>
                        <div className="card card--flat">
                            <h3>Trabalho escravo</h3>
                            <p>
                                Aliciamento nas cadeias da cana, da laranja, do eucalipto e do café
                                — e, cada vez mais, em aplicativos e confecções.
                            </p>
                        </div>
                        <div className="card card--flat">
                            <h3>Documentação</h3>
                            <p>
                                Filas, custos e desinformação que mantêm milhares de pessoas em
                                situação migratória irregular.
                            </p>
                        </div>
                    </Animate>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Vá mais fundo</span>
                        <h2>Conheça o trabalho por dentro</h2>
                    </Animate>

                    <div className="grid grid--3">
                        <AnimateLink className="card" href="/onde-estamos">
                            <div className="card__icon">
                                <i className="fas fa-map-location-dot"></i>
                            </div>
                            <h3>Onde estamos</h3>
                            <p>As regionais do SPM e o que cada uma prioriza em seu território.</p>
                            <span className="card__link">
                                Ver mapa <i className="fas fa-arrow-right"></i>
                            </span>
                        </AnimateLink>
                        <AnimateLink className="card delay-100" href="/legislacao">
                            <div className="card__icon">
                                <i className="fas fa-gavel"></i>
                            </div>
                            <h3>Legislação</h3>
                            <p>
                                Quais direitos a lei brasileira garante a quem migra — e como
                                acioná-los.
                            </p>
                            <span className="card__link">
                                Entender a lei <i className="fas fa-arrow-right"></i>
                            </span>
                        </AnimateLink>
                        <AnimateLink className="card delay-200" href="/publicacoes/testemunhos">
                            <div className="card__icon">
                                <i className="fas fa-comment-dots"></i>
                            </div>
                            <h3>Testemunhos</h3>
                            <p>Histórias contadas por quem viveu a travessia e a chegada.</p>
                            <span className="card__link">
                                Ler histórias <i className="fas fa-arrow-right"></i>
                            </span>
                        </AnimateLink>
                    </div>
                </div>
            </section>

            <PageCta />
        </>
    );
}
