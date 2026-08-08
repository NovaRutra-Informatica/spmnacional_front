import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-quem-somos',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './quem-somos.component.html',
})
export class QuemSomosComponent {
    openObjective: number | null = 0;

    readonly objetivos = [
        {
            title: 'Ampliar a ação pastoral junto aos migrantes em todo o país',
            body: 'Suscitar, acompanhar e fortalecer equipes locais em dioceses, paróquias e comunidades, especialmente nas regiões de fronteira, nos grandes centros urbanos e nas rotas de migração interna.',
        },
        {
            title: 'Formar lideranças migrantes',
            body: 'Investir na formação de migrantes como protagonistas — e não como assistidos —, partilhando responsabilidades em conselhos, coordenações e equipes de base.',
        },
        {
            title: 'Denunciar as causas da migração forçada',
            body: 'Evidenciar as estruturas que empurram pessoas para fora de sua terra: concentração fundiária, monoculturas, conflitos armados, crises climáticas, desemprego e violência.',
        },
        {
            title: 'Enfrentar o tráfico de pessoas e o trabalho escravo',
            body: 'Acompanhar denúncias e articular com o Ministério Público do Trabalho, a Defensoria Pública e a rede social presente nas cadeias da cana, da laranja, do eucalipto e do café.',
        },
        {
            title: 'Valorizar a cultura e a religiosidade popular dos povos migrantes',
            body: 'Reconhecer festas, línguas, músicas e expressões de fé como patrimônio e como caminho de integração — com atenção especial à juventude e às mulheres migrantes.',
        },
        {
            title: 'Construir uma sociedade justa e solidária',
            body: 'Atuar em rede com movimentos sociais, pastorais sociais, universidades e organismos internacionais na incidência por políticas públicas migratórias.',
        },
    ];

    toggle(i: number) {
        this.openObjective = this.openObjective === i ? null : i;
    }
}
