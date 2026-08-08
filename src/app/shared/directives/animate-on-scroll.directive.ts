import { Directive, ElementRef, Renderer2, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Directive({
    selector: '[appAnimate]',
    standalone: true,
})
export class AnimateOnScrollDirective implements OnInit {
    constructor(
        private el: ElementRef,
        private renderer: Renderer2,
        @Inject(PLATFORM_ID) private platformId: Object,
    ) {}

    ngOnInit() {
        if (isPlatformBrowser(this.platformId)) {
            // Ambientes sem IntersectionObserver (jsdom, navegadores antigos):
            // mostra o conteúdo direto, sem animação.
            if (typeof IntersectionObserver === 'undefined') {
                return;
            }

            this.renderer.addClass(this.el.nativeElement, 'hidden-element');

            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            this.renderer.addClass(this.el.nativeElement, 'animate-fade-up');
                            observer.unobserve(this.el.nativeElement);
                        }
                    });
                },
                { threshold: 0.1 },
            );

            observer.observe(this.el.nativeElement);
        }
    }
}
