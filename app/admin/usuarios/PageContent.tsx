'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState, type MouseEvent } from 'react';
import type { UserStatus } from '@/lib/generated/prisma/enums';
import { USER_STATUS_CLASS, USER_STATUS_LABEL } from '@/lib/labels';
import { executarAcaoUsuario } from './actions';

export interface UserRow {
    id: string;
    name: string;
    email: string;
    initials: string;
    status: UserStatus;
    roleId: string;
    roleName: string;
    regionalName: string;
    lastAccess: string;
}

export interface RoleOption {
    id: string;
    name: string;
}

interface Counts {
    total: number;
    active: number;
    pending: number;
    inactive: number;
}

interface Props {
    users: UserRow[];
    roles: RoleOption[];
    currentUserId: string;
    canManagePermissions: boolean;
    counts: Counts;
}

/** Espelha `ActionState`; o módulo original é server-only e não pode vir para cá. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

export default function PageContent({
    users,
    roles,
    currentUserId,
    canManagePermissions,
    counts,
}: Props) {
    const [state, formAction, pending] = useActionState<FormState, FormData>(executarAcaoUsuario, {
        ok: false,
    });

    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('todos');
    const [statusFilter, setStatusFilter] = useState<'todos' | UserStatus>('todos');

    const filtered = useMemo<UserRow[]>(() => {
        const term = search.trim().toLowerCase();

        return users.filter((user) => {
            const matchesTerm =
                !term ||
                user.name.toLowerCase().includes(term) ||
                user.email.toLowerCase().includes(term) ||
                user.regionalName.toLowerCase().includes(term);
            const matchesRole = roleFilter === 'todos' || user.roleId === roleFilter;
            const matchesStatus = statusFilter === 'todos' || user.status === statusFilter;
            return matchesTerm && matchesRole && matchesStatus;
        });
    }, [users, search, roleFilter, statusFilter]);

    const inviteUrl = typeof state.data?.inviteUrl === 'string' ? state.data.inviteUrl : null;

    const confirmarRemocao = (event: MouseEvent<HTMLButtonElement>, name: string) => {
        if (!window.confirm(`Remover o acesso de ${name}? Esta ação não pode ser desfeita.`)) {
            event.preventDefault();
        }
    };

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> / Pessoas e acessos
                    </div>
                    <h1>Usuários</h1>
                    <p>
                        Quem tem acesso ao painel, com qual perfil e em qual regional. Desative
                        contas que não estão mais em uso.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    {canManagePermissions && (
                        <Link className="abtn abtn--ghost" href="/admin/acessos">
                            <i className="fas fa-shield-halved"></i> Perfis e permissões
                        </Link>
                    )}
                    <Link className="abtn abtn--action" href="/admin/usuarios/novo">
                        <i className="fas fa-user-plus"></i> Convidar usuário
                    </Link>
                </div>
            </div>

            {state.message && (
                <div className={state.ok ? 'anote anote--success' : 'anote anote--warning'}>
                    <i
                        className={`fas ${
                            state.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'
                        }`}
                    ></i>
                    <div>
                        {state.message}
                        {inviteUrl && (
                            <>
                                <br />
                                <strong style={{ wordBreak: 'break-all' }}>{inviteUrl}</strong>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="agrid agrid--4" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-tile">
                    <span className="stat-tile__icon">
                        <i className="fas fa-users"></i>
                    </span>
                    <div>
                        <strong>{counts.total}</strong>
                        <span>Contas cadastradas</span>
                    </div>
                </div>
                <div className="stat-tile is-success">
                    <span className="stat-tile__icon">
                        <i className="fas fa-user-check"></i>
                    </span>
                    <div>
                        <strong>{counts.active}</strong>
                        <span>Ativas</span>
                    </div>
                </div>
                <div className="stat-tile is-warning">
                    <span className="stat-tile__icon">
                        <i className="fas fa-envelope"></i>
                    </span>
                    <div>
                        <strong>{counts.pending}</strong>
                        <span>Convites pendentes</span>
                    </div>
                </div>
                <div className="stat-tile">
                    <span className="stat-tile__icon">
                        <i className="fas fa-user-slash"></i>
                    </span>
                    <div>
                        <strong>{counts.inactive}</strong>
                        <span>Desativadas</span>
                    </div>
                </div>
            </div>

            <div className="acard">
                <div className="atoolbar">
                    <input
                        className="atoolbar__search"
                        type="search"
                        aria-label="Buscar usuários"
                        placeholder="Buscar por nome, e-mail ou regional…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <select
                        aria-label="Filtrar usuários por perfil"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                    >
                        <option value="todos">Todos os perfis</option>
                        {roles.map((role) => (
                            <option value={role.id} key={role.id}>
                                {role.name}
                            </option>
                        ))}
                    </select>

                    <select
                        aria-label="Filtrar usuários por status"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'todos' | UserStatus)}
                    >
                        <option value="todos">Todos os status</option>
                        <option value="ATIVO">Ativo</option>
                        <option value="PENDENTE">Pendente</option>
                        <option value="INATIVO">Inativo</option>
                    </select>

                    <span className="atoolbar__spacer"></span>
                    <span className="atoolbar__count">
                        {filtered.length} de {counts.total} contas
                    </span>
                </div>

                {filtered.length ? (
                    <div className="atable-wrap">
                        <table className="atable">
                            <thead>
                                <tr>
                                    <th>Usuário</th>
                                    <th>Perfil</th>
                                    <th>Regional</th>
                                    <th>Último acesso</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((user) => {
                                    const isSelf = user.id === currentUserId;
                                    const isActive = user.status === 'ATIVO';

                                    return (
                                        <tr key={user.id}>
                                            <td>
                                                <div className="atable__cell-media">
                                                    <span className="aavatar">{user.initials}</span>
                                                    <span>
                                                        <span className="atable__title">
                                                            {user.name}
                                                        </span>
                                                        <span className="atable__sub">
                                                            {user.email}
                                                        </span>
                                                    </span>
                                                </div>
                                            </td>
                                            <td>{user.roleName}</td>
                                            <td>{user.regionalName}</td>
                                            <td className="atable__sub">{user.lastAccess}</td>
                                            <td>
                                                <span className={USER_STATUS_CLASS[user.status]}>
                                                    {USER_STATUS_LABEL[user.status]}
                                                </span>
                                            </td>
                                            <td>
                                                <form action={formAction}>
                                                    <input
                                                        type="hidden"
                                                        name="id"
                                                        value={user.id}
                                                    />
                                                    <div className="atable__actions">
                                                        <button
                                                            className="abtn abtn--ghost abtn--sm"
                                                            name="intent"
                                                            value={
                                                                isActive ? 'desativar' : 'ativar'
                                                            }
                                                            disabled={
                                                                pending || (isSelf && isActive)
                                                            }
                                                            title={
                                                                isSelf && isActive
                                                                    ? 'Você não pode desativar a própria conta'
                                                                    : isActive
                                                                      ? 'Desativar acesso'
                                                                      : user.status === 'PENDENTE'
                                                                        ? 'Ativar sem esperar o aceite do convite (o link enviado deixa de valer)'
                                                                        : 'Reativar acesso'
                                                            }
                                                        >
                                                            <i
                                                                className={`fas${
                                                                    isActive
                                                                        ? ' fa-user-slash'
                                                                        : ' fa-user-check'
                                                                }`}
                                                            ></i>
                                                        </button>

                                                        {user.status === 'PENDENTE' && (
                                                            <button
                                                                className="abtn abtn--ghost abtn--sm"
                                                                name="intent"
                                                                value="reenviar-convite"
                                                                disabled={pending}
                                                                title="Reenviar convite"
                                                            >
                                                                <i className="fas fa-paper-plane"></i>
                                                            </button>
                                                        )}

                                                        <Link
                                                            className="abtn abtn--ghost abtn--sm"
                                                            href={`/admin/usuarios/${user.id}`}
                                                            title="Editar"
                                                        >
                                                            <i className="fas fa-pen"></i>
                                                        </Link>

                                                        <button
                                                            className="abtn abtn--danger abtn--sm"
                                                            name="intent"
                                                            value="remover"
                                                            onClick={(event) =>
                                                                confirmarRemocao(event, user.name)
                                                            }
                                                            disabled={pending || isSelf}
                                                            style={{ opacity: isSelf ? 0.4 : 1 }}
                                                            title={
                                                                isSelf
                                                                    ? 'Você não pode remover a própria conta'
                                                                    : 'Remover'
                                                            }
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    </div>
                                                </form>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="aempty">
                        <i className="fas fa-users"></i>
                        <strong>Nenhum usuário encontrado</strong>
                        <span>Ajuste a busca ou os filtros de perfil e status.</span>
                    </div>
                )}
            </div>
        </>
    );
}
