'use client';

import { useState } from 'react';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';

type Frequency = 'mensal' | 'unica';

interface Impacto {
    valor: string;
    title: string;
    text: string;
}

const valores = [30, 50, 100, 250];

const impactos: Impacto[] = [
    {
        valor: 'R$ 30',
        title: 'Kit de chegada',
        text: 'Itens de higiene, alimentação e informação em língua materna para uma pessoa recém-chegada.',
    },
    {
        valor: 'R$ 50',
        title: 'Documentação',
        text: 'Cobre taxas, fotos e transporte para que uma pessoa consiga iniciar sua regularização migratória.',
    },
    {
        valor: 'R$ 100',
        title: 'Uma noite de acolhida',
        text: 'Custeia a hospedagem, a alimentação e o acompanhamento de uma família por uma noite.',
    },
    {
        valor: 'R$ 250',
        title: 'Formação de liderança',
        text: 'Viabiliza a participação de uma liderança migrante em um encontro regional de formação.',
    },
];

export default function PageContent() {
    const [selectedValue, setSelectedValue] = useState(50);
    const [frequency, setFrequency] = useState<Frequency>('mensal');

    return (
        <>
            <PageHero
                eyebrow="Some-se"
                title="Como ajudar"
                subtitle="Acolher custa. Custa transporte, custa taxa de documento, custa uma noite de abrigo e custa o tempo de quem escuta. Você pode sustentar isso."
                crumbs={[{ label: 'Como ajudar' }]}
                center
            />

            <section className="section">
                <div className="container">
                    <div className="with-aside">
                        <Animate>
                            <div className="section-head">
                                <span className="eyebrow">Doação</span>
                                <h2>Escolha como quer contribuir</h2>
                                <p>
                                    Doações recorrentes são as mais valiosas: elas permitem planejar
                                    a acolhida em vez de improvisar. Mas toda contribuição conta.
                                </p>
                            </div>

                            <div className="form-card">
                                <div className="form-field is-full">
                                    <label>Frequência</label>
                                    <ul className="pill-nav" style={{ marginBottom: '0' }}>
                                        <li>
                                            <button
                                                type="button"
                                                className={
                                                    frequency === 'mensal' ? 'is-active' : ''
                                                }
                                                onClick={() => setFrequency('mensal')}
                                            >
                                                Mensal
                                            </button>
                                        </li>
                                        <li>
                                            <button
                                                type="button"
                                                className={frequency === 'unica' ? 'is-active' : ''}
                                                onClick={() => setFrequency('unica')}
                                            >
                                                Doação única
                                            </button>
                                        </li>
                                    </ul>
                                </div>

                                <div className="form-field is-full" style={{ marginTop: '1.5rem' }}>
                                    <label>Valor</label>
                                    <ul className="pill-nav" style={{ marginBottom: '0' }}>
                                        {valores.map((v) => (
                                            <li key={v}>
                                                <button
                                                    type="button"
                                                    className={
                                                        selectedValue === v ? 'is-active' : ''
                                                    }
                                                    onClick={() => setSelectedValue(v)}
                                                >
                                                    R$ {v}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="form-grid" style={{ marginTop: '1.75rem' }}>
                                    <div className="form-field">
                                        <label htmlFor="doador-nome">Nome completo</label>
                                        <input
                                            id="doador-nome"
                                            type="text"
                                            placeholder="Seu nome"
                                        />
                                    </div>
                                    <div className="form-field">
                                        <label htmlFor="doador-email">E-mail</label>
                                        <input
                                            id="doador-email"
                                            type="email"
                                            placeholder="voce@email.com"
                                        />
                                    </div>
                                    <div className="form-field is-full">
                                        <button type="button" className="btn btn--cta btn--block">
                                            <i className="fas fa-heart"></i> Doar R$ {selectedValue}{' '}
                                            {frequency === 'mensal' ? 'por mês' : 'agora'}
                                        </button>
                                        <span className="form-field__hint">
                                            Ambiente de demonstração. O processamento de doações
                                            on-line será habilitado em breve — enquanto isso, use o
                                            PIX ou a transferência bancária ao lado.
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </Animate>

                        <aside className="aside-sticky">
                            <div className="aside-box">
                                <h4>PIX</h4>
                                <p
                                    style={{
                                        fontSize: '0.9rem',
                                        color: '#666',
                                        margin: '0 0 0.75rem',
                                    }}
                                >
                                    Chave CNPJ do Serviço Pastoral dos Migrantes:
                                </p>
                                <div className="pix-key">contato@spmnacional.org.br</div>
                            </div>

                            <div className="aside-box">
                                <h4>Transferência bancária</h4>
                                <ul>
                                    <li>
                                        <strong>Titular:</strong> Serviço Pastoral dos Migrantes
                                    </li>
                                    <li>
                                        <strong>Banco:</strong> informe-se pelo e-mail
                                    </li>
                                    <li>
                                        <strong>Recibo:</strong> emitido mediante solicitação
                                    </li>
                                </ul>
                                <Link
                                    className="btn btn--outline btn--sm btn--block"
                                    href="/fale-conosco"
                                >
                                    Solicitar dados bancários
                                </Link>
                            </div>

                            <div className="aside-box">
                                <h4>Transparência</h4>
                                <p
                                    style={{
                                        fontSize: '0.9rem',
                                        color: '#666',
                                        margin: '0 0 1rem',
                                    }}
                                >
                                    Publicamos anualmente relatório de atividades e demonstrativo
                                    financeiro.
                                </p>
                                <Link
                                    className="btn btn--outline btn--sm btn--block"
                                    href="/transparencia"
                                >
                                    Ver prestação de contas
                                </Link>
                            </div>
                        </aside>
                    </div>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Impacto</span>
                        <h2>O que sua doação sustenta</h2>
                        <p>
                            Valores indicativos, baseados no custo médio das ações das equipes
                            regionais.
                        </p>
                    </Animate>

                    <div className="grid grid--4">
                        {impactos.map((i) => (
                            <Animate className="card" key={i.title}>
                                <span className="badge-pill badge-pill--accent">{i.valor}</span>
                                <h3>{i.title}</h3>
                                <p>{i.text}</p>
                            </Animate>
                        ))}
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Outras formas</span>
                        <h2>Nem toda ajuda é dinheiro</h2>
                        <p>
                            Tempo, competência técnica e articulação local valem tanto quanto — às
                            vezes mais.
                        </p>
                    </Animate>

                    <div className="grid grid--3">
                        <Animate className="card card--accent">
                            <div className="card__icon">
                                <i className="fas fa-hands-helping"></i>
                            </div>
                            <h3>Seja voluntário</h3>
                            <p>
                                Precisamos de professores de português, tradutores, advogados,
                                assistentes sociais, psicólogos, motoristas e gente disposta a
                                escutar.
                            </p>
                            <Link className="card__link" href="/fale-conosco">
                                Quero ser voluntário <i className="fas fa-arrow-right"></i>
                            </Link>
                        </Animate>

                        <Animate className="card card--accent delay-100">
                            <div className="card__icon">
                                <i className="fas fa-box-open"></i>
                            </div>
                            <h3>Doe itens</h3>
                            <p>
                                Roupas em bom estado, cobertores, itens de higiene, material escolar
                                e alimentos não perecíveis. Combine a entrega com a equipe mais
                                próxima.
                            </p>
                            <Link className="card__link" href="/onde-estamos">
                                Ver pontos de coleta <i className="fas fa-arrow-right"></i>
                            </Link>
                        </Animate>

                        <Animate className="card card--accent delay-200">
                            <div className="card__icon">
                                <i className="fas fa-building"></i>
                            </div>
                            <h3>Empresas e instituições</h3>
                            <p>
                                Contratação de pessoas migrantes, cessão de espaço, patrocínio de
                                projetos e apoio institucional a campanhas.
                            </p>
                            <Link className="card__link" href="/fale-conosco">
                                Falar sobre parceria <i className="fas fa-arrow-right"></i>
                            </Link>
                        </Animate>

                        <Animate className="card card--accent">
                            <div className="card__icon">
                                <i className="fas fa-church"></i>
                            </div>
                            <h3>Sua paróquia ou diocese</h3>
                            <p>
                                Organize a Semana do Migrante, forme uma equipe de acolhida ou abra
                                espaço para a comunidade migrante celebrar.
                            </p>
                            <Link className="card__link" href="/semana-do-migrante">
                                Ver materiais <i className="fas fa-arrow-right"></i>
                            </Link>
                        </Animate>

                        <Animate className="card card--accent delay-100">
                            <div className="card__icon">
                                <i className="fas fa-share-nodes"></i>
                            </div>
                            <h3>Divulgue</h3>
                            <p>
                                Compartilhar informação correta é ação política. Combater a
                                desinformação sobre migração é uma forma concreta de proteger
                                pessoas.
                            </p>
                            <Link className="card__link" href="/publicacoes/blog">
                                Ver publicações <i className="fas fa-arrow-right"></i>
                            </Link>
                        </Animate>

                        <Animate className="card card--accent delay-200">
                            <div className="card__icon">
                                <i className="fas fa-scale-balanced"></i>
                            </div>
                            <h3>Denuncie</h3>
                            <p>
                                Se você presenciou exploração no trabalho, xenofobia ou negativa de
                                atendimento a pessoa migrante, registre conosco.
                            </p>
                            <Link className="card__link" href="/fale-conosco">
                                Registrar denúncia <i className="fas fa-arrow-right"></i>
                            </Link>
                        </Animate>
                    </div>
                </div>
            </section>

            <section className="cta-band">
                <div className="container">
                    <h2>“Fui migrante e vocês me acolheram”</h2>
                    <p>
                        A frase do Evangelho não fala de compaixão à distância. Fala de encontro.
                        Obrigado por fazer parte deste caminho.
                    </p>
                    <div className="cta-band__actions">
                        <Link className="btn btn--cta" href="/transparencia">
                            <i className="fas fa-magnifying-glass-chart"></i> Ver nossa prestação de
                            contas
                        </Link>
                        <Link className="btn btn--light" href="/quem-somos">
                            Conhecer o SPM
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
