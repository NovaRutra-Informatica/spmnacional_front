import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

export interface Crumb {
    label: string;
    link?: string;
}

@Component({
    selector: 'app-page-hero',
    standalone: true,
    imports: [CommonModule, RouterLink],
    template: `
        <section class="page-hero" [class.page-hero--center]="center">
            <div class="container">
                <div class="page-hero__inner">
                    @if (crumbs.length) {
                        <ul class="breadcrumb">
                            <li><a routerLink="/">Início</a></li>
                            @for (crumb of crumbs; track crumb.label) {
                                <li class="sep">/</li>
                                <li [class.current]="!crumb.link">
                                    @if (crumb.link) {
                                        <a [routerLink]="crumb.link">{{ crumb.label }}</a>
                                    } @else {
                                        {{ crumb.label }}
                                    }
                                </li>
                            }
                        </ul>
                    }

                    @if (eyebrow) {
                        <span class="badge-pill badge-pill--light">{{ eyebrow }}</span>
                    }

                    <h1>{{ title }}</h1>

                    @if (subtitle) {
                        <p class="page-hero__subtitle">{{ subtitle }}</p>
                    }
                </div>
            </div>

            <div class="wave-divider">
                <svg viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden="true">
                    <path
                        [attr.fill]="waveFill"
                        d="M0,256L60,240C120,224,240,192,360,192C480,192,600,224,720,234.7C840,245,960,235,1080,213.3C1200,192,1320,160,1380,144L1440,128L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z"
                    ></path>
                </svg>
            </div>
        </section>
    `,
})
export class PageHeroComponent {
    @Input() title = '';
    @Input() subtitle = '';
    @Input() eyebrow = '';
    @Input() center = false;
    @Input() waveFill = '#ffffff';
    @Input() crumbs: Crumb[] = [];
}
