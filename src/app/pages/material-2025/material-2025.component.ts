import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-material-2025',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './material-2025.component.html',
})
export class Material2025Component {
    readonly downloads = [
        {
            icon: 'fa-book-open',
            title: 'Texto-base — Migração e Esperança',
            meta: 'PDF · 3,8 MB · 64 páginas',
        },
        {
            icon: 'fa-bible',
            title: 'Roteiro de círculos bíblicos (7 encontros)',
            meta: 'PDF · 1,9 MB',
        },
        {
            icon: 'fa-church',
            title: 'Roteiro de celebração do Dia do Migrante',
            meta: 'PDF · 920 KB',
        },
        { icon: 'fa-hands-praying', title: 'Novena preparatória', meta: 'PDF · 1,2 MB' },
        {
            icon: 'fa-cake-candles',
            title: 'Caderno comemorativo — 40 anos do SPM',
            meta: 'PDF · 6,5 MB',
        },
        {
            icon: 'fa-image',
            title: 'Cartaz oficial — formato A2',
            meta: 'PDF alta resolução · 11 MB',
        },
        { icon: 'fa-image', title: 'Cartaz oficial — formato A4', meta: 'PDF · 4,9 MB' },
        { icon: 'fa-share-nodes', title: 'Kit de artes para redes sociais', meta: 'ZIP · 16 MB' },
    ];
}
