'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Animate from '@/components/Animate';
import AnimateLink from '@/components/AnimateLink';
import PageHero from '@/components/PageHero';
import PageCta from '@/components/PageCta';
import { DocumentoCategoria } from '@/lib/generated/prisma/enums';
import { DOCUMENTO_CATEGORIA_LABEL } from '@/lib/labels';

export interface DocumentoItem {
    id: string;
    title: string;
    category: DocumentoCategoria;
    meta: string;
    icon: string;
    fileUrl: string | null;
}

interface PageContentProps {
    documentos: DocumentoItem[];
}

type CategoryFilter = 'Todos' | DocumentoCategoria;

// "Todos" continua primeiro; o restante segue a ordem declarada no enum do banco.
const CATEGORY_FILTERS: CategoryFilter[] = ['Todos', ...Object.values(DocumentoCategoria)];

function filterLabel(filter: CategoryFilter): string {
    return filter === 'Todos' ? 'Todos' : DOCUMENTO_CATEGORIA_LABEL[filter];
}

export default function PageContent({ documentos }: PageContentProps) {
    const [activeCategory, setActiveCategory] = useState<CategoryFilter>('Todos');

    const filteredDocs = useMemo(
        () =>
            activeCategory === 'Todos'
                ? documentos
                : documentos.filter((doc) => doc.category === activeCategory),
        [activeCategory, documentos],
    );

    // O conteúdo é o mesmo com ou sem arquivo; só muda o elemento que o envolve.
    const docBody = (doc: DocumentoItem): ReactNode => (
        <>
            <span className="doc-item__icon">
                <i className={'fas ' + doc.icon}></i>
            </span>
            <span className="doc-item__info">
                <strong>{doc.title}</strong>
                <span>
                    {DOCUMENTO_CATEGORIA_LABEL[doc.category]} · {doc.meta}
                </span>
            </span>
            <span className="doc-item__action">
                {doc.fileUrl ? (
                    <>
                        <i className="fas fa-download"></i> Baixar
                    </>
                ) : (
                    'Em breve'
                )}
            </span>
        </>
    );

    return (
        <>
            <PageHero
                eyebrow="Acervo"
                title="Documentos"
                subtitle="Estatuto, cartas de assembleia, notas públicas, subsídios de formação e relatórios — reunidos em um só lugar."
                crumbs={[{ label: 'Quem Somos', link: '/quem-somos' }, { label: 'Documentos' }]}
                waveFill="#f8f9fa"
            />

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Biblioteca institucional</span>
                        <h2>Tudo o que assinamos é público</h2>
                        <p>
                            Transparência não é um selo: é prática. Aqui ficam os documentos que
                            orientam nossa ação e as posições que tornamos públicas.
                        </p>
                    </Animate>

                    <Animate as="ul" className="pill-nav">
                        {CATEGORY_FILTERS.map((cat) => (
                            <li key={cat}>
                                <button
                                    type="button"
                                    className={activeCategory === cat ? 'is-active' : undefined}
                                    onClick={() => setActiveCategory(cat)}
                                >
                                    {filterLabel(cat)}
                                </button>
                            </li>
                        ))}
                    </Animate>

                    <Animate className="doc-list">
                        {filteredDocs.map((doc) =>
                            doc.fileUrl ? (
                                <a className="doc-item" href={doc.fileUrl} download key={doc.id}>
                                    {docBody(doc)}
                                </a>
                            ) : (
                                // Sem arquivo anexado não existe link: um <a> inerte prometeria um
                                // download que não acontece e ainda seria focável pelo teclado.
                                <div className="doc-item" key={doc.id}>
                                    {docBody(doc)}
                                </div>
                            ),
                        )}
                    </Animate>

                    {!filteredDocs.length && (
                        <div className="empty-state">
                            <i className="fas fa-folder-open"></i>
                            <h3>
                                {documentos.length
                                    ? 'Nenhum documento nesta categoria'
                                    : 'Nenhum documento publicado no momento'}
                            </h3>
                            <p>
                                {documentos.length
                                    ? 'Escolha outra categoria ou volte a “Todos” para ver o acervo completo.'
                                    : 'O acervo está sendo organizado. Escreva para o secretariado nacional se precisar de um material específico.'}
                            </p>
                        </div>
                    )}

                    <Animate className="callout callout--action">
                        <i className="fas fa-envelope-open-text"></i>
                        <p>
                            <strong>Procura um documento antigo?</strong> Nosso acervo histórico
                            inclui atas, boletins e subsídios desde 1986. Escreva para{' '}
                            <a href="mailto:secretaria@spmnacional.org.br">
                                secretaria@spmnacional.org.br
                            </a>{' '}
                            e a equipe do secretariado nacional localiza o material para você.
                        </p>
                    </Animate>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Também pode interessar</span>
                        <h2>Outros acervos do SPM</h2>
                    </Animate>

                    <div className="grid grid--3">
                        <AnimateLink href="/legislacao" className="card">
                            <div className="card__icon">
                                <i className="fas fa-scale-balanced"></i>
                            </div>
                            <h3>Legislação</h3>
                            <p>
                                A Lei de Migração, a política municipal de São Paulo e o decreto que
                                a regulamenta, explicados em linguagem acessível.
                            </p>
                            <span className="card__link">
                                Acessar <i className="fas fa-arrow-right"></i>
                            </span>
                        </AnimateLink>

                        <AnimateLink href="/semana-do-migrante" className="card delay-100">
                            <div className="card__icon">
                                <i className="fas fa-calendar-days"></i>
                            </div>
                            <h3>Materiais da Semana do Migrante</h3>
                            <p>
                                Textos-base, cartazes, roteiros de celebração e círculos bíblicos de
                                cada edição.
                            </p>
                            <span className="card__link">
                                Acessar <i className="fas fa-arrow-right"></i>
                            </span>
                        </AnimateLink>

                        <AnimateLink href="/transparencia" className="card delay-200">
                            <div className="card__icon">
                                <i className="fas fa-magnifying-glass-chart"></i>
                            </div>
                            <h3>Transparência</h3>
                            <p>
                                De onde vêm e para onde vão os recursos que sustentam a rede do SPM
                                em todo o Brasil.
                            </p>
                            <span className="card__link">
                                Acessar <i className="fas fa-arrow-right"></i>
                            </span>
                        </AnimateLink>
                    </div>
                </div>
            </section>

            <PageCta />
        </>
    );
}
