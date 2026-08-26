import type { Metadata } from 'next';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import PageCta from '@/components/PageCta';

export const metadata: Metadata = { title: 'Transparência' };

interface Aplicacao {
    label: string;
    pct: number;
}

interface Parceiro {
    name: string;
    img: string;
}

const aplicacao: Aplicacao[] = [
    { label: 'Acolhida e atendimento direto', pct: 42 },
    { label: 'Formação e produção de subsídios', pct: 22 },
    { label: 'Incidência política e articulação em rede', pct: 15 },
    { label: 'Comunicação e campanhas', pct: 11 },
    { label: 'Administração e manutenção da estrutura', pct: 10 },
];

const parceiros: Parceiro[] = [
    { name: 'CNBB', img: '/assets/parceiros/cnbb.png' },
    { name: 'Cáritas', img: '/assets/parceiros/caritas.png' },
    { name: 'Misereor', img: '/assets/parceiros/misereor.png' },
    { name: 'Adveniat', img: '/assets/parceiros/adveniat.png' },
    { name: 'Rede Clamor', img: '/assets/parceiros/redeclamor.png' },
];

export default function Page() {
    return (
        <>
            <PageHero
                eyebrow="Prestação de contas"
                title="Transparência"
                subtitle="Cada real que chega ao SPM vem de alguém que confiou. Mostramos de onde vem, para onde vai e quem fiscaliza."
                crumbs={[{ label: 'Transparência' }]}
            />

            <section className="section">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Princípios</span>
                        <h2>Três compromissos que assumimos publicamente</h2>
                    </Animate>

                    <div className="grid grid--3">
                        <Animate className="card card--accent">
                            <div className="card__icon">
                                <i className="fas fa-book-open-reader"></i>
                            </div>
                            <h3>Contas abertas</h3>
                            <p>
                                Publicamos anualmente relatório de atividades e demonstrativo
                                financeiro, disponíveis para download na página de documentos.
                            </p>
                        </Animate>
                        <Animate className="card card--accent delay-100">
                            <div className="card__icon">
                                <i className="fas fa-users-viewfinder"></i>
                            </div>
                            <h3>Controle coletivo</h3>
                            <p>
                                As prioridades de gasto são aprovadas em Assembleia Nacional, com
                                delegados das equipes regionais e de base.
                            </p>
                        </Animate>
                        <Animate className="card card--accent delay-200">
                            <div className="card__icon">
                                <i className="fas fa-file-shield"></i>
                            </div>
                            <h3>Auditoria externa</h3>
                            <p>
                                Projetos financiados por agências parceiras são auditados de forma
                                independente, conforme os termos de cada convênio.
                            </p>
                        </Animate>
                    </div>
                </div>
            </section>

            <section className="section section--light">
                <div className="container with-aside">
                    <Animate>
                        <div className="section-head">
                            <span className="eyebrow">Aplicação dos recursos</span>
                            <h2>Para onde vão os recursos</h2>
                            <p>
                                Distribuição média dos recursos executados no último exercício,
                                considerando o conjunto dos projetos nacionais.
                            </p>
                        </div>

                        <div className="usage-list">
                            {aplicacao.map((item) => (
                                <div className="usage-item" key={item.label}>
                                    <div className="usage-item__head">
                                        <span>{item.label}</span>
                                        <strong>{item.pct}%</strong>
                                    </div>
                                    <div className="usage-bar">
                                        <div
                                            className="usage-bar__fill"
                                            style={{ width: `${item.pct}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="callout">
                            <i className="fas fa-circle-info"></i>
                            <p>
                                <strong>Os percentuais são indicativos</strong> e variam conforme os
                                projetos vigentes em cada ano. Os valores auditados constam no
                                demonstrativo financeiro publicado em{' '}
                                <Link href="/quem-somos/documentos">Documentos</Link>.
                            </p>
                        </div>
                    </Animate>

                    <aside className="aside-sticky">
                        <div className="aside-box">
                            <h4>Origem dos recursos</h4>
                            <ul>
                                <li>Agências de cooperação internacional</li>
                                <li>CNBB e coletas eclesiais</li>
                                <li>Doações de pessoas físicas</li>
                                <li>Convênios com poder público</li>
                                <li>Campanhas pontuais e emergenciais</li>
                            </ul>
                        </div>

                        <div className="aside-box">
                            <h4>Documentos financeiros</h4>
                            <ul>
                                <li>
                                    <Link href="/quem-somos/documentos">
                                        Relatório de atividades 2025 →
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/quem-somos/documentos">
                                        Demonstrativo financeiro 2025 →
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/quem-somos/documentos">
                                        Relatório de atividades 2024 →
                                    </Link>
                                </li>
                            </ul>
                        </div>
                    </aside>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Rede de apoio</span>
                        <h2>Quem caminha conosco</h2>
                        <p>
                            Instituições eclesiais e agências de cooperação que sustentam projetos e
                            campanhas do SPM.
                        </p>
                    </Animate>

                    <Animate className="grid grid--4">
                        {parceiros.map((p) => (
                            <div className="partner-tile" key={p.name}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.img} alt={p.name} />
                                <span>{p.name}</span>
                            </div>
                        ))}
                    </Animate>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Integridade</span>
                        <h2>Como pedir informações ou fazer uma denúncia</h2>
                        <p>
                            Qualquer pessoa pode solicitar esclarecimentos sobre o uso de recursos
                            ou relatar conduta inadequada de agentes ligados ao SPM.
                        </p>
                    </Animate>

                    <div className="grid grid--3">
                        <Animate className="numbered-card">
                            <span className="numbered-card__num">01</span>
                            <h3>Envie o pedido</h3>
                            <p>
                                Escreva para <strong>transparencia@spmnacional.org.br</strong>{' '}
                                descrevendo o que deseja saber. Não é preciso justificar o pedido.
                            </p>
                        </Animate>
                        <Animate className="numbered-card delay-100">
                            <span className="numbered-card__num">02</span>
                            <h3>Receba o protocolo</h3>
                            <p>
                                O secretariado nacional confirma o recebimento em até 5 dias úteis e
                                informa o prazo estimado de resposta.
                            </p>
                        </Animate>
                        <Animate className="numbered-card delay-200">
                            <span className="numbered-card__num">03</span>
                            <h3>Acompanhamento</h3>
                            <p>
                                Denúncias são encaminhadas à Coordenação Nacional, que garante
                                sigilo ao denunciante e retorno sobre as providências adotadas.
                            </p>
                        </Animate>
                    </div>
                </div>
            </section>

            <PageCta
                title="Transparência é o que torna a doação possível"
                text="Se você conhece nossas contas e ainda assim quer somar, esse é o melhor tipo de apoio que existe."
                primaryLabel="Quero apoiar"
                primaryLink="/como-ajudar"
                secondaryLabel="Ver documentos"
                secondaryLink="/quem-somos/documentos"
            />
        </>
    );
}
