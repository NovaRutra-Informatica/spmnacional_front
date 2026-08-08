import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';

@Component({
    selector: 'app-privacidade',
    standalone: true,
    imports: [CommonModule, RouterLink, PageHeroComponent],
    templateUrl: './privacidade.component.html',
})
export class PrivacidadeComponent {}
