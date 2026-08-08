import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

interface Frente {
    icon: string;
    title: string;
    text: string;
    items: string[];
}

@Component({
    selector: 'app-atuacao',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './atuacao.component.html',
})
export class AtuacaoComponent {
    readonly frentes: Frente[] = [
        {
            icon: 'fa-house-chimney-crack',
            title: 'Acolhida humanitária',
            text: 'Casas do Migrante, centros de referência e pontos de escuta em fronteiras, rodoviárias e periferias.',
            items: [
                'Abrigo temporário para pessoas e famílias',
                'Alimentação, higiene e roupas',
                'Escuta qualificada e encaminhamento à rede socioassistencial',
                'Apoio a pessoas em trânsito nas rotas de fronteira',
            ],
        },
        {
            icon: 'fa-scale-balanced',
            title: 'Assessoria jurídica e regularização',
            text: 'Orientação sobre a Lei de Migração, autorização de residência, refúgio, reunião familiar e naturalização.',
            items: [
                'Mutirões de documentação com Polícia Federal e Defensoria',
                'Orientação sobre CPF, CTPS, CRNM e protocolo',
                'Apoio a pedidos de refúgio e de reunião familiar',
                'Encaminhamento de denúncias de violação de direitos',
            ],
        },
        {
            icon: 'fa-briefcase',
            title: 'Trabalho e geração de renda',
            text: 'Enfrentamos a exploração no trabalho e apoiamos a autonomia econômica de quem chega.',
            items: [
                'Cursos de qualificação e português como língua de acolhimento',
                'Apoio a cooperativas e empreendimentos de economia solidária',
                'Denúncia de trabalho análogo à escravidão e de aliciamento',
                'Articulação com sindicatos e com o Ministério Público do Trabalho',
            ],
        },
        {
            icon: 'fa-people-arrows',
            title: 'Enfrentamento ao tráfico de pessoas',
            text: 'Prevenção, identificação e acompanhamento de vítimas nas rotas mais vulneráveis do país.',
            items: [
                'Campanhas de informação em fronteiras e rodoviárias',
                'Formação de agentes públicos e comunitários',
                'Acompanhamento e proteção de pessoas identificadas',
                'Participação em comitês estaduais de enfrentamento',
            ],
        },
        {
            icon: 'fa-landmark',
            title: 'Incidência política',
            text: 'Presença nos espaços onde a política migratória é decidida — do município à ONU.',
            items: [
                'Conselhos de imigrantes e conferências de direitos humanos',
                'Audiências públicas e acompanhamento legislativo',
                'Notas públicas e campanhas nacionais',
                'Monitoramento da implementação da Lei nº 13.445/2017',
            ],
        },
        {
            icon: 'fa-graduation-cap',
            title: 'Formação e comunicação',
            text: 'Produzimos material para que comunidades, escolas e paróquias compreendam a migração.',
            items: [
                'Subsídios anuais da Semana do Migrante',
                'Círculos bíblicos e roteiros de celebração',
                'Cartilhas de direitos em várias línguas',
                'Blog, boletins e formação de multiplicadores',
            ],
        },
    ];
}
