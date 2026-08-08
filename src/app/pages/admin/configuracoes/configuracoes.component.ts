import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth.service';

@Component({
    selector: 'app-admin-configuracoes',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './configuracoes.component.html',
})
export class AdminConfiguracoesComponent {
    readonly auth = inject(AuthService);

    readonly tabs = ['Institucional', 'Contato', 'Site', 'Conta'];
    activeTab = 'Institucional';

    siteName = 'SPM — Serviço Pastoral dos Migrantes';
    tagline = 'Acolher, Proteger, Promover e Integrar.';
    description =
        'Organismo da Pastoral Social da CNBB que, desde 1985, acolhe, organiza e defende os direitos de migrantes e refugiados em todo o Brasil.';

    address = 'Rua Caiambé, 126 — Ipiranga';
    city = 'São Paulo — SP';
    zip = '04264-060';
    phone = '(11) 2063-7064';
    email = 'contato@spmnacional.org.br';
    hours = 'Segunda a sexta, das 9h às 17h';

    instagram = 'https://instagram.com/spmnacional';
    facebook = 'https://facebook.com/spmnacional';
    youtube = 'https://youtube.com/@spmnacional';
    whatsapp = '';

    showBanner = true;
    showNewsletter = true;
    showCookieNotice = true;
    maintenance = false;

    currentPassword = '';
    newPassword = '';
    confirmPassword = '';

    readonly feedback = signal<string | null>(null);
    readonly error = signal<string | null>(null);

    setTab(tab: string) {
        this.activeTab = tab;
        this.feedback.set(null);
        this.error.set(null);
    }

    save() {
        this.error.set(null);
        this.feedback.set('Configurações salvas nesta sessão.');
    }

    changePassword() {
        if (!this.currentPassword || !this.newPassword) {
            this.error.set('Preencha a senha atual e a nova senha.');
            return;
        }
        if (this.newPassword.length < 8) {
            this.error.set('A nova senha deve ter pelo menos 8 caracteres.');
            return;
        }
        if (this.newPassword !== this.confirmPassword) {
            this.error.set('A confirmação não corresponde à nova senha.');
            return;
        }
        this.error.set(null);
        this.feedback.set(
            'No protótipo a senha não é alterada de fato — isso exige o backend de autenticação.',
        );
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
    }
}
