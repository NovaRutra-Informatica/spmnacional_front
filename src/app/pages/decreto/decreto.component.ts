import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-decreto',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './decreto.component.html',
})
export class DecretoComponent {
    readonly eixos = [
        {
            icon: 'fa-notes-medical',
            area: 'Saúde',
            text: 'Atendimento nas unidades básicas independentemente da situação migratória, capacitação intercultural das equipes e produção de material informativo em outras línguas.',
        },
        {
            icon: 'fa-briefcase',
            area: 'Trabalho e renda',
            text: 'Inclusão de imigrantes nos programas municipais de qualificação, intermediação de mão de obra e apoio ao empreendedorismo, com enfrentamento à exploração laboral.',
        },
        {
            icon: 'fa-house',
            area: 'Moradia',
            text: 'Consideração da população imigrante nas políticas habitacionais e nas ações voltadas a cortiços e moradias precárias.',
        },
        {
            icon: 'fa-graduation-cap',
            area: 'Educação',
            text: 'Garantia de matrícula na rede municipal sem exigências documentais indevidas e ações de acolhimento linguístico para estudantes imigrantes.',
        },
        {
            icon: 'fa-shield-heart',
            area: 'Prevenção da violência',
            text: 'Ações de prevenção e enfrentamento à violência contra imigrantes, com atenção prioritária a mulheres, crianças e adolescentes.',
        },
        {
            icon: 'fa-people-group',
            area: 'Participação comunitária',
            text: 'Fortalecimento de coletivos e associações de imigrantes por meio de editais públicos, oficinas de capacitação e apoio à formalização de novos grupos.',
        },
    ];
}
