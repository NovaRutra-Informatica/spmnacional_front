import type { Metadata } from 'next';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import PageCta from '@/components/PageCta';

export const metadata: Metadata = {
    title: 'Nossa História',
};

interface Milestone {
    year: string;
    title: string;
    text: string;
}

const milestones: Milestone[] = [
    {
        year: '1887 · 1895',
        title: 'As raízes scalabrinianas',
        text: 'São João Batista Scalabrini funda os Missionários de São Carlos (1887) e, com Madre Assunta Marchetti, as Irmãs Missionárias de São Carlos (1895), para acompanhar as levas de emigrantes italianos que chegavam às Américas. É dessa raiz que nasce a tradição de cuidado da Igreja com quem migra no Brasil.',
    },
    {
        year: '1969',
        title: 'O Dia do Migrante no calendário da Igreja',
        text: 'O Papa Paulo VI institui a celebração do Dia do Migrante, convocando as Igrejas locais a olhar para a mobilidade humana como um sinal dos tempos.',
    },
    {
        year: '1979',
        title: 'O Brasil escolhe o 25 de junho',
        text: 'A CNBB determina que, no Brasil, o Dia do Migrante seja celebrado em 25 de junho — data que até hoje organiza o calendário do SPM e da Semana do Migrante.',
    },
    {
        year: '1980',
        title: 'Campanha da Fraternidade: “Para onde vais?”',
        text: 'A CF de 1980 coloca o êxodo rural e a migração no centro da reflexão eclesial brasileira. Milhares de comunidades discutem por que tanta gente é obrigada a deixar sua terra. Ali está a semente do SPM.',
    },
    {
        year: '1981',
        title: 'Primeiro Dia do Migrante',
        text: 'Celebrado com o lema “Por que somos obrigados a sair da nossa terra?”, o primeiro Dia do Migrante já nasce com o tom que marcaria o serviço: mais do que socorrer, perguntar pelas causas.',
    },
    {
        year: '1984 · 1985',
        title: 'Nasce o Serviço Pastoral dos Migrantes',
        text: 'A articulação nacional amadurece em 1984 e, em outubro de 1985, o SPM é fundado. No ano seguinte é oficialmente reconhecido como organismo da Pastoral Social da CNBB, com secretariado nacional em São Paulo.',
    },
    {
        year: '1986',
        title: 'A primeira Semana do Migrante',
        text: 'Com o lema “Tomareis posse da terra e nela habitareis”, começa a Semana do Migrante — hoje com mais de quarenta edições consecutivas e materiais de formação distribuídos por todo o país.',
    },
    {
        year: 'Anos 1990',
        title: 'Fronteiras, canaviais e grandes cidades',
        text: 'O SPM se espalha pelas rotas da migração interna: os canaviais paulistas, as frentes agrícolas do Centro-Oeste, as periferias metropolitanas e as fronteiras do Norte e do Sul. Cresce a denúncia do trabalho análogo à escravidão e do tráfico de pessoas.',
    },
    {
        year: '2010',
        title: 'A chegada haitiana',
        text: 'Após o terremoto no Haiti, milhares de pessoas cruzam o Acre e o Amazonas rumo ao Brasil. As equipes do SPM na Amazônia se tornam ponto de apoio, orientação e denúncia das condições de travessia.',
    },
    {
        year: '2016 · 2017',
        title: 'Novas leis, novos direitos',
        text: 'É aprovada a Lei Municipal nº 16.478/2016, em São Paulo, e sancionada a Lei nº 13.445/2017 — a Lei de Migração, que substitui o Estatuto do Estrangeiro e passa a tratar quem migra como sujeito de direitos. O SPM participa ativamente da mobilização por ambas.',
    },
    {
        year: '2018 em diante',
        title: 'Venezuela, Roraima e a resposta em rede',
        text: 'O deslocamento venezuelano leva o SPM a reforçar a presença em Roraima e no Amazonas, com mutirões de documentação, acolhida e articulação com a rede humanitária.',
    },
    {
        year: '2025',
        title: '40 anos de caminhada',
        text: 'A 40ª Semana do Migrante, realizada de 15 a 22 de junho, celebra os 40 anos do SPM com o tema “Migração e Esperança” e o lema “Sempre no caminho com os migrantes”.',
    },
    {
        year: '2026',
        title: '“Eu não tenho onde morar!”',
        text: 'A 41ª Semana do Migrante, de 14 a 21 de junho, coloca a moradia no centro do debate — em sintonia com a Campanha da Fraternidade de 2026 — sob o tema “Migração e Moradia”.',
    },
];

