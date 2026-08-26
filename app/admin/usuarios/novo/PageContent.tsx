'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { convidarUsuario } from '../actions';
import { initialsFrom } from '../initials';

export interface RoleDetail {
    id: string;
    name: string;
    permissions: string[];
}

export interface PermissionInfo {
    key: string;
    label: string;
    hint: string;
}

export interface RegionalOption {
    id: string;
    name: string;
}

interface Props {
    roles: RoleDetail[];
    permissions: PermissionInfo[];
    regionais: RegionalOption[];
    mailEnabled: boolean;
}

/** Espelha `ActionState`; o módulo original é server-only e não pode vir para cá. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const ERROR_STYLE = { color: '#c2185b' };

export default function PageContent({ roles, permissions, regionais, mailEnabled }: Props) {
    const [state, formAction, pending] = useActionState<FormState, FormData>(convidarUsuario, {
        ok: false,
    });

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [roleId, setRoleId] = useState(roles[0]?.id ?? '');
    const [regionalId, setRegionalId] = useState('');

    const initials = name.trim() ? initialsFrom(name) : '??';
    const selectedRole = roles.find((role) => role.id === roleId) ?? null;
    const selectedRegional = regionais.find((regional) => regional.id === regionalId) ?? null;

    const inviteUrl = typeof state.data?.inviteUrl === 'string' ? state.data.inviteUrl : null;

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> /{' '}
                        <Link href="/admin/usuarios">Usuários</Link> / Novo
                    </div>
                    <h1>Convidar usuário</h1>
                    <p>
                        Crie o acesso, escolha o perfil de permissões e a regional. O convite é
                        enviado por e-mail para que a pessoa defina a própria senha.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/admin/usuarios">
                        <i className="fas fa-arrow-left"></i> Cancelar
                    </Link>
                    <button
                        className="abtn abtn--action"
                        type="submit"
                        form="form-convite"
                        disabled={pending}
                    >
                        <i className="fas fa-paper-plane"></i>{' '}
                        {pending ? 'Enviando…' : 'Criar acesso'}
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
                    <div>
                        {state.message}
                        {inviteUrl && (
                            <>
                                <br />
                                <strong style={{ wordBreak: 'break-all' }}>{inviteUrl}</strong>
                                <br />
                                <span>O link vale por 7 dias e só pode ser usado uma vez.</span>
                            </>
                        )}
                        {state.ok && (
                            <>
                                <br />
                                <Link href="/admin/usuarios">Ver a lista de usuários</Link>
                            </>
                        )}
                    </div>
                </div>
            )}

            <form id="form-convite" action={formAction}>
                <div className="agrid agrid--sidebar">
                    <div>
                        <div className="acard">
                            <div className="acard__head">
                                <div>
                                    <h2>Dados da conta</h2>
                                    <p>Informações básicas de identificação do acesso.</p>
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
                                        placeholder="Ex.: Equipe Boa Vista"
                                    />
                                    {state.fieldErrors?.name && (
                                        <span className="afield__hint" style={ERROR_STYLE}>
                                            {state.fieldErrors.name}
                                        </span>
                                    )}
                                </div>

                                <div className="afield">
                                    <label htmlFor="email">E-mail institucional</label>
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="nome@spmnacional.org.br"
                                    />
                                    {state.fieldErrors?.email && (
                                        <span className="afield__hint" style={ERROR_STYLE}>
                                            {state.fieldErrors.email}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="afield-row">
                                <div className="afield">
                                    <label htmlFor="perfil">Perfil de acesso</label>
                                    <select
                                        id="perfil"
                                        name="roleId"
                                        value={roleId}
                                        onChange={(e) => setRoleId(e.target.value)}
                                    >
                                        {roles.map((role) => (
                                            <option value={role.id} key={role.id}>
                                                {role.name}
                                            </option>
                                        ))}
                                    </select>
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
                                        value={regionalId}
                                        onChange={(e) => setRegionalId(e.target.value)}
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
                                <label htmlFor="situacao">Situação inicial</label>
                                <select id="situacao" value="PENDENTE" disabled>
                                    <option value="PENDENTE">
                                        Pendente (aguardando aceite do convite)
                                    </option>
                                </select>
                                <span className="afield__hint">
                                    A conta entra como pendente e só passa a ativa quando a pessoa
                                    definir a senha pelo link do convite.
                                </span>
                            </div>
                        </div>

                        <div className="acard">
                            <div className="acard__head">
                                <div>
                                    <h2>Segurança</h2>
                                    <p>Regras aplicadas a esta conta no primeiro acesso.</p>
                                </div>
                            </div>

                            <label className="aswitch">
                                <input type="checkbox" name="mfaRequired" defaultChecked />
                                <span className="aswitch__track"></span>
                                <span className="aswitch__label">
                                    Exigir verificação em duas etapas para esta conta
                                </span>
                            </label>

                            {!mailEnabled && (
                                <div className="anote" style={{ margin: '1.5rem 0 0' }}>
                                    <i className="fas fa-circle-info"></i>
                                    <div>
                                        <strong>O envio de e-mail não está configurado.</strong> O
                                        link do convite será exibido aqui na tela depois de criar o
                                        acesso — copie e repasse à pessoa por um canal seguro.
                                    </div>
                                </div>
                            )}

                            <div className="anote anote--warning" style={{ margin: '1.5rem 0 0' }}>
                                <i className="fas fa-shield-halved"></i>
                                <div>
                                    <strong>Contas de atendimento acessam dados sensíveis.</strong>{' '}
                                    Perfis com permissão de atendimento veem fichas de pessoas
                                    migrantes. Conceda apenas a quem assinou o termo de sigilo do
                                    SPM.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="acard">
                            <div className="acard__head">
                                <div>
                                    <h3>Pré-visualização</h3>
                                </div>
                            </div>
                            <div className="atable__cell-media" style={{ marginBottom: '1.25rem' }}>
                                <span className="aavatar">{initials}</span>
                                <span>
                                    <span className="atable__title">
                                        {name || 'Nome do usuário'}
                                    </span>
                                    <span className="atable__sub">
                                        {email || 'email@spmnacional.org.br'}
                                    </span>
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <span className="abadge abadge--info">
                                    {selectedRole?.name ?? 'Sem perfil'}
                                </span>
                                <span className="abadge abadge--pendente">pendente</span>
                            </div>
                            <p
                                style={{
                                    fontSize: '0.8rem',
                                    color: '#93a1af',
                                    margin: '0.9rem 0 0',
                                }}
                            >
                                {selectedRegional?.name ?? 'Sem regional definida'}
                            </p>
                        </div>

                        <div className="acard">
                            <div className="acard__head">
                                <div>
                                    <h3>Permissões do perfil</h3>
                                    <p>Herdadas de “{selectedRole?.name ?? '—'}”.</p>
                                </div>
                            </div>

                            {selectedRole ? (
                                <>
                                    <ul className="activity-list">
                                        {permissions.map((permission) => {
                                            const granted = selectedRole.permissions.includes(
                                                permission.key,
                                            );

                                            return (
                                                <li key={permission.key}>
                                                    <span
                                                        className="activity-list__icon"
                                                        style={{
                                                            background: granted
                                                                ? 'rgba(22,145,90,.12)'
                                                                : 'rgba(0,0,0,.05)',
                                                            color: granted ? '#16915a' : '#a3b1bf',
                                                        }}
                                                    >
                                                        <i
                                                            className={`fas${
                                                                granted ? ' fa-check' : ' fa-xmark'
                                                            }`}
                                                        ></i>
                                                    </span>
                                                    <div>
                                                        <strong>{permission.label}</strong>
                                                        <span>{permission.hint}</span>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>

                                    <Link
                                        className="abtn abtn--ghost abtn--sm abtn--block"
                                        href="/admin/acessos"
                                        style={{ marginTop: '1rem' }}
                                    >
                                        Editar permissões do perfil
                                    </Link>
                                </>
                            ) : (
                                <div className="aempty">
                                    <i className="fas fa-shield-halved"></i>
                                    <strong>Nenhum perfil de acesso cadastrado</strong>
                                    <span>
                                        Sem perfil não há como criar um acesso. Rode a carga inicial
                                        do banco antes de convidar alguém.
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </form>
        </>
    );
}
