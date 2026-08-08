import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface SessionUser {
    name: string;
    username: string;
    email: string;
    role: string;
    initials: string;
}

/**
 * Autenticação de demonstração.
 *
 * ATENÇÃO: as credenciais estão no código do front-end apenas para permitir a
 * navegação pelas telas administrativas neste protótipo. Antes de qualquer uso
 * real, isto precisa ser substituído por autenticação no servidor (token/sessão),
 * pois qualquer pessoa consegue ler estas credenciais no bundle publicado.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly platformId = inject(PLATFORM_ID);
    private readonly storageKey = 'spm_admin_session';

    private readonly credentials = { username: 'admin', password: 'soufoda' };

    private readonly adminUser: SessionUser = {
        name: 'Administrador do SPM',
        username: 'admin',
        email: 'admin@spmnacional.org.br',
        role: 'Administrador geral',
        initials: 'AD',
    };

    readonly user = signal<SessionUser | null>(null);
    readonly isLoggedIn = computed(() => this.user() !== null);

    constructor() {
        this.restore();
    }

    login(username: string, password: string): boolean {
        const ok =
            username.trim().toLowerCase() === this.credentials.username &&
            password === this.credentials.password;

        if (!ok) {
            return false;
        }

        this.user.set(this.adminUser);
        if (isPlatformBrowser(this.platformId)) {
            sessionStorage.setItem(this.storageKey, JSON.stringify(this.adminUser));
        }
        return true;
    }

    logout(): void {
        this.user.set(null);
        if (isPlatformBrowser(this.platformId)) {
            sessionStorage.removeItem(this.storageKey);
        }
    }

    private restore(): void {
        if (!isPlatformBrowser(this.platformId)) {
            return;
        }
        const raw = sessionStorage.getItem(this.storageKey);
        if (!raw) {
            return;
        }
        try {
            this.user.set(JSON.parse(raw) as SessionUser);
        } catch {
            sessionStorage.removeItem(this.storageKey);
        }
    }
}