export default function Page() {
    return (
        <>
            <PageHero
                eyebrow="Nossa história"
                title="Quatro décadas caminhando com quem migra"
                subtitle="Do êxodo rural dos anos 1980 às rotas internacionais de hoje: uma linha do tempo do Serviço Pastoral dos Migrantes."
                crumbs={[{ label: 'Quem Somos', link: '/quem-somos' }, { label: 'Nossa História' }]}
            />

            <section className="section">
                <div className="container">
                    <Animate className="split">
                        <div
                            className="split__media"
                            style={{ backgroundImage: "url('/assets/exemplo-migrantes.jpeg')" }}
                        ></div>
                        <div className="prose">
                            <span className="eyebrow">Como tudo começou</span>
                            <h2>Uma pergunta que virou pastoral</h2>
                            <p>
                                Em 1980, a Campanha da Fraternidade perguntou ao Brasil:{' '}
                                <em>“Para onde vais?”</em> O país vivia um êxodo rural massivo.
                                Famílias inteiras deixavam o campo rumo às periferias das grandes
                                cidades, empurradas pela concentração de terra e pela mecanização da
                                lavoura.
                            </p>
                            <p>
                                Aquela pergunta não se encerrou com a campanha. Ela continuou
                                ecoando em comunidades, sindicatos e romarias — e amadureceu, ao
                                longo de cinco anos, na criação de um serviço permanente da Igreja
                                junto às pessoas em mobilidade.
                            </p>
                            <p>
                                Em <strong>outubro de 1985</strong> nascia o Serviço Pastoral dos
                                Migrantes. Não como uma obra de assistência, mas como uma pastoral
                                de organização: ajudar quem migra a se reconhecer sujeito de
                                direitos e protagonista da própria história.
                            </p>
                        </div>
                    </Animate>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Linha do tempo</span>
                        <h2>Marcos da nossa caminhada</h2>
                        <p>
                            As datas que ajudam a entender por que o SPM é o que é — e por que as
                            pautas de terra, trabalho e moradia nunca saíram do nosso horizonte.
                        </p>
                    </Animate>

                    <Animate as="ul" className="timeline">
                        {milestones.map((m) => (
                            <li className="timeline__item" key={m.title}>
                                <span className="timeline__year">{m.year}</span>
                                <h3>{m.title}</h3>
                                <p>{m.text}</p>
                            </li>
                        ))}
                    </Animate>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="split split--reverse">
                        <div
                            className="split__media"
                            style={{
                                backgroundImage: "url('/assets/padre-alfredinho.png')",
                                backgroundPosition: 'top',
                            }}
                        ></div>
                        <div className="prose">
                            <span className="eyebrow">Memória viva</span>
                            <h2>Gente que abriu caminho</h2>
                            <p>
                                A história do SPM é feita de padres, religiosas, leigos e —
                                sobretudo — de migrantes que assumiram a liderança das próprias
                                comunidades. Muitos deles enfrentaram ameaças ao denunciar o
                                aliciamento de trabalhadores para os canaviais e as frentes de
                                desmatamento.
                            </p>
                            <p>
                                Guardamos essa memória não como nostalgia, mas como método: foi
                                ouvindo quem migra que o SPM aprendeu a fazer pastoral. É por isso
                                que, até hoje, nenhuma assembleia nacional acontece sem que as bases
                                regionais tenham falado primeiro.
                            </p>
                            <blockquote>
                                “O migrante não é um problema a ser resolvido. É uma ponte entre
                                povos.”
                            </blockquote>
                            <Link className="btn btn--outline" href="/publicacoes/testemunhos">
                                Ler testemunhos <i className="fas fa-arrow-right"></i>
                            </Link>
                        </div>
                    </Animate>
                </div>
            </section>

            <section className="section section--brand">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <h2>Continue explorando</h2>
                        <p style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
                            A história recente do SPM se escreve nas assembleias, nos documentos e
                            nas campanhas de cada ano.
                        </p>
                    </Animate>
                    <div className="cta-band__actions">
                        <Link className="btn btn--light" href="/quem-somos/estrutura">
                            Estrutura e coordenação
                        </Link>
                        <Link className="btn btn--light" href="/quem-somos/documentos">
                            Documentos
                        </Link>
                        <Link className="btn btn--cta" href="/semana-do-migrante">
                            Semana do Migrante
                        </Link>
                    </div>
                </div>
            </section>

            <PageCta />
        </>
    );
}
