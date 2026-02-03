import { Component, HostListener, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common'; // Importante para o *ngIf funcionar
import { HeaderComponent } from './pages/components/header/header.component';
import { FooterComponent } from './pages/components/footer/footer.component';

@Component({
    selector: 'app-root',
    standalone: true,
    // O CommonModule AQUI é obrigatório para os botões funcionarem
    imports: [RouterOutlet, HeaderComponent, FooterComponent, CommonModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
    title = 'spm-nacional-site';

    // Variáveis de controle
    showBackToTop = false;
    cookiesAccepted = false;

    constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

    ngOnInit() {
        // Verifica cookies apenas no navegador (evita erro de servidor)
        if (isPlatformBrowser(this.platformId)) {
            this.cookiesAccepted = localStorage.getItem('spm_cookies') === 'true';
        }
    }

    // Detecta a rolagem da tela
    @HostListener('window:scroll', [])
    onWindowScroll() {
        if (isPlatformBrowser(this.platformId)) {
            // Mostra o botão após rolar 400px
            this.showBackToTop = window.scrollY > 400;
        }
    }

    // Ação de voltar ao topo
    scrollToTop() {
        if (isPlatformBrowser(this.platformId)) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    // Aceitar cookies
    acceptCookies() {
        this.cookiesAccepted = true;
        if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem('spm_cookies', 'true');
        }
    }
}
