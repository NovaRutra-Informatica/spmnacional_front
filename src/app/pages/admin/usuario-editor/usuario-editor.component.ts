import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UsersService, UserStatus } from '../../../core/users.service';

@Component({
    selector: 'app-admin-usuario-editor',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './usuario-editor.component.html',
})
export class AdminUsuarioEditorComponent {
    private readonly router = inject(Router);
    readonly users = inject(UsersService);

    name = '';
    email = '';
    role = 'Atendente regional';
    regional = 'Secretariado Nacional';
    status: UserStatus = 'pendente';
    sendInvite = true;
    requireMfa = true;

    readonly saved = signal(false);
    readonly error = signal<string | null>(null);

    get initials(): string {
        return this.name.trim() ? this.users.initialsFrom(this.name) : '??';
    }

    get selectedRole() {
        return this.users.roles().find((r) => r.name === this.role) ?? null;
    }

    permissionLabel(key: string): string {
        return this.users.permissionLabels.find((p) => p.key === key)?.label ?? key;
    }

    save() {
        if (!this.name.trim()) {
            this.error.set('Informe o nome da pessoa ou da equipe.');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
            this.error.set('Informe um e-mail válido.');
            return;
        }
        if (this.users.users().some((u) => u.email === this.email.trim().toLowerCase())) {
            this.error.set('Já existe uma conta com este e-mail.');
            return;
        }

        this.error.set(null);

        this.users.create({
            name: this.name.trim(),
            email: this.email.trim().toLowerCase(),
            role: this.role,
            regional: this.regional,
            status: this.sendInvite ? 'pendente' : this.status,
        });

        this.saved.set(true);
        setTimeout(() => this.router.navigate(['/admin/usuarios']), 900);
    }
}
