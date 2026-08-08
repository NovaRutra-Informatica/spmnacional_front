import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/auth.service';
import { NewsService } from '../../../core/news.service';
import { UsersService } from '../../../core/users.service';

@Component({
    selector: 'app-admin-layout',
    standalone: true,
    imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
    templateUrl: './admin-layout.component.html',
})
export class AdminLayoutComponent {
    private readonly router = inject(Router);
    readonly auth = inject(AuthService);
    readonly news = inject(NewsService);
    readonly users = inject(UsersService);

    sidebarOpen = false;

    readonly pendingCount = computed(() => this.news.drafts() + this.news.inReview());

    toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
    }

    closeSidebar() {
        this.sidebarOpen = false;
    }

    logout() {
        this.auth.logout();
        this.router.navigate(['/atendente']);
    }
}
