import { Component, HostListener, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HeaderComponent } from './pages/components/header/header.component';
import { FooterComponent } from './pages/components/footer/footer.component';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, HeaderComponent, FooterComponent, CommonModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
    showBackToTop = false;
    cookiesAccepted = false;

    constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

    ngOnInit() {
        if (isPlatformBrowser(this.platformId)) {
            this.cookiesAccepted = localStorage.getItem('spm_cookies') === 'true';
        }
    }

    @HostListener('window:scroll', [])
    onWindowScroll() {
        if (isPlatformBrowser(this.platformId)) {
            this.showBackToTop = window.scrollY > 400;
        }
    }

    scrollToTop() {
        if (isPlatformBrowser(this.platformId)) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    acceptCookies() {
        this.cookiesAccepted = true;
        if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem('spm_cookies', 'true');
        }
    }
}
