import Link from 'next/link';
import type { AuditLevel, PostStatus } from '@/lib/generated/prisma/enums';
import { AUDIT_LEVEL_ICON, POST_STATUS_CLASS, POST_STATUS_LABEL } from '@/lib/labels';

export interface RecentPost {
    id: string;
    title: string;
    cover: string | null;
    author: string;
    category: string;
    status: PostStatus;
    updatedAt: string;
}

export interface CategoryRow {
    id: string;
    name: string;
    count: number;
    pct: number;
}

export interface LogRow {
    id: string;
    action: string;
    target: string;
    level: AuditLevel;
    actor: string;
    when: string;
}

export interface TopPost {
    id: string;
    title: string;
    views: number;
    category: string;
}

export interface DashboardShortcut {
    href: string;
    icon: string;
    label: string;
}

interface DashboardStats {
    totalPosts: number;
    published: number;
    drafts: number;
    inReview: number;
    scheduled: number;
    activeUsers: number;
    newMessages: number;
    openAtendimentos: number;
}

interface PageContentProps {
    userName: string;
    roleName: string;
    canCreatePost: boolean;
    canInviteUser: boolean;
    canViewMessages: boolean;
    canViewAtendimentos: boolean;
    canManageUsers: boolean;
    canSeeAudit: boolean;
    blockedResource: string | null;
    lastActivity: string | null;
    stats: DashboardStats;
    recent: RecentPost[];
    byCategory: CategoryRow[];
    log: LogRow[];
    topPosts: TopPost[];
    shortcuts: DashboardShortcut[];
}

