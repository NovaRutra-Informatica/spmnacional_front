import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

interface Member {
    initials: string;
    name: string;
    role: string;
    place: string;
}

@Component({
    selector: 'app-estrutura',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './estrutura.component.html',
})
export class EstruturaComponent {
    readonly coordenacao: Member[] = [
        {
            initials: 'JB',
            name: 'Dom João Aparecido Bergamasco',
            role: 'Presidente',
            place: 'Bispo referencial do SPM junto à CNBB',
        },
        {
            initials: 'VM',
            name: 'Pe. Valdecir Mayer Molinari',
            role: 'Vice-presidente',
            place: 'Acompanhamento das regionais',
        },
        {
            initials: 'MO',
            name: 'Maria Ozania da Silva',
            role: 'Coordenação nacional',
            place: 'Formação e articulação de base',
        },
        {
            initials: 'RN',
            name: 'Rosana Nascimento',
            role: 'Coordenação nacional',
            place: 'Incidência política e redes',
        },
        {
            initials: 'RS',
            name: 'Roberto Saraiva',
            role: 'Coordenação nacional',
            place: 'Projetos e administração',
        },
    ];

    readonly instancias = [
        {
            nivel: 'Assembleia Nacional',
            periodicidade: 'A cada dois anos',
            composicao: 'Delegados das equipes regionais e de base, migrantes e assessoria',
            atribuicao: 'Define as prioridades do biênio e elege a Coordenação Nacional',
        },
        {
            nivel: 'Coordenação Nacional',
            periodicidade: 'Reuniões periódicas ao longo do biênio',
            composicao: 'Presidência, vice-presidência e coordenadores nacionais',
            atribuicao: 'Conduz a execução do plano nacional e representa o SPM',
        },
        {
            nivel: 'Secretariado Nacional',
            periodicidade: 'Permanente',
            composicao: 'Equipe sediada em São Paulo (SP)',
            atribuicao: 'Comunicação, projetos, formação, finanças e apoio às regionais',
        },
        {
            nivel: 'Equipes Regionais',
            periodicidade: 'Encontros regionais anuais',
            composicao: 'Agentes de pastoral, religiosos e lideranças migrantes',
            atribuicao: 'Adaptam o plano nacional à realidade de cada território',
        },
        {
            nivel: 'Equipes de Base',
            periodicidade: 'Cotidiano das comunidades',
            composicao: 'Paróquias, casas de acolhida, coletivos e associações de migrantes',
            atribuicao: 'Acolhem, orientam, organizam e denunciam violações no dia a dia',
        },
    ];
}
