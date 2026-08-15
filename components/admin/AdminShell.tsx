'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { ReactNode } from 'react';

export interface AdminNavItem {
    label: string;
    href: string;
    icon: string;
    exact?: boolean;
    count?: number;
    permission?: string;
}

export interface AdminNavGroup {
    label: string;
    items: AdminNavItem[];
}

interface AdminShellProps {
    user: { name: string; role: string; initials: string };
    groups: AdminNavGroup[];
    pendingAlert: boolean;
    logoutAction: () => Promise<void>;
    children: ReactNode;
}

export default function AdminShell({
    user,
    groups,
    pendingAlert,
    logoutAction,
    children,
}: AdminShellProps) {
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const closeSidebar = () => setSidebarOpen(false);

    const isActive = (href: string, exact = false) =>
        exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

    return (
        <div className="admin-shell">
            <div
                className={`admin-backdrop${sidebarOpen ? ' is-open' : ''}`}
                onClick={closeSidebar}
            ></div>

            <aside className={`admin-sidebar${sidebarOpen ? ' is-open' : ''}`}>
                <div className="admin-brand">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-small-white.png" alt="SPM" />
                    <div>
                        <strong>SPM</strong>
                        <small>Painel administrativo</small>
                    </div>
                </div>

                <nav className="admin-nav">
                    {groups.map((group) => (
                        <div key={group.label}>
                            <div className="admin-nav__label">{group.label}</div>
                            {group.items.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={isActive(item.href, item.exact) ? 'is-active' : ''}
                                    onClick={closeSidebar}
                                >
                                    <i className={`fas ${item.icon}`}></i> {item.label}
                                    {typeof item.count === 'number' && item.count > 0 && (
                                        <span className="admin-nav__count">{item.count}</span>
                                    )}
                                </Link>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className="admin-sidebar__footer">
                    <Link href="/" onClick={closeSidebar}>
                        <i className="fas fa-arrow-up-right-from-square"></i> Ver o site público
                    </Link>
                    <form action={logoutAction}>
                        <button
                            type="submit"
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: '0.4rem 0',
                                color: 'rgba(255,255,255,.6)',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.7rem',
                                fontFamily: 'inherit',
                            }}
                        >
                            <i className="fas fa-right-from-bracket"></i> Sair da conta
                        </button>
                    </form>
                </div>
            </aside>

            <div className="admin-main">
                <header className="admin-topbar">
                    <button
                        className="admin-burger"
                        onClick={() => setSidebarOpen((open) => !open)}
                        aria-label="Abrir menu"
                    >
                        <i className="fas fa-bars"></i>
                    </button>

                    <div className="admin-search">
                        <i className="fas fa-magnifying-glass"></i>
                        <input type="search" placeholder="Buscar notícias, usuários, arquivos…" />
                    </div>

                    <div className="admin-topbar__actions">
                        <button className="admin-icon-btn" aria-label="Notificações">
                            <i className="fas fa-bell"></i>
                            {pendingAlert && <span className="dot"></span>}
                        </button>
                        <Link
                            className="admin-icon-btn"
                            href="/"
                            aria-label="Ver o site"
                            title="Ver o site"
                        >
                            <i className="fas fa-globe"></i>
                        </Link>

                        <div className="admin-user">
                            <span className="admin-user__avatar">{user.initials}</span>
                            <span className="admin-user__info">
                                <strong>{user.name}</strong>
                                <span>{user.role}</span>
                            </span>
                            <form action={logoutAction}>
                                <button
                                    type="submit"
                                    className="admin-icon-btn"
                                    aria-label="Sair"
                                    title="Sair da conta"
                                >
                                    <i className="fas fa-right-from-bracket"></i>
                                </button>
                            </form>
                        </div>
                    </div>
                </header>

                <main className="admin-content">{children}</main>
            </div>
        </div>
    );
}
