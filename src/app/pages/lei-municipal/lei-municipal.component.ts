import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-lei-municipal',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './lei-municipal.component.html',
})
export class LeiMunicipalComponent {
    readonly principios = [
        {
            icon: 'fa-equals',
            title: 'Igualdade de direitos e de oportunidades',
            text: 'Imigrantes têm acesso aos serviços e programas municipais nas mesmas condições que qualquer munícipe.',
        },
        {
            icon: 'fa-passport',
            title: 'Promoção da regularização',
            text: 'O município deve estimular e facilitar a regularização da situação migratória da população imigrante.',
        },
        {
            icon: 'fa-scale-balanced',
            title: 'Universalidade e indivisibilidade dos direitos',
            text: 'Os direitos humanos das pessoas imigrantes são universais, indivisíveis e interdependentes.',
        },
        {
            icon: 'fa-hand-fist',
            title: 'Combate à xenofobia e ao racismo',
            text: 'Enfrentamento ativo à xenofobia, ao racismo, ao preconceito e a toda forma de discriminação.',
        },
        {
            icon: 'fa-hospital',
            title: 'Acesso universal a serviços públicos',
            text: 'Promoção dos direitos sociais por meio do acesso universal aos serviços públicos municipais.',
        },
        {
            icon: 'fa-people-roof',
            title: 'Convivência familiar e comunitária',
            text: 'Fomento à convivência familiar e comunitária como dimensão essencial da integração.',
        },
        {
            icon: 'fa-earth-americas',
            title: 'Reconhecimento da diversidade cultural',
            text: 'Valorização das identidades, das línguas e das culturas trazidas pelas comunidades imigrantes.',
        },
        {
            icon: 'fa-users-gear',
            title: 'Participação social',
            text: 'Participação da população imigrante na formulação e no controle das políticas que lhe dizem respeito.',
        },
    ];
}
