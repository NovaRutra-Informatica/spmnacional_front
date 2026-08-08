import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-material-2024',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './material-2024.component.html',
})
export class Material2024Component {
    readonly downloads = [
        {
            icon: 'fa-book-open',
            title: 'Texto-base — Migração e Casa Comum',
            meta: 'PDF · 3,5 MB · 60 páginas',
        },
        {
            icon: 'fa-bible',
            title: 'Roteiro de círculos bíblicos (7 encontros)',
            meta: 'PDF · 1,8 MB',
        },
        {
            icon: 'fa-church',
            title: 'Roteiro de celebração do Dia do Migrante',
            meta: 'PDF · 880 KB',
        },
        { icon: 'fa-hands-praying', title: 'Novena preparatória', meta: 'PDF · 1,1 MB' },
        { icon: 'fa-leaf', title: 'Caderno sobre migração climática', meta: 'PDF · 2,7 MB' },
        {
            icon: 'fa-image',
            title: 'Cartaz oficial — formato A2',
            meta: 'PDF alta resolução · 10 MB',
        },
        { icon: 'fa-image', title: 'Cartaz oficial — formato A4', meta: 'PDF · 4,5 MB' },
        { icon: 'fa-share-nodes', title: 'Kit de artes para redes sociais', meta: 'ZIP · 14 MB' },
    ];
}
