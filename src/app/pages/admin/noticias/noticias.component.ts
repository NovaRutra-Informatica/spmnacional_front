import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NewsItem, NewsService, NewsStatus } from '../../../core/news.service';

@Component({
    selector: 'app-admin-noticias',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './noticias.component.html',
})
export class AdminNoticiasComponent {
    readonly news = inject(NewsService);

    readonly search = signal('');
    readonly statusFilter = signal<'todos' | NewsStatus>('todos');
    readonly categoryFilter = signal('todas');

    readonly statuses: { value: 'todos' | NewsStatus; label: string }[] = [
        { value: 'todos', label: 'Todos os status' },
        { value: 'publicado', label: 'Publicado' },
        { value: 'rascunho', label: 'Rascunho' },
        { value: 'revisao', label: 'Em revisão' },
        { value: 'agendado', label: 'Agendado' },
    ];

    readonly filtered = computed<NewsItem[]>(() => {
        const term = this.search().trim().toLowerCase();
        const status = this.statusFilter();
        const category = this.categoryFilter();

        return this.news.items().filter((item) => {
            const matchesTerm =
                !term ||
                item.title.toLowerCase().includes(term) ||
                item.author.toLowerCase().includes(term) ||
                item.tags.some((t) => t.includes(term));
            const matchesStatus = status === 'todos' || item.status === status;
            const matchesCategory = category === 'todas' || item.category === category;
            return matchesTerm && matchesStatus && matchesCategory;
        });
    });

    onSearch(value: string) {
        this.search.set(value);
    }

    remove(item: NewsItem) {
        const ok = confirm(`Excluir definitivamente a notícia “${item.title}”?`);
        if (ok) {
            this.news.remove(item.id);
        }
    }

    publish(item: NewsItem) {
        this.news.setStatus(item.id, item.status === 'publicado' ? 'rascunho' : 'publicado');
    }

    toggleHighlight(item: NewsItem) {
        this.news.toggleHighlight(item.id);
    }
}
