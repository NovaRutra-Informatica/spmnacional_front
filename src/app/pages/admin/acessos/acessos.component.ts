import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UsersService } from '../../../core/users.service';

@Component({
    selector: 'app-admin-acessos',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './acessos.component.html',
})
export class AdminAcessosComponent {
    readonly users = inject(UsersService);

    readonly levelFilter = signal('todos');

    readonly filteredLog = computed(() => {
        const level = this.levelFilter();
        return level === 'todos'
            ? this.users.accessLog()
            : this.users.accessLog().filter((e) => e.level === level);
    });

    readonly roleUsage = computed(() => {
        const all = this.users.users();
        const total = all.length || 1;
        return this.users.roles().map((role) => {
            const count = all.filter((u) => u.role === role.name).length;
            return { role, count, pct: Math.round((count / total) * 100) };
        });
    });

    toggle(roleKey: string, permission: string) {
        this.users.togglePermission(roleKey, permission);
    }

    levelIcon(level: string): string {
        if (level === 'critico') return 'fa-triangle-exclamation';
        if (level === 'alerta') return 'fa-circle-exclamation';
        return 'fa-circle-check';
    }
}
