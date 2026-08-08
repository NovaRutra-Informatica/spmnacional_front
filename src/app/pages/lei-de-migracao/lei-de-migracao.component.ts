import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-lei-de-migracao',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './lei-de-migracao.component.html',
})
export class LeiDeMigracaoComponent {
    openPrinciple: number | null = null;

    readonly principios = [
        {
            title: 'Universalidade, indivisibilidade e interdependência dos direitos humanos',
            body: 'Direitos humanos não se fatiam. A lei parte do princípio de que o direito à vida, à saúde, ao trabalho e à liberdade formam um conjunto indissociável, válido para qualquer pessoa em território nacional.',
        },
        {
            title: 'Repúdio e prevenção à xenofobia, ao racismo e a quaisquer formas de discriminação',
            body: 'O Estado brasileiro assume o dever de combater ativamente a hostilidade contra quem migra — e não apenas de se abster de discriminar.',
        },
        {
            title: 'Não criminalização da migração',
            body: 'Estar em situação migratória irregular é uma questão administrativa, não um crime. Esse foi um dos rompimentos mais importantes com o antigo Estatuto do Estrangeiro.',
        },
        {
            title: 'Acolhida humanitária',
            body: 'Prevê a possibilidade de acolhida de pessoas apátridas ou vindas de países em situação de grave instabilidade, conflito armado, calamidade ou violação de direitos humanos.',
        },
        {
            title: 'Igualdade de tratamento e de oportunidade ao migrante e a seus familiares',
            body: 'Migrantes têm acesso a serviços públicos, direitos trabalhistas e proteção social em igualdade de condições com brasileiros.',
        },
        {
            title: 'Acesso igualitário a serviços, programas e benefícios sociais',
            body: 'Inclui saúde, educação, assistência jurídica, previdência social, trabalho, moradia e serviço bancário — sem exigência de reciprocidade do país de origem.',
        },
        {
            title: 'Promoção do reconhecimento acadêmico e do exercício profissional',
            body: 'Facilita a revalidação de diplomas e o reconhecimento de qualificações obtidas no exterior, atacando um dos maiores gargalos da inserção laboral.',
        },
        {
            title: 'Proteção integral e atenção ao superior interesse da criança e do adolescente migrante',
            body: 'Crianças migrantes desacompanhadas ou separadas recebem proteção prioritária, e o interesse da criança prevalece sobre qualquer procedimento migratório.',
        },
    ];

    toggle(i: number) {
        this.openPrinciple = this.openPrinciple === i ? null : i;
    }
}
