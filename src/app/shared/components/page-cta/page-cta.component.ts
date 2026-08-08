import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-page-cta',
    standalone: true,
    imports: [CommonModule, RouterLink],
    template: `
        <section class="cta-band">
            <div class="container">
                <h2>{{ title }}</h2>
                <p>{{ text }}</p>
                <div class="cta-band__actions">
                    <a class="btn btn--cta" [routerLink]="primaryLink">
                        <i class="fas fa-heart"></i> {{ primaryLabel }}
                    </a>
                    <a class="btn btn--light" [routerLink]="secondaryLink">{{ secondaryLabel }}</a>
                </div>
            </div>
        </section>
    `,
})
export class PageCtaComponent {
    @Input() title = 'Ninguém constrói pontes sozinho';
    @Input() text =
        'Sua doação, seu tempo ou sua articulação local sustentam a acolhida de quem chega. Some-se à rede do SPM.';
    @Input() primaryLabel = 'Como Ajudar';
    @Input() primaryLink = '/como-ajudar';
    @Input() secondaryLabel = 'Fale Conosco';
    @Input() secondaryLink = '/fale-conosco';
}
