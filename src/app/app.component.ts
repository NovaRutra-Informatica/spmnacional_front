import { Component, HostListener, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { filter } from 'rxjs/operators';
import { HeaderComponent } from './pages/components/header/header.component';
import { FooterComponent } from './pages/components/footer/footer.component';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, RouterLink, HeaderComponent, FooterComponent, CommonModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
    showBackToTop = false;
    cookiesAccepted = false;

    /** Rotas do painel usam layout próprio, sem o cabeçalho e o rodapé públicos. */
    readonly isAdminArea = signal(false);

    constructor(
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object,
    ) {
        this.isAdminArea.set(this.router.url.startsWith('/admin'));

        this.router.events
            .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
            .subscribe((event) => {
                this.isAdminArea.set(event.urlAfterRedirects.startsWith('/admin'));
            });
    }

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
