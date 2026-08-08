import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';

@Component({
    selector: 'app-nao-encontrado',
    standalone: true,
    imports: [CommonModule, RouterLink, PageHeroComponent],
    templateUrl: './nao-encontrado.component.html',
})
export class NaoEncontradoComponent {}
