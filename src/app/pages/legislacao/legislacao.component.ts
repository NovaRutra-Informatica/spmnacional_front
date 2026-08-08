import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-legislacao',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './legislacao.component.html',
})
export class LegislacaoComponent {
    readonly outrasNormas = [
        {
            title: 'Lei nº 9.474/1997 — Lei do Refúgio',
            text: 'Define os mecanismos de reconhecimento da condição de refugiado no Brasil e cria o CONARE. Foi uma das primeiras legislações do gênero na América Latina.',
        },
        {
            title: 'Decreto nº 9.199/2017',
            text: 'Regulamenta a Lei de Migração, detalhando procedimentos de vistos, autorizações de residência, registro e documentação.',
        },
        {
            title: 'Constituição Federal de 1988, art. 5º',
            text: 'Garante a igualdade de direitos entre brasileiros e estrangeiros residentes no país — fundamento de toda a política migratória brasileira.',
        },
        {
            title: 'Convenção de 1951 e Protocolo de 1967',
            text: 'Tratados internacionais sobre o Estatuto dos Refugiados, ratificados pelo Brasil e incorporados ao ordenamento jurídico nacional.',
        },
        {
            title: 'Pacto Global para Migração Segura, Ordenada e Regular',
            text: 'Marco cooperativo adotado pela ONU em 2018, que orienta boas práticas migratórias entre os países signatários.',
        },
        {
            title: 'Lei nº 13.344/2016',
            text: 'Dispõe sobre prevenção e repressão ao tráfico interno e internacional de pessoas e sobre medidas de atenção às vítimas.',
        },
    ];
}
