'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { UserStatus } from '@/lib/generated/prisma/enums';
import { USER_STATUS_CLASS, USER_STATUS_LABEL } from '@/lib/labels';
import { atualizarUsuario, encerrarSessoesUsuario } from '../actions';
import { initialsFrom } from '../initials';

export interface RoleOption {
    id: string;
    name: string;
    description: string;
}

export interface RegionalOption {
    id: string;
    name: string;
}

interface UserDetail {
    id: string;
    name: string;
    email: string;
    initials: string;
    status: UserStatus;
    roleId: string;
    roleName: string;
    regionalId: string;
    mfaRequired: boolean;
    lastAccess: string;
    createdAt: string;
    inviteExpiresAt: string | null;
}

interface Props {
    user: UserDetail;
    roles: RoleOption[];
    regionais: RegionalOption[];
    sessoesAtivas: number;
    isSelf: boolean;
}

/** Espelha `ActionState`; o módulo original é server-only e não pode vir para cá. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const ERROR_STYLE = { color: '#c2185b' };

export default function PageContent({ user, roles, regionais, sessoesAtivas, isSelf }: Props) {
    const [state, formAction, pending] = useActionState<FormState, FormData>(atualizarUsuario, {
        ok: false,
    });
    const [sessionState, sessionAction, sessionPending] = useActionState<FormState, FormData>(
        encerrarSessoesUsuario,
        { ok: false },
    );

    const [name, setName] = useState(user.name);
    const [roleId, setRoleId] = useState(user.roleId);
    const [status, setStatus] = useState<UserStatus>(user.status);

    const initials = name.trim() ? initialsFrom(name) : user.initials;
    const selectedRole = roles.find((role) => role.id === roleId) ?? null;

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> /{' '}
                        <Link href="/admin/usuarios">Usuários</Link> / {user.name}
                    </div>
                    <h1>Editar usuário</h1>
                    <p>
                        Ajuste o perfil de acesso, a regional e a situação da conta. As mudanças
                        valem no próximo carregamento do painel da pessoa.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/admin/usuarios">
                        <i className="fas fa-arrow-left"></i> Voltar
                    </Link>
                    <button
                        className="abtn abtn--action"
                        type="submit"
                        form="form-usuario"
                        disabled={pending}
                    >
                        <i className="fas fa-floppy-disk"></i>{' '}
                        {pending ? 'Salvando…' : 'Salvar alterações'}
                    </button>
                </div>
            </div>

            {state.message && (
                <div className={state.ok ? 'anote anote--success' : 'anote anote--warning'}>
                    <i
                        className={`fas ${
                            state.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'
                        }`}
                    ></i>
                    <div>{state.message}</div>
                </div>
            )}

            <div className="agrid agrid--sidebar">
                <div>
                    {/* O formulário fica dentro do cartão para que o espaçamento
                        entre cartões (`.acard + .acard`) continue valendo. */}
                    <div className="acard">
                        <form id="form-usuario" action={formAction}>
                            <input type="hidden" name="id" value={user.id} />

                            <div className="acard__head">
                                <div>
                                    <h2>Dados da conta</h2>
                                    <p>O e-mail é a identificação do acesso e não muda.</p>
                                </div>
                            </div>

                            <div className="afield-row">
                                <div className="afield">
                                    <label htmlFor="nome">Nome da pessoa ou equipe</label>
                                    <input
                                        id="nome"
                                        name="name"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                    {state.fieldErrors?.name && (
                                        <span className="afield__hint" style={ERROR_STYLE}>
                                            {state.fieldErrors.name}
                                        </span>
                                    )}
                                </div>

                                <div className="afield">
                                    <label htmlFor="email">E-mail institucional</label>
                                    <input id="email" type="email" value={user.email} disabled />
                                    <span className="afield__hint">
                                        Para trocar o e-mail, remova este acesso e envie um novo
                                        convite.
                                    </span>
                                </div>
                            </div>

                            <div className="afield-row">
                                <div className="afield">
                                    <label htmlFor="perfil">Perfil de acesso</label>
                                    <select
                                        id="perfil"
                                        name={isSelf ? undefined : 'roleId'}
                                        value={roleId}
                                        onChange={(e) => setRoleId(e.target.value)}
                                        disabled={isSelf}
                                    >
                                        {roles.map((role) => (
                                            <option value={role.id} key={role.id}>
                                                {role.name}
                                            </option>
                                        ))}
                                    </select>
                                    {/* Campo desabilitado não é enviado: o valor atual vai
                                        num oculto para a ação continuar recebendo o perfil. */}
                                    {isSelf && (
                                        <>
                                            <input
                                                type="hidden"
                                                name="roleId"
                                                value={user.roleId}
                                            />
                                            <span className="afield__hint">
                                                Você não pode alterar o próprio perfil de acesso.
                                            </span>
                                        </>
                                    )}
                                    {state.fieldErrors?.roleId && (
                                        <span className="afield__hint" style={ERROR_STYLE}>
                                            {state.fieldErrors.roleId}
                                        </span>
                                    )}
                                </div>

                                <div className="afield">
                                    <label htmlFor="regional">Regional</label>
                                    <select
                                        id="regional"
                                        name="regionalId"
                                        defaultValue={user.regionalId}
                                    >
                                        <option value="">Sem regional definida</option>
                                        {regionais.map((regional) => (
                                            <option value={regional.id} key={regional.id}>
                                                {regional.name}
                                            </option>
                                        ))}
                                    </select>
                                    {state.fieldErrors?.regionalId && (
                                        <span className="afield__hint" style={ERROR_STYLE}>
                                            {state.fieldErrors.regionalId}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="afield" style={{ marginBottom: '0' }}>
                                <label htmlFor="situacao">Situação da conta</label>
                                <select
                                    id="situacao"
                                    name={isSelf ? undefined : 'status'}
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as UserStatus)}
                                    disabled={isSelf}
                                >
                                    <option value="ATIVO">Ativo</option>
                                    <option value="PENDENTE">
                                        Pendente (aguardando aceite do convite)
                                    </option>
                                    <option value="INATIVO">Inativo</option>
                                </select>
                                {isSelf && (
                                    <input type="hidden" name="status" value={user.status} />
                                )}
                                <span className="afield__hint">
                                    {isSelf
                                        ? 'Você não pode desativar a própria conta.'
                                        : 'Ao sair de “Ativo”, todas as sessões desta conta são encerradas.'}
                                </span>
                                {state.fieldErrors?.status && (
                                    <span className="afield__hint" style={ERROR_STYLE}>
                                        {state.fieldErrors.status}
                                    </span>
                                )}
                            </div>
                        </form>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>Encerrar sessões ativas</h2>
                                <p>
                                    Desconecta esta conta de todos os navegadores e dispositivos em
                                    que ela está aberta.
                                </p>
                            </div>
                        </div>

                        {sessionState.message && (
                            <div
                                className={
                                    sessionState.ok
                                        ? 'anote anote--success'
                                        : 'anote anote--warning'
                                }
                            >
                                <i
                                    className={`fas ${
                                        sessionState.ok
                                            ? 'fa-circle-check'
                                            : 'fa-triangle-exclamation'
                                    }`}
                                ></i>
                                <div>{sessionState.message}</div>
                            </div>
                        )}

                        <div className="stat-tile" style={{ marginBottom: '1.25rem' }}>
                            <span className="stat-tile__icon">
                                <i className="fas fa-desktop"></i>
                            </span>
                            <div>
                                <strong>{sessoesAtivas}</strong>
                                <span>
                                    {sessoesAtivas === 1
                                        ? 'sessão válida neste momento'
                                        : 'sessões válidas neste momento'}
                                </span>
                            </div>
                        </div>

                        <form action={sessionAction}>
                            <input type="hidden" name="id" value={user.id} />
                            <button
                                className="abtn abtn--danger"
                                disabled={sessionPending || sessoesAtivas === 0}
                                title={
                                    sessoesAtivas === 0
                                        ? 'Não há sessões ativas para encerrar'
                                        : 'Encerrar todas as sessões desta conta'
                                }
                            >
                                <i className="fas fa-right-from-bracket"></i>{' '}
                                {sessionPending ? 'Encerrando…' : 'Encerrar todas as sessões'}
                            </button>
                        </form>

                        {isSelf && (
                            <div className="anote anote--warning" style={{ margin: '1.25rem 0 0' }}>
                                <i className="fas fa-triangle-exclamation"></i>
                                <div>
                                    <strong>Esta é a sua própria conta.</strong> Encerrar as sessões
                                    aqui também desconecta você e exige um novo login.
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Resumo</h3>
                            </div>
                        </div>
                        <div className="atable__cell-media" style={{ marginBottom: '1.25rem' }}>
                            <span className="aavatar">{initials}</span>
                            <span>
                                <span className="atable__title">{name || user.name}</span>
                                <span className="atable__sub">{user.email}</span>
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span className="abadge abadge--info">
                                {selectedRole?.name ?? user.roleName}
                            </span>
                            <span className={USER_STATUS_CLASS[status]}>
                                {USER_STATUS_LABEL[status]}
                            </span>
                        </div>

                        <ul className="activity-list" style={{ marginTop: '1.25rem' }}>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-clock-rotate-left"></i>
                                </span>
                                <div>
                                    <strong>Último acesso</strong>
                                    <span>{user.lastAccess}</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-user-plus"></i>
                                </span>
                                <div>
                                    <strong>Conta criada em</strong>
                                    <span>{user.createdAt}</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-shield-halved"></i>
                                </span>
                                <div>
                                    <strong>Verificação em duas etapas</strong>
                                    <span>{user.mfaRequired ? 'Exigida' : 'Não exigida'}</span>
                                </div>
                            </li>
                            {user.status === 'PENDENTE' && user.inviteExpiresAt && (
                                <li>
                                    <span className="activity-list__icon">
                                        <i className="fas fa-envelope"></i>
                                    </span>
                                    <div>
                                        <strong>Convite válido até</strong>
                                        <span>{user.inviteExpiresAt}</span>
                                    </div>
                                </li>
                            )}
                        </ul>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Perfil selecionado</h3>
                                <p>O que este perfil permite fazer.</p>
                            </div>
                        </div>

                        <p style={{ fontSize: '0.85rem', color: '#46586a', margin: '0 0 1rem' }}>
                            {selectedRole?.description ??
                                'Escolha um perfil para ver a descrição dele.'}
                        </p>

                        <Link
                            className="abtn abtn--ghost abtn--sm abtn--block"
                            href="/admin/acessos"
                        >
                            Ver a matriz de permissões
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
