import { Directive, ElementRef, Input, OnInit, Renderer2, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Directive({
    selector: '[appCountUp]',
    standalone: true
})
export class CountUpDirective implements OnInit {
    @Input('appCountUp') endValue: number = 0;
    @Input() duration: number = 2000;
    @Input() suffix: string = '';
    @Input() prefix: string = '';

    private hasAnimated = false;

    constructor(
        private el: ElementRef,
        private renderer: Renderer2,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {}

    ngOnInit() {
        if (isPlatformBrowser(this.platformId)) {
            this.createObserver();
        } else {
            this.renderer.setProperty(this.el.nativeElement, 'textContent', this.prefix + this.endValue + this.suffix);
        }
    }

    private createObserver() {
        const options = {
            root: null,
            rootMargin: '0px',
            threshold: 0.2
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !this.hasAnimated) {
                    this.animate();
                    this.hasAnimated = true;
                }
            });
        }, options);

        observer.observe(this.el.nativeElement);
    }

    private animate() {
        let startTimestamp: number | null = null;
        const step = (timestamp: number) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / this.duration, 1);
            const easeProgress = 1 - (1 - progress) * (1 - progress);
            const currentCount = Math.floor(easeProgress * this.endValue);

            this.renderer.setProperty(this.el.nativeElement, 'textContent', this.prefix + currentCount + this.suffix);

            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };

        window.requestAnimationFrame(step);
    }
}
