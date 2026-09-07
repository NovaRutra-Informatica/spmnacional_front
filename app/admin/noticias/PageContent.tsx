'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { PostStatus } from '@/lib/generated/prisma/enums';
import { POST_STATUS_CLASS, POST_STATUS_LABEL } from '@/lib/labels';
import { alternarDestaque, alternarPublicacao, excluirNoticia } from './actions';

export interface NoticiaLinha {
    id: string;
    slug: string;
    title: string;
    cover: string | null;
    categoryId: string;
    categoryName: string;
    author: string;
    /** Já formatada no servidor. */
    date: string;
    views: number;
    status: PostStatus;
    highlight: boolean;
    tags: string[];
}

export interface CategoriaOpcao {
    id: string;
    name: string;
}

interface Contagens {
    publicadas: number;
    rascunhos: number;
    revisao: number;
    agendadas: number;
}

interface Props {
    noticias: NoticiaLinha[];
    categorias: CategoriaOpcao[];
    contagens: Contagens;
}

const STATUS_FILTROS: { value: 'todos' | PostStatus; label: string }[] = [
    { value: 'todos', label: 'Todos os status' },
    { value: 'PUBLICADO', label: 'Publicado' },
    { value: 'RASCUNHO', label: 'Rascunho' },
    { value: 'REVISAO', label: 'Em revisão' },
    { value: 'AGENDADO', label: 'Agendado' },
];

