import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-semana-do-migrante',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './semana-do-migrante.component.html',
})
export class SemanaDoMigranteComponent {
    readonly edicoes = [
        {
            ano: '2026',
            edicao: '41ª edição',
            tema: 'Migração e Moradia',
            lema: '“Eu não tenho onde morar!”',
            periodo: '14 a 21 de junho de 2026',
            img: 'assets/house.jpg',
            link: '/semana-do-migrante/material-2026',
        },
        {
            ano: '2025',
            edicao: '40ª edição',
            tema: 'Migração e Esperança',
            lema: '“Sempre no caminho com os migrantes”',
            periodo: '15 a 22 de junho de 2025',
            img: 'assets/exemplo-migrantes.jpeg',
            link: '/semana-do-migrante/material-2025',
        },
        {
            ano: '2024',
            edicao: '39ª edição',
            tema: 'Migração e Casa Comum',
            lema: '“Amplia o espaço da tua tenda” (Is 54,2)',
            periodo: '16 a 23 de junho de 2024',
            img: 'assets/hero-bg-large.jpeg',
            link: '/semana-do-migrante/material-2024',
        },
    ];

    readonly materiais = [
        {
            icon: 'fa-book-open',
            title: 'Texto-base',
            text: 'Aprofundamento do tema do ano, com dados, análise de conjuntura e referências bíblicas.',
        },
        {
            icon: 'fa-bible',
            title: 'Círculos bíblicos',
            text: 'Roteiros de encontro para grupos e comunidades, com dinâmica, leitura e compromisso.',
        },
        {
            icon: 'fa-image',
            title: 'Cartazes',
            text: 'Versões grande e pequena, em alta resolução, para impressão em paróquias e escolas.',
        },
        {
            icon: 'fa-church',
            title: 'Roteiro de celebração',
            text: 'Sugestão litúrgica para a missa do Dia do Migrante e para celebrações da palavra.',
        },
        {
            icon: 'fa-hands-praying',
            title: 'Novena e orações',
            text: 'Preces e novena preparatória para rezar em família, em comunidade ou nos grupos de base.',
        },
        {
            icon: 'fa-shirt',
            title: 'Identidade visual',
            text: 'Marca da edição, artes para redes sociais e arquivos para camisetas e faixas.',
        },
    ];
}
