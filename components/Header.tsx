'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export interface NavChild {
    label: string;
    link: string;
    desc?: string;
}

export interface NavItem {
    label: string;
    link?: string;
    exact?: boolean;
    children?: NavChild[];
}

export const navItems: NavItem[] = [
    { label: 'Início', link: '/', exact: true },
    {
        label: 'Quem Somos',
        children: [
            { label: 'O que é o SPM', link: '/quem-somos', desc: 'Missão, visão e valores' },
            {
                label: 'Nossa História',
                link: '/quem-somos/historia',
                desc: 'De 1985 aos dias de hoje',
            },
            {
                label: 'Estrutura e Coordenação',
                link: '/quem-somos/estrutura',
                desc: 'Quem conduz o serviço',
            },
            {
                label: 'Documentos',
                link: '/quem-somos/documentos',
                desc: 'Estatuto, cartas e atas',
            },
        ],
    },
    {
        label: 'Atuação',
        children: [
            {
                label: 'O que fazemos',
                link: '/o-que-fazemos',
                desc: 'Formação, Incidência e Articulação',
            },
            {
                label: 'Onde estamos',
                link: '/onde-estamos',
                desc: 'Regionais em todo o Brasil',
            },
            {
                label: 'Semana do Migrante',
                link: '/semana-do-migrante',
                desc: 'A campanha anual do SPM',
            },
            {
                label: 'Agenda',
                link: '/agenda',
                desc: 'Datas e eventos da rede',
            },
            {
                label: 'Transparência',
                link: '/transparencia',
                desc: 'Prestação de contas e parceiros',
            },
        ],
    },
    {
        label: 'Legislação',
        children: [
            {
                label: 'Panorama legal',
                link: '/legislacao',
                desc: 'Direitos de quem migra no Brasil',
            },
            {
                label: 'Lei nº 13.445/2017',
                link: '/legislacao/lei-de-migracao',
                desc: 'Lei de Migração',
            },
            {
                label: 'Lei nº 16.478/2016',
                link: '/legislacao/lei-municipal-16478',
                desc: 'Política Municipal do Imigrante (SP)',
            },
            {
                label: 'Decreto nº 57.533/2016',
                link: '/legislacao/decreto-57533',
                desc: 'Regulamentação da lei municipal',
            },
        ],
    },
    {
        label: 'Publicações',
        children: [
            { label: 'Central de publicações', link: '/publicacoes', desc: 'Tudo em um lugar' },
            {
                label: 'Blog e Notícias',
                link: '/publicacoes/blog',
                desc: 'Artigos e reflexões',
            },
            { label: 'Editais', link: '/publicacoes/editais', desc: 'Chamadas e seleções' },
            {
                label: 'Testemunhos',
                link: '/publicacoes/testemunhos',
                desc: 'Histórias de quem migra',
            },
        ],
    },
    { label: 'Fale Conosco', link: '/fale-conosco' },
];

export default function Header() {
    const pathname = usePathname();
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

    useEffect(() => {
        const onScroll = () => setIsScrolled(window.scrollY > 50);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Fecha o menu a cada navegação — equivale ao subscribe em NavigationEnd.
    useEffect(() => {
        setIsMenuOpen(false);
        setOpenSubmenu(null);
    }, [pathname]);

    const isActive = (link: string, exact = false) =>
        exact ? pathname === link : pathname === link || pathname.startsWith(`${link}/`);

    const closeMenu = () => {
        setIsMenuOpen(false);
        setOpenSubmenu(null);
    };

    const toggleMenu = () => {
        setIsMenuOpen((open) => {
            if (open) {
                setOpenSubmenu(null);
            }
            return !open;
        });
    };

    const toggleSubmenu = (label: string) =>
        setOpenSubmenu((current) => (current === label ? null : label));

    return (
        <header
            className={['main-header', isScrolled ? 'scrolled' : '', isMenuOpen ? 'menu-open' : '']
                .filter(Boolean)
                .join(' ')}
        >
            <div className="container header-wrapper">
                <div className="logo-area">
                    <Link href="/" className="brand-link" onClick={closeMenu}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            width={52}
                            src="/logo-small-white.png"
                            alt="Serviço Pastoral dos Migrantes"
                        />
                        <span className="brand-text">
                            <strong>SPM</strong>
                            <small>Serviço Pastoral dos Migrantes</small>
                        </span>
                    </Link>
                </div>

                <button
                    className="mobile-toggle"
                    onClick={toggleMenu}
                    aria-expanded={isMenuOpen}
                    aria-label="Abrir menu de navegação"
                >
                    <i className={`fas ${isMenuOpen ? 'fa-times' : 'fa-bars'}`}></i>
                </button>

                <nav
                    className={`nav-menu${isMenuOpen ? ' active' : ''}`}
                    aria-label="Navegação principal"
                >
                    <ul className="nav-list">
                        {navItems.map((item) => (
                            <li
                                key={item.label}
                                className={`nav-item${item.children ? ' has-children' : ''}`}
                            >
                                {!item.children ? (
                                    <Link
                                        href={item.link!}
                                        className={isActive(item.link!, item.exact) ? 'active' : ''}
                                        onClick={closeMenu}
                                    >
                                        {item.label}
                                    </Link>
                                ) : (
                                    <>
                                        <button
                                            className="nav-trigger"
                                            type="button"
                                            onClick={() => toggleSubmenu(item.label)}
                                            aria-expanded={openSubmenu === item.label}
                                        >
                                            {item.label}
                                            <i className="fas fa-chevron-down"></i>
                                        </button>

                                        <div
                                            className={`dropdown${
                                                openSubmenu === item.label ? ' is-open' : ''
                                            }`}
                                            role="menu"
                                        >
                                            {item.children.map((child) => (
                                                <Link
                                                    key={child.link}
                                                    className={`dropdown-link${
                                                        isActive(child.link) ? ' active' : ''
                                                    }`}
                                                    href={child.link}
                                                    onClick={closeMenu}
                                                    role="menuitem"
                                                >
                                                    <strong>{child.label}</strong>
                                                    {child.desc && <small>{child.desc}</small>}
                                                </Link>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </li>
                        ))}

                        <li className="nav-item mobile-only-block">
                            <Link className="nav-secure" href="/atendente" onClick={closeMenu}>
                                <i className="fas fa-lock"></i> Área do Atendente
                            </Link>
                        </li>

                        <li className="mobile-only-btn">
                            <Link
                                href="/como-ajudar"
                                className="btn-donate-mobile"
                                onClick={closeMenu}
                            >
                                Como Ajudar
                            </Link>
                        </li>
                    </ul>
                </nav>

                <div className="header-actions desktop-only">
                    <Link
                        href="/atendente"
                        className="btn-secure"
                        title="Área restrita do atendente"
                    >
                        <i className="fas fa-lock"></i>
                    </Link>
                    <Link href="/como-ajudar" className="btn-donate">
                        Como Ajudar
                    </Link>
                </div>
            </div>
        </header>
    );
}
