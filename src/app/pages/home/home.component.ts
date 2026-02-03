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
        { name: 'OIM ONU', img: '../../../assets/parceiros/iom.png' },
        { name: 'Cáritas', img: '../../../assets/parceiros/caritas.png' },
        { name: 'MPT', img: '../../../assets/parceiros/mpt.png' },
        { name: 'Misereor', img: '../../../assets/parceiros/misereor.png' },
        { name: 'Adveniat', img: '../../../assets/parceiros/adveniat.png' },
        { name: 'Sebrae', img: '../../../assets/parceiros/sebrae.png' },
    ];

    partnersList = [...this.originalPartners, ...this.originalPartners];
}
