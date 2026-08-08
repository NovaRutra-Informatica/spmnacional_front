import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-material-2026',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './material-2026.component.html',
})
export class Material2026Component {
    readonly downloads = [
        {
            icon: 'fa-book-open',
            title: 'Texto-base — Migração e Moradia',
            meta: 'PDF · 4,2 MB · 68 páginas',
        },
        {
            icon: 'fa-bible',
            title: 'Roteiro de círculos bíblicos (8 encontros)',
            meta: 'PDF · 2,1 MB',
        },
        {
            icon: 'fa-church',
            title: 'Roteiro de celebração do Dia do Migrante',
            meta: 'PDF · 980 KB',
        },
        { icon: 'fa-hands-praying', title: 'Novena preparatória', meta: 'PDF · 1,3 MB' },
        {
            icon: 'fa-image',
            title: 'Cartaz oficial — formato A2',
            meta: 'PDF alta resolução · 12 MB',
        },
        { icon: 'fa-image', title: 'Cartaz oficial — formato A4', meta: 'PDF · 5,4 MB' },
        { icon: 'fa-share-nodes', title: 'Kit de artes para redes sociais', meta: 'ZIP · 18 MB' },
        { icon: 'fa-shirt', title: 'Arquivos para camiseta e faixa', meta: 'ZIP · 24 MB' },
    ];

    readonly programacao = [
        {
            dia: 'Domingo, 14/06',
            title: 'Abertura',
            text: 'Missa de abertura com apresentação do tema e acolhida das comunidades migrantes presentes.',
        },
        {
            dia: 'Segunda, 15/06',
            title: 'Moradia é direito',
            text: 'Roda de conversa sobre aluguel, cortiços e despejos, com convidados do movimento de moradia.',
        },
        {
            dia: 'Terça, 16/06',
            title: 'Escuta migrante',
            text: 'Encontro fechado, conduzido por lideranças migrantes, para levantar demandas locais.',
        },
        {
            dia: 'Quarta, 17/06',
            title: 'Formação',
            text: 'Oficina sobre a Lei de Migração e sobre políticas municipais de habitação.',
        },
        {
            dia: 'Quinta, 18/06',
            title: 'Incidência',
            text: 'Audiência ou reunião com o poder público local para apresentar as demandas levantadas.',
        },
        {
            dia: 'Sexta, 19/06',
            title: 'Cultura',
            text: 'Noite intercultural com música, comida e narrativas das comunidades migrantes.',
        },
        {
            dia: 'Sábado, 20/06',
            title: 'Mutirão',
            text: 'Ação prática: mutirão de documentação, de reforma habitacional ou de cadastro em programas.',
        },
        {
            dia: 'Domingo, 21/06',
            title: 'Encerramento',
            text: 'Celebração de envio, com leitura pública dos compromissos assumidos pela comunidade.',
        },
    ];
}
