'use client';

import Link from 'next/link';
import { criarEdicao, excluirEdicao } from './actions';
import EdicaoForm, { EMPTY_EDICAO } from './EdicaoForm';

export interface EdicaoRow {
    id: string;
    ano: number;
    edicao: string;
    tema: string;
    lema: string;
    periodo: string;
    published: boolean;
    materiais: number;
    programacao: number;
    updatedAt: string;
}

interface PageContentProps {
    edicoes: EdicaoRow[];
}

export default function PageContent({ edicoes }: PageContentProps) {
    const publicadas = edicoes.filter((edicao) => edicao.published).length;
    const materiais = edicoes.reduce((total, edicao) => total + edicao.materiais, 0);
    const atividades = edicoes.reduce((total, edicao) => total + edicao.programacao, 0);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> / Conteúdo
                    </div>
                    <h1>Semana do Migrante</h1>
                    <p>
                        Cada edição reúne tema, lema, período, texto de abertura, objetivos,
                        materiais de apoio e programação da semana.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/semana-do-migrante">
                        <i className="fas fa-arrow-up-right-from-square"></i> Ver página pública
                    </Link>
                </div>
            </div>

            <div className="agrid agrid--3" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-tile is-success">
                    <span className="stat-tile__icon">
                        <i className="fas fa-calendar-days"></i>
                    </span>
                    <div>
                        <strong>{publicadas}</strong>
                        <span>Edições publicadas</span>
                    </div>
                </div>
                <div className="stat-tile">
                    <span className="stat-tile__icon">
                        <i className="fas fa-file-lines"></i>
                    </span>
                    <div>
                        <strong>{materiais}</strong>
                        <span>Materiais de apoio</span>
                    </div>
                </div>
                <div className="stat-tile is-action">
                    <span className="stat-tile__icon">
                        <i className="fas fa-list-check"></i>
                    </span>
                    <div>
                        <strong>{atividades}</strong>
                        <span>Atividades na programação</span>
                    </div>
                </div>
            </div>

            <div className="acard">
                <div className="acard__head">
                    <div>
                        <h2>Edições cadastradas</h2>
                        <p>Abra uma edição para gerenciar materiais e programação.</p>
                    </div>
                </div>

                {edicoes.length ? (
                    <div className="atable-wrap">
                        <table className="atable">
                            <thead>
                                <tr>
                                    <th>Edição</th>
                                    <th>Período</th>
                                    <th>Materiais</th>
                                    <th>Programação</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {edicoes.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <span className="atable__title">
                                                {item.ano} · {item.tema}
                                            </span>
                                            <span className="atable__sub">
                                                {item.edicao} — {item.lema}
                                            </span>
                                        </td>
                                        <td>{item.periodo}</td>
                                        <td>{item.materiais}</td>
                                        <td>{item.programacao}</td>
                                        <td>
                                            <span
                                                className={
                                                    item.published
                                                        ? 'abadge abadge--publicado'
                                                        : 'abadge abadge--rascunho'
                                                }
                                            >
                                                {item.published ? 'publicada' : 'oculta'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="atable__actions">
                                                <Link
                                                    className="abtn abtn--ghost abtn--sm"
                                                    href={`/admin/semana/${item.ano}`}
                                                    title="Abrir edição"
                                                >
                                                    <i className="fas fa-pen"></i>
                                                </Link>
                                                <form
                                                    action={excluirEdicao}
                                                    onSubmit={(submitEvent) => {
                                                        const confirmed = window.confirm(
                                                            `Excluir a edição de ${item.ano}, incluindo seus materiais e sua programação? Esta ação não pode ser desfeita.`,
                                                        );
                                                        if (!confirmed)
                                                            submitEvent.preventDefault();
                                                    }}
                                                >
                                                    <input
                                                        type="hidden"
                                                        name="id"
                                                        value={item.id}
                                                    />
                                                    <button
                                                        type="submit"
                                                        className="abtn abtn--danger abtn--sm"
                                                        title="Excluir edição, materiais e programação"
                                                        aria-label={`Excluir a edição de ${item.ano}, seus materiais e sua programação`}
                                                    >
                                                        <i
                                                            className="fas fa-trash"
                                                            aria-hidden="true"
                                                        ></i>
                                                    </button>
                                                </form>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="aempty">
                        <i className="fas fa-calendar-days"></i>
                        <strong>Nenhuma edição cadastrada</strong>
                        <span>Use o formulário abaixo para criar a primeira.</span>
                    </div>
                )}
            </div>

            <EdicaoForm
                action={criarEdicao}
                defaults={EMPTY_EDICAO}
                title="Nova edição"
                description="Cria a edição do ano com o texto que abre a página pública."
                submitLabel="Criar edição"
            />
        </>
    );
}
