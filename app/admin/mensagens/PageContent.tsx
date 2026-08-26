'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ContactStatus } from '@/lib/generated/prisma/enums';
import { CONTACT_STATUS_CLASS, CONTACT_STATUS_LABEL } from '@/lib/labels';
import { definirStatusMensagem } from './actions';

export interface MessageRow {
    id: string;
    name: string;
    email: string;
    city: string | null;
    subject: string;
    preview: string;
    status: ContactStatus;
    assignedTo: string | null;
    respondedAt: string | null;
    createdAt: string;
}

interface PageContentProps {
    messages: MessageRow[];
    counts: {
        novas: number;
        emAtendimento: number;
        respondidas: number;
        arquivadas: number;
    };
}

const STATUS_OPTIONS: { value: 'todos' | ContactStatus; label: string }[] = [
    { value: 'todos', label: 'Todos os status' },
    { value: 'NOVA', label: 'Novas' },
    { value: 'EM_ATENDIMENTO', label: 'Em atendimento' },
    { value: 'RESPONDIDA', label: 'Respondidas' },
    { value: 'ARQUIVADA', label: 'Arquivadas' },
];

export default function PageContent({ messages, counts }: PageContentProps) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'todos' | ContactStatus>('todos');

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();

        return messages.filter((item) => {
            const matchesTerm =
                !term ||
                item.name.toLowerCase().includes(term) ||
                item.email.toLowerCase().includes(term) ||
                item.subject.toLowerCase().includes(term) ||
                item.preview.toLowerCase().includes(term) ||
                (item.city ?? '').toLowerCase().includes(term);
            const matchesStatus = statusFilter === 'todos' || item.status === statusFilter;
            return matchesTerm && matchesStatus;
        });
    }, [messages, search, statusFilter]);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> / Atendimento
                    </div>
                    <h1>Mensagens</h1>
                    <p>
                        Tudo o que chega pelo formulário do Fale Conosco. Atribua um responsável,
                        acompanhe o status e registre o que foi feito.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/fale-conosco">
                        <i className="fas fa-arrow-up-right-from-square"></i> Ver formulário público
                    </Link>
                </div>
            </div>

            <div className="anote">
                <i className="fas fa-user-shield"></i>
                <div>
                    <strong>Dado de terceiro.</strong> As mensagens contêm dados pessoais de quem
                    escreveu. A abertura de cada mensagem e toda mudança de status ficam registradas
                    no log de auditoria. Use as informações apenas para responder à solicitação.
                </div>
            </div>

            <div className="agrid agrid--4" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-tile is-action">
                    <span className="stat-tile__icon">
                        <i className="fas fa-envelope"></i>
                    </span>
                    <div>
                        <strong>{counts.novas}</strong>
                        <span>Novas</span>
                    </div>
                </div>
                <div className="stat-tile is-warning">
                    <span className="stat-tile__icon">
                        <i className="fas fa-headset"></i>
                    </span>
                    <div>
                        <strong>{counts.emAtendimento}</strong>
                        <span>Em atendimento</span>
                    </div>
                </div>
                <div className="stat-tile is-success">
                    <span className="stat-tile__icon">
                        <i className="fas fa-reply"></i>
                    </span>
                    <div>
                        <strong>{counts.respondidas}</strong>
                        <span>Respondidas</span>
                    </div>
                </div>
                <div className="stat-tile">
                    <span className="stat-tile__icon">
                        <i className="fas fa-box-archive"></i>
                    </span>
                    <div>
                        <strong>{counts.arquivadas}</strong>
                        <span>Arquivadas</span>
                    </div>
                </div>
            </div>

            <div className="acard">
                <div className="atoolbar">
                    <input
                        className="atoolbar__search"
                        type="search"
                        placeholder="Buscar por nome, e-mail, assunto ou cidade…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'todos' | ContactStatus)}
                    >
                        {STATUS_OPTIONS.map((option) => (
                            <option value={option.value} key={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>

                    <span className="atoolbar__spacer"></span>
                    <span style={{ fontSize: '0.82rem', color: '#7b8a9a' }}>
                        {filtered.length} de {messages.length} registros
                    </span>
                </div>

                {filtered.length ? (
                    <div className="atable-wrap">
                        <table className="atable">
                            <thead>
                                <tr>
                                    <th>Remetente</th>
                                    <th>Assunto</th>
                                    <th>Responsável</th>
                                    <th>Recebida em</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="atable__cell-media">
                                                <span>
                                                    <span className="atable__title">
                                                        {item.name}
                                                    </span>
                                                    <span className="atable__sub">
                                                        {item.email}
                                                        {item.city ? ` · ${item.city}` : ''}
                                                    </span>
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="atable__title">{item.subject}</span>
                                            <span className="atable__sub">{item.preview}</span>
                                        </td>
                                        <td>{item.assignedTo ?? '—'}</td>
                                        <td>{item.createdAt}</td>
                                        <td>
                                            <span className={CONTACT_STATUS_CLASS[item.status]}>
                                                {CONTACT_STATUS_LABEL[item.status]}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="atable__actions">
                                                {item.status !== 'EM_ATENDIMENTO' &&
                                                    item.status !== 'RESPONDIDA' && (
                                                        <form action={definirStatusMensagem}>
                                                            <input
                                                                type="hidden"
                                                                name="id"
                                                                value={item.id}
                                                            />
                                                            <input
                                                                type="hidden"
                                                                name="status"
                                                                value="EM_ATENDIMENTO"
                                                            />
                                                            <button
                                                                className="abtn abtn--ghost abtn--sm"
                                                                title="Assumir o atendimento"
                                                            >
                                                                <i className="fas fa-headset"></i>
                                                            </button>
                                                        </form>
                                                    )}
                                                {item.status !== 'ARQUIVADA' && (
                                                    <form action={definirStatusMensagem}>
                                                        <input
                                                            type="hidden"
                                                            name="id"
                                                            value={item.id}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="status"
                                                            value="ARQUIVADA"
                                                        />
                                                        <button
                                                            className="abtn abtn--ghost abtn--sm"
                                                            title="Arquivar"
                                                        >
                                                            <i className="fas fa-box-archive"></i>
                                                        </button>
                                                    </form>
                                                )}
                                                <Link
                                                    className="abtn abtn--ghost abtn--sm"
                                                    href={`/admin/mensagens/${item.id}`}
                                                    title="Abrir mensagem"
                                                >
                                                    <i className="fas fa-envelope-open-text"></i>
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="aempty">
                        <i className="fas fa-envelope-open-text"></i>
                        <strong>Nenhuma mensagem encontrada</strong>
                        <span>Ajuste a busca ou o filtro de status.</span>
                    </div>
                )}
            </div>
        </>
    );
}
