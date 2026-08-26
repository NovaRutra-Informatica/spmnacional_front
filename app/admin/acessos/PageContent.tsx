'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { AuditLevel } from '@/lib/generated/prisma/enums';
import { AUDIT_LEVEL_CLASS, AUDIT_LEVEL_ICON, AUDIT_LEVEL_LABEL } from '@/lib/labels';
import { alternarPermissao } from './actions';

export interface RoleMatrix {
    id: string;
    key: string;
    name: string;
    description: string;
    permissions: string[];
    userCount: number;
}

export interface PermissionInfo {
    key: string;
    label: string;
    hint: string;
}

export interface AuditEntry {
    id: string;
    action: string;
    target: string;
    level: AuditLevel;
    actor: string;
    ip: string;
    when: string;
}

interface Props {
    roles: RoleMatrix[];
    permissions: PermissionInfo[];
    audit: AuditEntry[];
    totalUsers: number;
    auditLimit: number;
}

/** Perfil de sistema travado — a matriz o exibe cheio e sem botões ativos. */
const ADMIN_ROLE_KEY = 'admin';

export default function PageContent({ roles, permissions, audit, totalUsers, auditLimit }: Props) {
    const [levelFilter, setLevelFilter] = useState<'todos' | AuditLevel>('todos');

    const filteredLog = useMemo(
        () =>
            levelFilter === 'todos' ? audit : audit.filter((entry) => entry.level === levelFilter),
        [audit, levelFilter],
    );

    const roleUsage = useMemo(() => {
        const base = totalUsers || 1;
        return roles.map((role) => ({
            role,
            count: role.userCount,
            pct: Math.round((role.userCount / base) * 100),
        }));
    }, [roles, totalUsers]);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> / Pessoas e acessos
                    </div>
                    <h1>Perfis e permissões</h1>
                    <p>
                        Defina o que cada perfil pode fazer no sistema e acompanhe o registro de
                        acessos. As alterações valem para todas as contas que usam o perfil.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/admin/usuarios">
                        <i className="fas fa-users"></i> Ver usuários
                    </Link>
                </div>
            </div>

            <div className="anote">
                <i className="fas fa-circle-info"></i>
                <div>
                    <strong>Princípio do menor privilégio.</strong> Conceda apenas o necessário para
                    a função. Permissões de atendimento dão acesso a dados sensíveis de pessoas
                    migrantes e devem ficar restritas a quem assinou o termo de sigilo.
                </div>
            </div>

            <div className="acard">
                <div className="acard__head">
                    <div>
                        <h2>Matriz de permissões</h2>
                        <p>Clique nas células para conceder ou revogar cada permissão.</p>
                    </div>
                </div>

                {roles.length > 0 && permissions.length > 0 ? (
                    <div className="atable-wrap">
                        <table className="perm-table">
                            <thead>
                                <tr>
                                    <th>Permissão</th>
                                    {roles.map((role) => (
                                        <th key={role.id}>{role.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {permissions.map((permission) => (
                                    <tr key={permission.key}>
                                        <td>
                                            <div className="perm-table__label">
                                                <strong>{permission.label}</strong>
                                                <span>{permission.hint}</span>
                                            </div>
                                        </td>
                                        {roles.map((role) => {
                                            const granted = role.permissions.includes(
                                                permission.key,
                                            );
                                            const locked = role.key === ADMIN_ROLE_KEY;

                                            return (
                                                <td key={role.id}>
                                                    <form action={alternarPermissao}>
                                                        <input
                                                            type="hidden"
                                                            name="roleId"
                                                            value={role.id}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="permissionKey"
                                                            value={permission.key}
                                                        />
                                                        <button
                                                            className={`perm-toggle${
                                                                granted || locked ? ' is-on' : ''
                                                            }`}
                                                            disabled={locked}
                                                            aria-pressed={granted || locked}
                                                            title={
                                                                locked
                                                                    ? 'O administrador geral mantém todas as permissões e não pode ser editado.'
                                                                    : granted
                                                                      ? 'Revogar permissão'
                                                                      : 'Conceder permissão'
                                                            }
                                                        >
                                                            <i
                                                                className={`fas${
                                                                    granted || locked
                                                                        ? ' fa-check'
                                                                        : ' fa-minus'
                                                                }`}
                                                            ></i>
                                                        </button>
                                                    </form>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="aempty">
                        <i className="fas fa-shield-halved"></i>
                        <strong>Nenhum perfil ou permissão cadastrada</strong>
                        <span>
                            Os perfis do sistema vêm da carga inicial do banco. Rode-a para liberar
                            esta tela.
                        </span>
                    </div>
                )}
            </div>

            <div className="agrid agrid--sidebar">
                <div className="acard">
                    <div className="acard__head">
                        <div>
                            <h2>Registro de acessos</h2>
                            <p>Últimos {auditLimit} eventos registrados na auditoria do painel.</p>
                        </div>
                        <select
                            value={levelFilter}
                            onChange={(e) => setLevelFilter(e.target.value as 'todos' | AuditLevel)}
                        >
                            <option value="todos">Todos os eventos</option>
                            <option value="INFO">Informativos</option>
                            <option value="ALERTA">Alertas</option>
                            <option value="CRITICO">Críticos</option>
                        </select>
                    </div>

                    {filteredLog.length ? (
                        <div className="atable-wrap">
                            <table className="atable">
                                <thead>
                                    <tr>
                                        <th>Evento</th>
                                        <th>Usuário</th>
                                        <th>Origem</th>
                                        <th>Quando</th>
                                        <th>Nível</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLog.map((entry) => (
                                        <tr key={entry.id}>
                                            <td>
                                                <span className="atable__title">
                                                    {entry.action}
                                                </span>
                                                <span className="atable__sub">{entry.target}</span>
                                            </td>
                                            <td className="atable__sub">{entry.actor}</td>
                                            <td className="atable__sub">{entry.ip}</td>
                                            <td className="atable__sub">{entry.when}</td>
                                            <td>
                                                <span className={AUDIT_LEVEL_CLASS[entry.level]}>
                                                    <i
                                                        className={`fas ${
                                                            AUDIT_LEVEL_ICON[entry.level]
                                                        }`}
                                                    ></i>
                                                    {AUDIT_LEVEL_LABEL[entry.level]}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="aempty">
                            <i className="fas fa-clipboard-list"></i>
                            <strong>
                                {audit.length
                                    ? 'Nenhum evento neste nível'
                                    : 'Nenhum evento registrado'}
                            </strong>
                            <span>
                                {audit.length
                                    ? 'Selecione outro filtro para ver o registro.'
                                    : 'As ações feitas no painel passam a aparecer aqui automaticamente.'}
                            </span>
                        </div>
                    )}
                </div>

                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Distribuição de perfis</h3>
                                <p>Quantas contas usam cada perfil.</p>
                            </div>
                        </div>

                        {roleUsage.map((row) => (
                            <div className="abar-row" key={row.role.id}>
                                <div className="abar-row__head">
                                    <span>{row.role.name}</span>
                                    <strong>{row.count}</strong>
                                </div>
                                <div className="abar">
                                    <div style={{ width: `${row.pct}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Descrição dos perfis</h3>
                            </div>
                        </div>

                        <ul className="activity-list">
                            {roles.map((role) => (
                                <li key={role.id}>
                                    <span className="activity-list__icon">
                                        <i className="fas fa-user-shield"></i>
                                    </span>
                                    <div>
                                        <strong>{role.name}</strong>
                                        <span>{role.description}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Políticas de sessão</h3>
                                <p>Regras que o sistema já aplica a todas as contas.</p>
                            </div>
                        </div>

                        <ul className="activity-list">
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-hourglass-half"></i>
                                </span>
                                <div>
                                    <strong>Sessão expira em 12 horas</strong>
                                    <span>
                                        Prazo absoluto, contado a partir do login, mesmo com uso
                                        contínuo.
                                    </span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-user-clock"></i>
                                </span>
                                <div>
                                    <strong>Encerramento após 30 min de inatividade</strong>
                                    <span>
                                        Sem nenhuma requisição nesse intervalo, a sessão é revogada.
                                    </span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-lock"></i>
                                </span>
                                <div>
                                    <strong>Bloqueio após 5 tentativas malsucedidas</strong>
                                    <span>A conta fica bloqueada por 15 minutos.</span>
                                </div>
                            </li>
                        </ul>

                        <div className="anote" style={{ margin: '1.25rem 0 0' }}>
                            <i className="fas fa-circle-info"></i>
                            <div>
                                Estes valores são definidos em <strong>lib/server/auth.ts</strong> e
                                valem para todo o painel — não há como alterá-los por aqui.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
