import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { AuthService } from '../../core/auth.service';

@Component({
    selector: 'app-atendente',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, PageHeroComponent],
    templateUrl: './atendente.component.html',
})
export class AtendenteComponent {
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);

    username = '';
    password = '';
    showPassword = false;

    readonly error = signal<string | null>(null);
    readonly loading = signal(false);

    togglePassword() {
        this.showPassword = !this.showPassword;
    }

    submit() {
        this.error.set(null);

        if (!this.username.trim() || !this.password) {
            this.error.set('Informe usuário e senha.');
            return;
        }

        this.loading.set(true);

        setTimeout(() => {
            const ok = this.auth.login(this.username, this.password);
            this.loading.set(false);

            if (ok) {
                this.router.navigate(['/admin']);
            } else {
                this.error.set('Usuário ou senha incorretos. Verifique e tente novamente.');
                this.password = '';
            }
        }, 400);
    }
}
