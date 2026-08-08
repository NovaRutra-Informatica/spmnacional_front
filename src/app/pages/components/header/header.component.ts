import { Component, HostListener, Inject, PLATFORM_ID } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { filter } from 'rxjs/operators';

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

@Component({
    selector: 'app-header',
    standalone: true,
    imports: [RouterLink, RouterLinkActive, CommonModule],
    templateUrl: './header.component.html',
    styleUrl: './header.component.scss',
})
export class HeaderComponent {
    isScrolled = false;
    isMenuOpen = false;
    openSubmenu: string | null = null;

    readonly navItems: NavItem[] = [
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

    constructor(
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object,
    ) {
        this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
            this.closeMenu();
        });
    }

    @HostListener('window:scroll', [])
    onWindowScroll() {
        if (isPlatformBrowser(this.platformId)) {
            this.isScrolled = window.scrollY > 50;
        }
    }

    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
        if (!this.isMenuOpen) {
            this.openSubmenu = null;
        }
    }

    toggleSubmenu(label: string) {
        this.openSubmenu = this.openSubmenu === label ? null : label;
    }

    closeMenu() {
        this.isMenuOpen = false;
        this.openSubmenu = null;
    }
}