export default function PageContent({
    userName,
    roleName,
    canCreatePost,
    canInviteUser,
    canViewMessages,
    canViewAtendimentos,
    canManageUsers,
    canSeeAudit,
    blockedResource,
    lastActivity,
    stats,
    recent,
    byCategory,
    log,
    topPosts,
    shortcuts,
}: PageContentProps) {
    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">Painel</div>
                    <h1>Olá, {userName}</h1>
                    <p>
                        Aqui está o resumo do que está acontecendo no site e na rede do SPM.
                        {lastActivity
                            ? ` Último registro de atividade em ${lastActivity}.`
                            : ' Ainda não há registros de atividade.'}
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    {canInviteUser && (
                        <Link className="abtn abtn--ghost" href="/admin/usuarios/novo">
                            <i className="fas fa-user-plus"></i> Convidar usuário
                        </Link>
                    )}
                    {canCreatePost && (
                        <Link className="abtn abtn--action" href="/admin/noticias/nova">
                            <i className="fas fa-plus"></i> Nova notícia
                        </Link>
                    )}
                </div>
            </div>

            {blockedResource && (
                <div className="anote anote--warning">
                    <i className="fas fa-triangle-exclamation"></i>
                    <div>
                        <strong>Acesso não liberado.</strong> O perfil <strong>{roleName}</strong>{' '}
                        não tem permissão para abrir {blockedResource}. Se você precisa desse acesso
                        para o seu trabalho, peça à coordenação que ajuste o perfil em Perfis e
                        permissões.
                    </div>
                </div>
            )}

            <section className="admin-dashboard-block" aria-labelledby="dashboard-pendencias">
                <div className="admin-dashboard-block__head">
                    <div>
                        <span className="admin-section-label">Prioridades</span>
                        <h2 id="dashboard-pendencias">O que pede atenção</h2>
                    </div>
                    <p>Abra cada área para revisar e concluir as pendências.</p>
                </div>

                <div className="agrid agrid--4 admin-priority-grid">
                    {canCreatePost && (
                        <>
                            <Link
                                className="stat-tile stat-tile--link is-warning"
                                href="/admin/noticias"
                                aria-label={`${stats.drafts + stats.inReview} rascunhos e revisões. Abrir notícias.`}
                            >
                                <span className="stat-tile__icon">
                                    <i className="fas fa-pen-ruler" aria-hidden="true"></i>
                                </span>
                                <span className="stat-tile__body">
                                    <strong>{stats.drafts + stats.inReview}</strong>
                                    <span>Rascunhos e revisões</span>
                                </span>
                                <i
                                    className="fas fa-arrow-right stat-tile__arrow"
                                    aria-hidden="true"
                                ></i>
                            </Link>
                            <Link
                                className="stat-tile stat-tile--link"
                                href="/admin/noticias"
                                aria-label={`${stats.scheduled} notícias agendadas. Abrir notícias.`}
                            >
                                <span className="stat-tile__icon">
                                    <i className="fas fa-clock" aria-hidden="true"></i>
                                </span>
                                <span className="stat-tile__body">
                                    <strong>{stats.scheduled}</strong>
                                    <span>Notícias agendadas</span>
                                </span>
                                <i
                                    className="fas fa-arrow-right stat-tile__arrow"
                                    aria-hidden="true"
                                ></i>
                            </Link>
                        </>
                    )}
                    {canViewMessages && (
                        <Link
                            className="stat-tile stat-tile--link is-action"
                            href="/admin/mensagens"
                            aria-label={`${stats.newMessages} mensagens novas. Abrir mensagens.`}
                        >
                            <span className="stat-tile__icon">
                                <i className="fas fa-envelope-open-text" aria-hidden="true"></i>
                            </span>
                            <span className="stat-tile__body">
                                <strong>{stats.newMessages}</strong>
                                <span>Mensagens novas</span>
                            </span>
                            <i
                                className="fas fa-arrow-right stat-tile__arrow"
                                aria-hidden="true"
                            ></i>
                        </Link>
                    )}
                    {canViewAtendimentos && (
                        <Link
                            className="stat-tile stat-tile--link is-success"
                            href="/admin/atendimentos"
                            aria-label={`${stats.openAtendimentos} atendimentos em aberto. Abrir atendimentos.`}
                        >
                            <span className="stat-tile__icon">
                                <i className="fas fa-hand-holding-heart" aria-hidden="true"></i>
                            </span>
                            <span className="stat-tile__body">
                                <strong>{stats.openAtendimentos}</strong>
                                <span>Atendimentos em aberto</span>
                            </span>
                            <i
                                className="fas fa-arrow-right stat-tile__arrow"
                                aria-hidden="true"
                            ></i>
                        </Link>
                    )}
                </div>
            </section>

            {(canCreatePost || canManageUsers) && (
                <section className="admin-summary" aria-labelledby="dashboard-resumo">
                    <div className="admin-summary__intro">
                        <span className="admin-section-label">Visão geral</span>
                        <h2 id="dashboard-resumo">Resumo do acervo</h2>
                    </div>
                    <dl className="admin-summary__list">
                        {canCreatePost && (
                            <>
                                <div>
                                    <dt>Notícias cadastradas</dt>
                                    <dd>{stats.totalPosts}</dd>
                                </div>
                                <div>
                                    <dt>Publicadas no site</dt>
                                    <dd>{stats.published}</dd>
                                </div>
                            </>
                        )}
                        {canManageUsers && (
                            <div>
                                <dt>Usuários ativos</dt>
                                <dd>{stats.activeUsers}</dd>
                            </div>
                        )}
                    </dl>
                </section>
            )}

            <div className={`agrid agrid--sidebar${canCreatePost ? '' : ' agrid--single'}`}>
                {canCreatePost && (
                    <div>
                        <div className="acard">
                            <div className="acard__head">
                                <div>
                                    <h2>Publicações recentes</h2>
                                    <p>As últimas notícias alteradas no sistema.</p>
                                </div>
                                {/* Sem a permissão de notícias o atalho levaria a uma
                                tela que o próprio guard devolveria — melhor não oferecer. */}
                                {canCreatePost && (
                                    <Link
                                        className="abtn abtn--ghost abtn--sm"
                                        href="/admin/noticias"
                                    >
                                        Ver todas <i className="fas fa-arrow-right"></i>
                                    </Link>
                                )}
                            </div>

                            {recent.length ? (
                                <div className="atable-wrap">
                                    <table className="atable">
                                        <thead>
                                            <tr>
                                                <th>Título</th>
                                                <th>Categoria</th>
                                                <th>Atualizada em</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recent.map((item) => (
                                                <tr key={item.id}>
                                                    <td>
                                                        <div className="atable__cell-media">
                                                            {item.cover && (
                                                                <span
                                                                    className="atable__thumb"
                                                                    style={{
                                                                        backgroundImage: `url(${item.cover})`,
                                                                    }}
                                                                ></span>
                                                            )}
                                                            <span>
                                                                <span className="atable__title">
                                                                    {item.title}
                                                                </span>
                                                                <span className="atable__sub">
                                                                    por {item.author}
                                                                </span>
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td>{item.category}</td>
                                                    <td>{item.updatedAt}</td>
                                                    <td>
                                                        <span
                                                            className={
                                                                POST_STATUS_CLASS[item.status]
                                                            }
                                                        >
                                                            {POST_STATUS_LABEL[item.status]}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="aempty">
                                    <i className="fas fa-newspaper"></i>
                                    <strong>Nenhuma notícia cadastrada</strong>
                                    <span>Assim que a primeira for criada, ela aparece aqui.</span>
                                </div>
                            )}
                        </div>

                        <div className="acard">
                            <div className="acard__head">
                                <div>
                                    <h2>Distribuição por categoria</h2>
                                    <p>Como o conteúdo do site está equilibrado hoje.</p>
                                </div>
                            </div>

                            {byCategory.length ? (
                                byCategory.map((row) => (
                                    <div className="abar-row" key={row.id}>
                                        <div className="abar-row__head">
                                            <span>{row.name}</span>
                                            <strong>
                                                {row.count} · {row.pct}%
                                            </strong>
                                        </div>
                                        <div className="abar">
                                            <div style={{ width: `${row.pct}%` }}></div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="aempty">
                                    <i className="fas fa-chart-simple"></i>
                                    <strong>Sem dados para comparar</strong>
                                    <span>Cadastre notícias para ver a distribuição.</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div>
                    {canSeeAudit && (
                        <div className="acard">
                            <div className="acard__head">
                                <div>
                                    <h3>Atividade recente</h3>
                                    <p>Registro de acessos e alterações.</p>
                                </div>
                            </div>

                            {log.length ? (
                                <ul className="activity-list">
                                    {log.map((entry) => (
                                        <li key={entry.id}>
                                            <span className="activity-list__icon">
                                                <i
                                                    className={`fas ${AUDIT_LEVEL_ICON[entry.level]}`}
                                                ></i>
                                            </span>
                                            <div>
                                                <strong>
                                                    {entry.action} — {entry.target}
                                                </strong>
                                                <span>
                                                    {entry.actor} · {entry.when}
                                                </span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="aempty">
                                    <i className="fas fa-clock-rotate-left"></i>
                                    <strong>Nenhum registro ainda</strong>
                                    <span>As ações do painel aparecem aqui.</span>
                                </div>
                            )}

                            {canSeeAudit && (
                                <Link
                                    className="abtn abtn--ghost abtn--sm abtn--block"
                                    href="/admin/acessos"
                                    style={{ marginTop: '1rem' }}
                                >
                                    Ver registro completo
                                </Link>
                            )}
                        </div>
                    )}

                    {canCreatePost && (
                        <div className="acard">
                            <div className="acard__head">
                                <div>
                                    <h3>Mais lidas</h3>
                                    <p>Publicações com maior audiência.</p>
                                </div>
                            </div>

                            {topPosts.length ? (
                                <ul className="activity-list">
                                    {topPosts.map((post) => (
                                        <li key={post.id}>
                                            <span className="activity-list__icon">
                                                <i className="fas fa-eye"></i>
                                            </span>
                                            <div>
                                                <strong>{post.title}</strong>
                                                <span>
                                                    {post.views} visualizações · {post.category}
                                                </span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="aempty">
                                    <i className="fas fa-eye"></i>
                                    <strong>Nada publicado ainda</strong>
                                    <span>A audiência começa a ser contada após a publicação.</span>
                                </div>
                            )}
                        </div>
                    )}

                    {shortcuts.length > 0 && (
                        <div className="acard">
                            <div className="acard__head">
                                <div>
                                    <h3>Atalhos</h3>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gap: '0.6rem' }}>
                                {shortcuts.map((shortcut) => (
                                    <Link
                                        className="abtn abtn--ghost abtn--block"
                                        href={shortcut.href}
                                        key={shortcut.href}
                                    >
                                        <i className={`fas ${shortcut.icon}`}></i> {shortcut.label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
