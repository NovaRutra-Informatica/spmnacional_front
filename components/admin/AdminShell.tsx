'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
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

export interface AdminNotification {
    id: string;
    count: number;
    label: string;
    hint: string;
    href: string;
    icon: string;
}

interface AdminShellProps {
    user: { name: string; role: string; initials: string };
    groups: AdminNavGroup[];
    notifications: AdminNotification[];
    logoutAction: () => Promise<void>;
    children: ReactNode;
}

/** Remove acentos para que "midia" encontre "Mídia", por exemplo. */
const normalizeSearch = (value: string): string =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .trim();

export default function AdminShell({
    user,
    groups,
    notifications,
    logoutAction,
    children,
}: AdminShellProps) {
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [navSearch, setNavSearch] = useState('');
    const burgerRef = useRef<HTMLButtonElement | null>(null);
    const sidebarRef = useRef<HTMLElement | null>(null);
    const sidebarCloseRef = useRef<HTMLButtonElement | null>(null);
    const notificationsRef = useRef<HTMLDivElement | null>(null);
    const notificationsButtonRef = useRef<HTMLButtonElement | null>(null);

    const closeSidebar = (restoreFocus = false) => {
        setSidebarOpen(false);
        if (restoreFocus) {
            window.requestAnimationFrame(() => burgerRef.current?.focus());
        }
    };

    const closeNotifications = (restoreFocus = false) => {
        setNotificationsOpen(false);
        if (restoreFocus) {
            window.requestAnimationFrame(() => notificationsButtonRef.current?.focus());
        }
    };

    const isActive = (href: string, exact = false) =>
        exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

    const filteredGroups = useMemo(() => {
        const query = normalizeSearch(navSearch);
        if (!query) return groups;

        return groups
            .map((group) => {
                const groupMatches = normalizeSearch(group.label).includes(query);
                return {
                    ...group,
                    items: groupMatches
                        ? group.items
                        : group.items.filter((item) => normalizeSearch(item.label).includes(query)),
                };
            })
            .filter((group) => group.items.length > 0);
    }, [groups, navSearch]);

    const visibleItemCount = filteredGroups.reduce((total, group) => total + group.items.length, 0);
    const pendingCount = notifications.reduce(
        (total, notification) => total + notification.count,
        0,
    );

    useEffect(() => {
        setSidebarOpen(false);
        setNotificationsOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!sidebarOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.requestAnimationFrame(() => sidebarCloseRef.current?.focus());

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [sidebarOpen]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Tab' && sidebarOpen && sidebarRef.current) {
                const focusable = Array.from(
                    sidebarRef.current.querySelectorAll<HTMLElement>(
                        'a[href], button:not([disabled]), input:not([disabled])',
                    ),
                );
                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (first && last && event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (first && last && !event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
                return;
            }

            if (event.key === 'Escape') {
                if (notificationsOpen) {
                    closeNotifications(true);
                    return;
                }
                if (sidebarOpen) closeSidebar(true);
            }
        };

        const onPointerDown = (event: PointerEvent) => {
            if (
                notificationsOpen &&
                notificationsRef.current &&
                !notificationsRef.current.contains(event.target as Node)
            ) {
                setNotificationsOpen(false);
            }
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [notificationsOpen, sidebarOpen]);

    const renderNavigation = () => (
        <>
            {filteredGroups.map((group) => (
                <div className="admin-nav__group" key={group.label}>
                    <div className="admin-nav__label">{group.label}</div>
                    {group.items.map((item) => {
                        const active = isActive(item.href, item.exact);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={active ? 'is-active' : ''}
                                aria-current={active ? 'page' : undefined}
                                onClick={() => closeSidebar(false)}
                            >
                                <i className={`fas ${item.icon}`} aria-hidden="true"></i>
                                <span>{item.label}</span>
                                {typeof item.count === 'number' && item.count > 0 && (
                                    <span
                                        className="admin-nav__count"
                                        aria-label={`${item.count} registros`}
                                    >
                                        {item.count}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            ))}

            {visibleItemCount === 0 && (
                <div className="admin-nav__empty" role="status">
                    <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
                    <strong>Nenhuma área encontrada</strong>
                    <span>Tente outro termo ou limpe a busca.</span>
                    <button type="button" onClick={() => setNavSearch('')}>
                        Limpar busca
                    </button>
                </div>
            )}
        </>
    );

    return (
        <div className="admin-shell">
            <a className="admin-skip-link" href="#admin-main-content">
                Pular para o conteúdo principal
            </a>

            <button
                type="button"
                className={`admin-backdrop${sidebarOpen ? ' is-open' : ''}`}
                onClick={() => closeSidebar(true)}
                aria-label="Fechar menu administrativo"
                tabIndex={sidebarOpen ? 0 : -1}
            ></button>

            <aside
                ref={sidebarRef}
                id="admin-sidebar"
                className={`admin-sidebar${sidebarOpen ? ' is-open' : ''}`}
            >
                <div className="admin-brand">
                    <Link href="/admin" onClick={() => closeSidebar(false)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-small-blue.jpg" alt="" />
                        <span>
                            <strong>SPM</strong>
                            <small>Painel administrativo</small>
                        </span>
                    </Link>
                    <button
                        ref={sidebarCloseRef}
                        type="button"
                        className="admin-sidebar__close"
                        onClick={() => closeSidebar(true)}
                        aria-label="Fechar menu"
                        aria-controls="admin-sidebar"
                    >
                        <i className="fas fa-xmark" aria-hidden="true"></i>
                    </button>
                </div>

                <div className="admin-sidebar-search">
                    <label htmlFor="admin-nav-search-mobile">Filtrar áreas do painel</label>
                    <div>
                        <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
                        <input
                            id="admin-nav-search-mobile"
                            type="search"
                            value={navSearch}
                            onChange={(event) => setNavSearch(event.target.value)}
                            placeholder="Ex.: notícias, usuários…"
                            aria-controls="admin-navigation"
                        />
                    </div>
                </div>

                <nav id="admin-navigation" className="admin-nav" aria-label="Áreas do painel">
                    {renderNavigation()}
                </nav>

                <div className="admin-sidebar__footer">
                    <Link href="/" onClick={() => closeSidebar(false)}>
                        <i className="fas fa-arrow-up-right-from-square" aria-hidden="true"></i> Ver
                        o site público
                    </Link>
                    <form action={logoutAction}>
                        <button type="submit" className="admin-sidebar__logout">
                            <i className="fas fa-right-from-bracket" aria-hidden="true"></i> Sair da
                            conta
                        </button>
                    </form>
                </div>
            </aside>

            <div className="admin-main">
                <header className="admin-topbar">
                    <button
                        ref={burgerRef}
                        className="admin-burger"
                        onClick={() => setSidebarOpen((open) => !open)}
                        aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
                        aria-expanded={sidebarOpen}
                        aria-controls="admin-sidebar"
                        type="button"
                    >
                        <i
                            className={`fas ${sidebarOpen ? 'fa-xmark' : 'fa-bars'}`}
                            aria-hidden="true"
                        ></i>
                    </button>

                    <div className="admin-search">
                        <label className="admin-visually-hidden" htmlFor="admin-nav-search">
                            Filtrar áreas do painel
                        </label>
                        <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
                        <input
                            id="admin-nav-search"
                            type="search"
                            placeholder="Filtrar áreas do painel…"
                            value={navSearch}
                            onChange={(event) => setNavSearch(event.target.value)}
                            aria-controls="admin-navigation"
                        />
                        {navSearch && (
                            <button
                                className="admin-search__clear"
                                type="button"
                                onClick={() => setNavSearch('')}
                                aria-label="Limpar busca"
                            >
                                <i className="fas fa-xmark" aria-hidden="true"></i>
                            </button>
                        )}
                        <span className="admin-visually-hidden" role="status" aria-live="polite">
                            {visibleItemCount}{' '}
                            {visibleItemCount === 1 ? 'área encontrada' : 'áreas encontradas'}
                        </span>
                    </div>

                    <div className="admin-topbar__actions">
                        <div className="admin-notifications" ref={notificationsRef}>
                            <button
                                ref={notificationsButtonRef}
                                className="admin-icon-btn"
                                aria-label={
                                    pendingCount > 0
                                        ? `Notificações: ${pendingCount} pendências`
                                        : 'Notificações: nenhuma pendência'
                                }
                                aria-expanded={notificationsOpen}
                                aria-controls="admin-notifications-panel"
                                onClick={() => setNotificationsOpen((open) => !open)}
                                type="button"
                            >
                                <i className="fas fa-bell" aria-hidden="true"></i>
                                {pendingCount > 0 && (
                                    <span className="admin-notifications__badge" aria-hidden="true">
                                        {pendingCount > 99 ? '99+' : pendingCount}
                                    </span>
                                )}
                            </button>

                            {notificationsOpen && (
                                <div
                                    id="admin-notifications-panel"
                                    className="admin-notifications__panel"
                                    role="region"
                                    aria-label="Pendências do painel"
                                >
                                    <div className="admin-notifications__head">
                                        <div>
                                            <strong>Pendências</strong>
                                            <span>Atalhos para o que pede atenção</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => closeNotifications(true)}
                                            aria-label="Fechar notificações"
                                        >
                                            <i className="fas fa-xmark" aria-hidden="true"></i>
                                        </button>
                                    </div>

                                    {notifications.length > 0 ? (
                                        <ul>
                                            {notifications.map((notification) => (
                                                <li key={notification.id}>
                                                    <Link
                                                        href={notification.href}
                                                        onClick={() => setNotificationsOpen(false)}
                                                    >
                                                        <span className="admin-notifications__icon">
                                                            <i
                                                                className={`fas ${notification.icon}`}
                                                                aria-hidden="true"
                                                            ></i>
                                                        </span>
                                                        <span>
                                                            <strong>
                                                                {notification.count}{' '}
                                                                {notification.label}
                                                            </strong>
                                                            <small>{notification.hint}</small>
                                                        </span>
                                                        <i
                                                            className="fas fa-arrow-right"
                                                            aria-hidden="true"
                                                        ></i>
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="admin-notifications__empty">
                                            <i
                                                className="fas fa-circle-check"
                                                aria-hidden="true"
                                            ></i>
                                            <strong>Tudo em dia</strong>
                                            <span>Não há pendências no seu escopo.</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <Link
                            className="admin-icon-btn admin-site-link"
                            href="/"
                            aria-label="Ver o site público"
                            title="Ver o site público"
                        >
                            <i className="fas fa-globe" aria-hidden="true"></i>
                        </Link>

                        <div className="admin-user">
                            <span className="admin-user__avatar" aria-hidden="true">
                                {user.initials}
                            </span>
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
                                    <i className="fas fa-right-from-bracket" aria-hidden="true"></i>
                                </button>
                            </form>
                        </div>
                    </div>
                </header>

                <main id="admin-main-content" className="admin-content" tabIndex={-1}>
                    {children}
                </main>
            </div>
        </div>
    );
}
