import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminUser, UsersService, UserStatus } from '../../../core/users.service';

@Component({
    selector: 'app-admin-usuarios',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './usuarios.component.html',
})
export class AdminUsuariosComponent {
    readonly users = inject(UsersService);

    readonly search = signal('');
    readonly roleFilter = signal('todos');
    readonly statusFilter = signal<'todos' | UserStatus>('todos');

    readonly filtered = computed<AdminUser[]>(() => {
        const term = this.search().trim().toLowerCase();
        const role = this.roleFilter();
        const status = this.statusFilter();

        return this.users.users().filter((u) => {
            const matchesTerm =
                !term ||
                u.name.toLowerCase().includes(term) ||
                u.email.toLowerCase().includes(term) ||
                u.regional.toLowerCase().includes(term);
            const matchesRole = role === 'todos' || u.role === role;
            const matchesStatus = status === 'todos' || u.status === status;
            return matchesTerm && matchesRole && matchesStatus;
        });
    });

    onSearch(value: string) {
        this.search.set(value);
    }

    toggleStatus(user: AdminUser) {
        this.users.setStatus(user.id, user.status === 'ativo' ? 'inativo' : 'ativo');
    }

    isProtected(user: AdminUser): boolean {
        return user.id === 1;
    }

    remove(user: AdminUser) {
        if (this.isProtected(user)) {
            alert('A conta de administrador principal não pode ser removida.');
            return;
        }
        const ok = confirm(`Remover o acesso de ${user.name}?`);
        if (ok) {
            this.users.remove(user.id);
        }
    }
}
