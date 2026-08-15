'use client';

import { useMemo, useState } from 'react';
import Animate from '@/components/Animate';
import PageCta from '@/components/PageCta';
import PageHero from '@/components/PageHero';
import { EditalStatus } from '@/lib/generated/prisma/enums';
import { EDITAL_STATUS_CLASS, EDITAL_STATUS_LABEL } from '@/lib/labels';

export interface EditalItem {
    id: string;
    code: string;
    title: string;
    description: string;
    status: EditalStatus;
    deadlineText: string;
    scope: string;
    fileUrl: string | null;
}

interface PageContentProps {
    editais: EditalItem[];
}

type StatusFilter = 'Todos' | EditalStatus;

// "Todos" continua primeiro; o restante segue a ordem do enum (aberto → em análise → encerrado).
const STATUS_FILTERS: StatusFilter[] = ['Todos', ...Object.values(EditalStatus)];

function filterLabel(filter: StatusFilter): string {
    return filter === 'Todos' ? 'Todos' : EDITAL_STATUS_LABEL[filter];
}

export default function PageContent({ editais }: PageContentProps) {
    const [activeStatus, setActiveStatus] = useState<StatusFilter>('Todos');

    const filtered = useMemo(
        () =>
            activeStatus === 'Todos'
                ? editais
                : editais.filter((edital) => edital.status === activeStatus),
        [activeStatus, editais],
    );

    return (
        <>
            <PageHero
                eyebrow="Chamadas públicas"
                title="Editais"
                subtitle="Oportunidades abertas pela rede do SPM: apoio a coletivos migrantes, bolsas de formação, seleções e chamadas de projeto."
                crumbs={[{ label: 'Publicações', link: '/publicacoes' }, { label: 'Editais' }]}
                waveFill="#f8f9fa"
            />

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Processos em curso</span>
                        <h2>Editais e chamadas</h2>
                        <p>
                            Todos os nossos processos seletivos são públicos e têm resultado
                            divulgado nesta página. Leia o edital completo antes de se inscrever.
                        </p>
                    </Animate>

                    <Animate as="ul" className="pill-nav">
                        {STATUS_FILTERS.map((status) => (
                            <li key={status}>
                                <button
                                    type="button"
                                    className={activeStatus === status ? 'is-active' : undefined}
                                    onClick={() => setActiveStatus(status)}
                                >
                                    {filterLabel(status)}
                                </button>
                            </li>
                        ))}
                    </Animate>

                    <div className="grid grid--2">
                        {filtered.map((edital) => (
                            <Animate className="card" key={edital.id}>
                                <div className="edital-head">
                                    <span className="edital-code">{edital.code}</span>
                                    <span className={EDITAL_STATUS_CLASS[edital.status]}>
                                        {EDITAL_STATUS_LABEL[edital.status]}
                                    </span>
                                </div>
                                <h3>{edital.title}</h3>
                                <p>{edital.description}</p>
                                <ul className="edital-meta">
                                    <li>
                                        <i className="fas fa-calendar-day"></i>{' '}
                                        {edital.deadlineText}
                                    </li>
                                    <li>
                                        <i className="fas fa-location-dot"></i> {edital.scope}
                                    </li>
                                </ul>
                                {edital.fileUrl ? (
                                    <a
                                        className="card__link"
                                        href={edital.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        <i className="fas fa-file-pdf"></i> Baixar edital completo
                                    </a>
                                ) : (
                                    // Sem arquivo anexado não existe link: um <a> inerte prometeria
                                    // um download que não acontece e ainda seria focável pelo teclado.
                                    <span className="card__link">
                                        <i className="fas fa-file-pdf"></i> PDF ainda não disponível
                                    </span>
                                )}
                            </Animate>
                        ))}
                    </div>

                    {!filtered.length && (
                        <div className="empty-state">
                            <i className="fas fa-bullhorn"></i>
                            <h3>
                                {editais.length
                                    ? 'Nenhum edital com esse status'
                                    : 'Nenhum edital publicado no momento'}
                            </h3>
                            <p>
                                {editais.length
                                    ? 'Selecione outro filtro ou volte a “Todos” para ver o histórico completo.'
                                    : 'Assim que uma nova chamada for aberta, ela será publicada aqui.'}
                            </p>
                        </div>
                    )}
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Como participar</span>
                        <h2>Três passos, sem burocracia desnecessária</h2>
                    </Animate>

                    <div className="grid grid--3">
                        <Animate className="numbered-card">
                            <span className="numbered-card__num">01</span>
                            <h3>Leia o edital</h3>
                            <p>
                                Cada chamada tem critérios próprios de elegibilidade, documentos
                                exigidos e cronograma. Tudo está no PDF.
                            </p>
                        </Animate>
                        <Animate className="numbered-card delay-100">
                            <span className="numbered-card__num">02</span>
                            <h3>Envie a proposta</h3>
                            <p>
                                A inscrição é gratuita e feita por e-mail ou formulário indicado no
                                edital. Aceitamos propostas em português, espanhol e francês.
                            </p>
                        </Animate>
                        <Animate className="numbered-card delay-200">
                            <span className="numbered-card__num">03</span>
                            <h3>Acompanhe o resultado</h3>
                            <p>
                                Resultados e recursos são publicados nesta página e enviados a todas
                                as propostas inscritas.
                            </p>
                        </Animate>
                    </div>

                    <Animate className="callout callout--action">
                        <i className="fas fa-circle-question"></i>
                        <p>
                            <strong>Dúvidas sobre um edital?</strong> Escreva para{' '}
                            <a href="mailto:editais@spmnacional.org.br">
                                editais@spmnacional.org.br
                            </a>{' '}
                            informando o número do edital. Respondemos em até 5 dias úteis e
                            publicamos as perguntas mais frequentes como adendo ao processo.
                        </p>
                    </Animate>
                </div>
            </section>

            <PageCta
                title="Sua iniciativa merece ser conhecida"
                text="Se você faz parte de um coletivo de migrantes ou de um grupo de acolhida, escreva para nós — mesmo fora de edital, ajudamos a articular apoio e parcerias."
                primaryLabel="Apresentar iniciativa"
                primaryLink="/fale-conosco"
                secondaryLabel="Ver publicações"
                secondaryLink="/publicacoes"
            />
        </>
    );
}
