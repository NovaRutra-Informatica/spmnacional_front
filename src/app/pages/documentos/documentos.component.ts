import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

interface Doc {
    title: string;
    category: string;
    meta: string;
    icon: string;
}

@Component({
    selector: 'app-documentos',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './documentos.component.html',
})
export class DocumentosComponent {
    readonly categories = [
        'Todos',
        'Institucional',
        'Assembleias',
        'Notas públicas',
        'Formação',
        'Relatórios',
    ];

    activeCategory = 'Todos';

    readonly docs: Doc[] = [
        {
            title: 'Estatuto do Serviço Pastoral dos Migrantes',
            category: 'Institucional',
            meta: 'PDF · 1,2 MB · Atualizado em 2023',
            icon: 'fa-file-contract',
        },
        {
            title: 'Regimento interno das equipes regionais',
            category: 'Institucional',
            meta: 'PDF · 640 KB · 2022',
            icon: 'fa-file-lines',
        },
        {
            title: 'Identidade, missão e metodologia FIA',
            category: 'Institucional',
            meta: 'PDF · 890 KB · 2021',
            icon: 'fa-compass',
        },
        {
            title: 'Carta final da Assembleia Nacional 2025',
            category: 'Assembleias',
            meta: 'PDF · 420 KB · Junho de 2025',
            icon: 'fa-file-signature',
        },
        {
            title: 'Ata da Assembleia Nacional 2025',
            category: 'Assembleias',
            meta: 'PDF · 780 KB · Junho de 2025',
            icon: 'fa-file-lines',
        },
        {
            title: 'Carta final da Assembleia Nacional 2023',
            category: 'Assembleias',
            meta: 'PDF · 410 KB · Julho de 2023',
            icon: 'fa-file-signature',
        },
        {
            title: 'Nota pública sobre moradia digna para famílias migrantes',
            category: 'Notas públicas',
            meta: 'PDF · 210 KB · Junho de 2026',
            icon: 'fa-bullhorn',
        },
        {
            title: 'Nota pública contra a xenofobia nas redes sociais',
            category: 'Notas públicas',
            meta: 'PDF · 180 KB · Março de 2026',
            icon: 'fa-bullhorn',
        },
        {
            title: 'Nota conjunta sobre trabalho análogo à escravidão no agronegócio',
            category: 'Notas públicas',
            meta: 'PDF · 260 KB · Novembro de 2025',
            icon: 'fa-bullhorn',
        },
        {
            title: 'Roteiro de círculos bíblicos sobre mobilidade humana',
            category: 'Formação',
            meta: 'PDF · 1,6 MB · 2025',
            icon: 'fa-book-open',
        },
        {
            title: 'Cartilha: seus direitos como pessoa migrante no Brasil',
            category: 'Formação',
            meta: 'PDF · 2,4 MB · 2024',
            icon: 'fa-book',
        },
        {
            title: 'Guia de acolhida para paróquias e comunidades',
            category: 'Formação',
            meta: 'PDF · 1,9 MB · 2024',
            icon: 'fa-book',
        },
        {
            title: 'Relatório de atividades 2025',
            category: 'Relatórios',
            meta: 'PDF · 3,1 MB · Março de 2026',
            icon: 'fa-chart-column',
        },
        {
            title: 'Demonstrativo financeiro 2025',
            category: 'Relatórios',
            meta: 'PDF · 1,1 MB · Março de 2026',
            icon: 'fa-coins',
        },
        {
            title: 'Relatório de atividades 2024',
            category: 'Relatórios',
            meta: 'PDF · 2,8 MB · Março de 2025',
            icon: 'fa-chart-column',
        },
    ];

    get filteredDocs(): Doc[] {
        return this.activeCategory === 'Todos'
            ? this.docs
            : this.docs.filter((d) => d.category === this.activeCategory);
    }

    setCategory(category: string) {
        this.activeCategory = category;
    }
}
