import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NewsService, NewsStatus } from '../../../core/news.service';
import { AuthService } from '../../../core/auth.service';

@Component({
    selector: 'app-admin-noticia-editor',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './noticia-editor.component.html',
})
export class AdminNoticiaEditorComponent {
    private readonly router = inject(Router);
    readonly news = inject(NewsService);
    readonly auth = inject(AuthService);

    readonly covers = [
        'assets/exemplo-migrantes.jpeg',
        'assets/hero-bg-large.jpeg',
        'assets/house.jpg',
        'assets/venezuelana.jpeg',
        'assets/padre-alfredinho.png',
    ];

    title = '';
    slug = '';
    slugTouched = false;
    category = 'Notícias';
    excerpt = '';
    content = '';
    tagsText = '';
    date = '2026-08-08';
    status: NewsStatus = 'rascunho';
    cover = 'assets/exemplo-migrantes.jpeg';
    highlight = false;

    readonly uploadedName = signal<string | null>(null);
    readonly saved = signal(false);
    readonly error = signal<string | null>(null);

    onTitleChange(value: string) {
        this.title = value;
        if (!this.slugTouched) {
            this.slug = this.news.slugify(value);
        }
    }

    onSlugChange(value: string) {
        this.slugTouched = true;
        this.slug = this.news.slugify(value);
    }

    pickCover(path: string) {
        this.cover = path;
        this.uploadedName.set(null);
    }

    onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }

        if (!file.type.startsWith('image/')) {
            this.error.set('O arquivo selecionado não é uma imagem.');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            this.error.set('A imagem deve ter no máximo 5 MB.');
            return;
        }

        this.error.set(null);
        this.uploadedName.set(file.name);

        const reader = new FileReader();
        reader.onload = () => {
            this.cover = String(reader.result);
        };
        reader.readAsDataURL(file);
    }

    get tags(): string[] {
        return this.tagsText
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);
    }

    get charCount(): number {
        return this.content.length;
    }

    save(publish: boolean) {
        if (!this.title.trim()) {
            this.error.set('Informe um título para a publicação.');
            return;
        }
        if (!this.excerpt.trim()) {
            this.error.set('Escreva um resumo — ele aparece nos cards do blog.');
            return;
        }

        this.error.set(null);

        this.news.create({
            title: this.title.trim(),
            slug: this.slug || this.news.slugify(this.title),
            category: this.category,
            excerpt: this.excerpt.trim(),
            content: this.content.trim(),
            author: this.auth.user()?.name ?? 'Secretariado Nacional',
            date: this.date,
            status: publish ? 'publicado' : this.status,
            cover: this.cover,
            tags: this.tags,
            highlight: this.highlight,
        });

        this.saved.set(true);
        setTimeout(() => this.router.navigate(['/admin/noticias']), 900);
    }
}
