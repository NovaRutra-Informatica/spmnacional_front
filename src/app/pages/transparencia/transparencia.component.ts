import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-transparencia',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './transparencia.component.html',
})
export class TransparenciaComponent {
    readonly aplicacao = [
        { label: 'Acolhida e atendimento direto', pct: 42 },
        { label: 'Formação e produção de subsídios', pct: 22 },
        { label: 'Incidência política e articulação em rede', pct: 15 },
        { label: 'Comunicação e campanhas', pct: 11 },
        { label: 'Administração e manutenção da estrutura', pct: 10 },
    ];

    readonly parceiros = [
        { name: 'CNBB', img: 'assets/parceiros/cnbb.png' },
        { name: 'Cáritas', img: 'assets/parceiros/caritas.png' },
        { name: 'Misereor', img: 'assets/parceiros/misereor.png' },
        { name: 'Adveniat', img: 'assets/parceiros/adveniat.png' },
        { name: 'Rede Clamor', img: 'assets/parceiros/redeclamor.png' },
    ];
}
