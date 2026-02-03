import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CountUpDirective } from '../../shared/directives/count-up.directive';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [CommonModule, CountUpDirective, AnimateOnScrollDirective],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss'
})
export class HomeComponent {
    originalPartners = [
        { name: 'CNBB', img: '../../../assets/parceiros/cnbb.png' },
        { name: 'Cáritas', img: '../../../assets/parceiros/caritas.png' },
        { name: 'Misereor', img: '../../../assets/parceiros/misereor.png' },
        { name: 'Adveniat', img: '../../../assets/parceiros/adveniat.png' },
        { name: 'Rede Clamor', img: '../../../assets/parceiros/redeclamor.png' },
    ];

    partnersList = [...this.originalPartners, ...this.originalPartners];
}
