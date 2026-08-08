import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NewsService } from '../../../core/news.service';
import { UsersService } from '../../../core/users.service';
import { AuthService } from '../../../core/auth.service';

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './dashboard.component.html',
})
export class AdminDashboardComponent {
    readonly news = inject(NewsService);
    readonly users = inject(UsersService);
    readonly auth = inject(AuthService);

    readonly recent = computed(() => this.news.items().slice(0, 5));
    readonly log = computed(() => this.users.accessLog().slice(0, 6));

    readonly byCategory = computed(() => {
        const items = this.news.items();
        const total = items.length || 1;
        return this.news.categories
            .map((category) => {
                const count = items.filter((i) => i.category === category).length;
                return { category, count, pct: Math.round((count / total) * 100) };
            })
            .filter((row) => row.count > 0)
            .sort((a, b) => b.count - a.count);
    });

    readonly topPosts = computed(() =>
        [...this.news.items()]
            .filter((i) => i.status === 'publicado')
            .sort((a, b) => b.views - a.views)
            .slice(0, 4),
    );

    logIcon(level: string): string {
        if (level === 'critico') return 'fa-triangle-exclamation';
        if (level === 'alerta') return 'fa-circle-exclamation';
        return 'fa-circle-check';
    }
}