export default function PageContent({ noticias, categorias, contagens }: Props) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'todos' | PostStatus>('todos');
    const [categoryFilter, setCategoryFilter] = useState('todas');

    const filtered = useMemo<NoticiaLinha[]>(() => {
        const term = search.trim().toLowerCase();

        return noticias.filter((item) => {
            const matchesTerm =
                !term ||
                item.title.toLowerCase().includes(term) ||
                item.author.toLowerCase().includes(term) ||
                item.tags.some((tag) => tag.toLowerCase().includes(term));
            const matchesStatus = statusFilter === 'todos' || item.status === statusFilter;
            const matchesCategory =
                categoryFilter === 'todas' || item.categoryId === categoryFilter;
            return matchesTerm && matchesStatus && matchesCategory;
        });
    }, [noticias, search, statusFilter, categoryFilter]);

    /**
     * Cancelar no `click` impede o envio antes de o navegador disparar o submit —
     * mais confiável do que tentar barrar a Server Action depois.
     */
    const confirmarExclusao = (event: MouseEvent<HTMLButtonElement>, titulo: string) => {
        if (!confirm(`Excluir definitivamente a notícia “${titulo}”?`)) {
            event.preventDefault();
        }
    };

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> / Conteúdo
                    </div>
                    <h1>Notícias</h1>
                    <p>
                        Gerencie tudo o que aparece no blog do site: crie, revise, agende, destaque
                        na home ou despublique.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/publicacoes/blog">
                        <i className="fas fa-arrow-up-right-from-square"></i> Ver blog público
                    </Link>
                    <Link className="abtn abtn--action" href="/admin/noticias/nova">
                        <i className="fas fa-plus"></i> Nova notícia
                    </Link>
                </div>
            </div>

            <div className="agrid agrid--4" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-tile is-success">
                    <span className="stat-tile__icon">
                        <i className="fas fa-circle-check"></i>
                    </span>
                    <div>
                        <strong>{contagens.publicadas}</strong>
                        <span>Publicadas</span>
                    </div>
                </div>
                <div className="stat-tile">
                    <span className="stat-tile__icon">
                        <i className="fas fa-pen"></i>
                    </span>
                    <div>
                        <strong>{contagens.rascunhos}</strong>
                        <span>Rascunhos</span>
                    </div>
                </div>
                <div className="stat-tile is-warning">
                    <span className="stat-tile__icon">
                        <i className="fas fa-eye"></i>
                    </span>
                    <div>
                        <strong>{contagens.revisao}</strong>
                        <span>Aguardando revisão</span>
                    </div>
                </div>
                <div className="stat-tile is-action">
                    <span className="stat-tile__icon">
                        <i className="fas fa-clock"></i>
                    </span>
                    <div>
                        <strong>{contagens.agendadas}</strong>
                        <span>Agendadas</span>
                    </div>
                </div>
            </div>

            <div className="acard">
                <div className="atoolbar">
                    <input
                        className="atoolbar__search"
                        type="search"
                        aria-label="Buscar notícias"
                        placeholder="Buscar por título, autor ou tag…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <select
                        aria-label="Filtrar notícias por status"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'todos' | PostStatus)}
                    >
                        {STATUS_FILTROS.map((s) => (
                            <option value={s.value} key={s.value}>
                                {s.label}
                            </option>
                        ))}
                    </select>

                    <select
                        aria-label="Filtrar notícias por categoria"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        <option value="todas">Todas as categorias</option>
                        {categorias.map((c) => (
                            <option value={c.id} key={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>

                    <span className="atoolbar__spacer"></span>
                    <span className="atoolbar__count">
                        {filtered.length} de {noticias.length} registros
                    </span>
                </div>

                {filtered.length ? (
                    <div className="atable-wrap">
                        <table className="atable">
                            <thead>
                                <tr>
                                    <th>Publicação</th>
                                    <th>Categoria</th>
                                    <th>Data</th>
                                    <th>Visualizações</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="atable__cell-media">
                                                <span
                                                    className="atable__thumb"
                                                    style={
                                                        item.cover
                                                            ? {
                                                                  backgroundImage: `url(${item.cover})`,
                                                              }
                                                            : { backgroundColor: '#eef2f6' }
                                                    }
                                                ></span>
                                                <span>
                                                    <span className="atable__title">
                                                        {item.highlight && (
                                                            <i
                                                                className="fas fa-star"
                                                                style={{
                                                                    color: '#e0a800',
                                                                    marginRight: '0.35rem',
                                                                }}
                                                                title="Destaque na home"
                                                            ></i>
                                                        )}
                                                        {item.title}
                                                    </span>
                                                    <span className="atable__sub">
                                                        /{item.slug}
                                                    </span>
                                                </span>
                                            </div>
                                        </td>
                                        <td>{item.categoryName}</td>
                                        <td>{item.date}</td>
                                        <td>{item.views}</td>
                                        <td>
                                            <span className={POST_STATUS_CLASS[item.status]}>
                                                {POST_STATUS_LABEL[item.status]}
                                            </span>
                                        </td>
                                        <td>
                                            <form action={alternarDestaque}>
                                                <input type="hidden" name="id" value={item.id} />
                                                <div className="atable__actions">
                                                    <button
                                                        className="abtn abtn--ghost abtn--sm"
                                                        type="submit"
                                                        title={
                                                            item.highlight
                                                                ? 'Remover destaque'
                                                                : 'Destacar na home'
                                                        }
                                                    >
                                                        <i className="fas fa-star"></i>
                                                    </button>
                                                    <button
                                                        className="abtn abtn--ghost abtn--sm"
                                                        type="submit"
                                                        formAction={alternarPublicacao}
                                                        title={
                                                            item.status === 'PUBLICADO'
                                                                ? 'Despublicar'
                                                                : 'Publicar'
                                                        }
                                                    >
                                                        <i
                                                            className={`fas ${
                                                                item.status === 'PUBLICADO'
                                                                    ? 'fa-eye-slash'
                                                                    : 'fa-paper-plane'
                                                            }`}
                                                        ></i>
                                                    </button>
                                                    <Link
                                                        className="abtn abtn--ghost abtn--sm"
                                                        href={`/admin/noticias/${item.id}`}
                                                        title="Editar"
                                                    >
                                                        <i className="fas fa-pen"></i>
                                                    </Link>
                                                    <button
                                                        className="abtn abtn--danger abtn--sm"
                                                        type="submit"
                                                        formAction={excluirNoticia}
                                                        onClick={(event) =>
                                                            confirmarExclusao(event, item.title)
                                                        }
                                                        title="Excluir"
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </form>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="aempty">
                        <i className="fas fa-newspaper"></i>
                        <strong>Nenhuma notícia encontrada</strong>
                        <span>Ajuste os filtros ou crie uma nova publicação.</span>
                    </div>
                )}
            </div>
        </>
    );
}
