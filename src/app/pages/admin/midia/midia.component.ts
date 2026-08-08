import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

interface MediaFile {
    name: string;
    url: string;
    size: string;
    type: 'imagem' | 'documento';
    uploadedAt: string;
}

@Component({
    selector: 'app-admin-midia',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './midia.component.html',
})
export class AdminMidiaComponent {
    readonly files = signal<MediaFile[]>([
        {
            name: 'hero-bg-large.jpeg',
            url: 'assets/hero-bg-large.jpeg',
            size: '842 KB',
            type: 'imagem',
            uploadedAt: '12/03/2026',
        },
        {
            name: 'exemplo-migrantes.jpeg',
            url: 'assets/exemplo-migrantes.jpeg',
            size: '615 KB',
            type: 'imagem',
            uploadedAt: '02/03/2026',
        },
        {
            name: 'house.jpg',
            url: 'assets/house.jpg',
            size: '498 KB',
            type: 'imagem',
            uploadedAt: '18/02/2026',
        },
        {
            name: 'venezuelana.jpeg',
            url: 'assets/venezuelana.jpeg',
            size: '387 KB',
            type: 'imagem',
            uploadedAt: '14/02/2026',
        },
        {
            name: 'padre-alfredinho.png',
            url: 'assets/padre-alfredinho.png',
            size: '1,1 MB',
            type: 'imagem',
            uploadedAt: '09/01/2026',
        },
        {
            name: 'texto-base-semana-2026.pdf',
            url: '',
            size: '4,2 MB',
            type: 'documento',
            uploadedAt: '20/04/2026',
        },
        {
            name: 'cartaz-semana-2026-a2.pdf',
            url: '',
            size: '12 MB',
            type: 'documento',
            uploadedAt: '20/04/2026',
        },
        {
            name: 'relatorio-atividades-2025.pdf',
            url: '',
            size: '3,1 MB',
            type: 'documento',
            uploadedAt: '15/03/2026',
        },
    ]);

    readonly typeFilter = signal('todos');
    readonly uploadFeedback = signal<string | null>(null);

    readonly filtered = computed(() => {
        const type = this.typeFilter();
        return type === 'todos' ? this.files() : this.files().filter((f) => f.type === type);
    });

    readonly imageCount = computed(() => this.files().filter((f) => f.type === 'imagem').length);
    readonly docCount = computed(() => this.files().filter((f) => f.type === 'documento').length);

    onUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        const selected = Array.from(input.files ?? []);
        if (!selected.length) {
            return;
        }

        const added: MediaFile[] = selected.map((file) => ({
            name: file.name,
            url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
            size: this.formatSize(file.size),
            type: file.type.startsWith('image/') ? 'imagem' : 'documento',
            uploadedAt: 'agora',
        }));

        this.files.update((list) => [...added, ...list]);
        this.uploadFeedback.set(
            `${added.length} arquivo${added.length > 1 ? 's' : ''} adicionado${added.length > 1 ? 's' : ''} à biblioteca.`,
        );
        input.value = '';
    }

    remove(file: MediaFile) {
        const ok = confirm(`Remover “${file.name}” da biblioteca?`);
        if (ok) {
            this.files.update((list) => list.filter((f) => f !== file));
        }
    }

    private formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
}
