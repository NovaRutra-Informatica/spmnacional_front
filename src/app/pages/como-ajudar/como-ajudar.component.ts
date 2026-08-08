import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-como-ajudar',
    standalone: true,
    imports: [CommonModule, RouterLink, PageHeroComponent, AnimateOnScrollDirective],
    templateUrl: './como-ajudar.component.html',
})
export class ComoAjudarComponent {
    readonly valores = [30, 50, 100, 250];
    selectedValue = 50;
    frequency: 'mensal' | 'unica' = 'mensal';

    readonly impactos = [
        {
            valor: 'R$ 30',
            title: 'Kit de chegada',
            text: 'Itens de higiene, alimentação e informação em língua materna para uma pessoa recém-chegada.',
        },
        {
            valor: 'R$ 50',
            title: 'Documentação',
            text: 'Cobre taxas, fotos e transporte para que uma pessoa consiga iniciar sua regularização migratória.',
        },
        {
            valor: 'R$ 100',
            title: 'Uma noite de acolhida',
            text: 'Custeia a hospedagem, a alimentação e o acompanhamento de uma família por uma noite.',
        },
        {
            valor: 'R$ 250',
            title: 'Formação de liderança',
            text: 'Viabiliza a participação de uma liderança migrante em um encontro regional de formação.',
        },
    ];

    select(v: number) {
        this.selectedValue = v;
    }

    setFrequency(f: 'mensal' | 'unica') {
        this.frequency = f;
    }
}
