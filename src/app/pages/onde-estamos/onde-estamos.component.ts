import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

interface Regional {
    uf: string;
    name: string;
    region: string;
    text: string;
    focus: string[];
}

@Component({
    selector: 'app-onde-estamos',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './onde-estamos.component.html',
})
export class OndeEstamosComponent {
    readonly regions = ['Todas', 'Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
    activeRegion = 'Todas';

    readonly regionais: Regional[] = [
        {
            uf: 'RR',
            name: 'Roraima — Boa Vista e Pacaraima',
            region: 'Norte',
            text: 'Presença na principal porta de entrada terrestre do fluxo venezuelano, incluindo o acompanhamento de famílias indígenas Warao.',
            focus: ['Acolhida em fronteira', 'Documentação', 'Interculturalidade indígena'],
        },
        {
            uf: 'AM',
            name: 'Amazonas — Manaus e Tabatinga',
            region: 'Norte',
            text: 'Equipes na tríplice fronteira e na capital, com forte atuação junto a povos indígenas migrantes e a pessoas em trânsito pelo rio Solimões.',
            focus: ['Rotas fluviais', 'Enfrentamento ao tráfico', 'Geração de renda'],
        },
        {
            uf: 'RO',
            name: 'Rondônia — Porto Velho',
            region: 'Norte',
            text: 'Acompanhamento de migrantes internos atraídos por grandes obras e do fluxo haitiano que chega pelo Acre.',
            focus: ['Trabalho decente', 'Grandes obras', 'Migração interna'],
        },
        {
            uf: 'CE',
            name: 'Ceará — Fortaleza',
            region: 'Nordeste',
            text: 'Referência do SPM Nordeste, com trabalho de prevenção ao aliciamento de trabalhadores rurais e ao tráfico de pessoas.',
            focus: ['Prevenção ao aliciamento', 'Formação de lideranças', 'Juventude'],
        },
        {
            uf: 'PE',
            name: 'Pernambuco — Recife e Petrolina',
            region: 'Nordeste',
            text: 'Atuação nas rotas de migração sazonal para a fruticultura irrigada do São Francisco e nas periferias da Região Metropolitana.',
            focus: ['Trabalho sazonal', 'Direitos trabalhistas', 'Acolhida urbana'],
        },
        {
            uf: 'DF',
            name: 'Distrito Federal — Brasília',
            region: 'Centro-Oeste',
            text: 'Base da incidência política nacional, com acompanhamento do Congresso Nacional, de ministérios e de conselhos federais.',
            focus: ['Incidência legislativa', 'Conselhos nacionais', 'Articulação em rede'],
        },
        {
            uf: 'MS',
            name: 'Mato Grosso do Sul — Corumbá e Campo Grande',
            region: 'Centro-Oeste',
            text: 'Fronteira com Bolívia e Paraguai: acolhida, documentação e enfrentamento ao tráfico de pessoas.',
            focus: ['Fronteira seca', 'Documentação', 'Mulheres migrantes'],
        },
        {
            uf: 'SP',
            name: 'São Paulo — Capital e interior',
            region: 'Sudeste',
            text: 'Sede do secretariado nacional. No interior, acompanhamento histórico dos canaviais e da colheita da laranja.',
            focus: ['Secretariado nacional', 'Canaviais', 'Política municipal do imigrante'],
        },
        {
            uf: 'RJ',
            name: 'Rio de Janeiro',
            region: 'Sudeste',
            text: 'Acolhida em áreas portuárias e periferias, com atenção a refugiados africanos e à população migrante em situação de rua.',
            focus: ['Acolhida urbana', 'Refúgio', 'População em situação de rua'],
        },
        {
            uf: 'MG',
            name: 'Minas Gerais — Belo Horizonte e Vale do Jequitinhonha',
            region: 'Sudeste',
            text: 'Trabalho com migrantes internos que saem do Vale rumo aos canaviais e às cidades — e com quem retorna.',
            focus: ['Migração de retorno', 'Trabalho rural', 'Comunidades de origem'],
        },
        {
            uf: 'PR',
            name: 'Paraná — Curitiba e Foz do Iguaçu',
            region: 'Sul',
            text: 'Fronteira com Paraguai e Argentina, além de forte presença de comunidades haitianas e venezuelanas na capital.',
            focus: ['Tríplice fronteira', 'Inserção laboral', 'Português como acolhimento'],
        },
        {
            uf: 'SC',
            name: 'Santa Catarina — Florianópolis e Oeste',
            region: 'Sul',
            text: 'O SPM-SC acompanha trabalhadores migrantes na indústria frigorífica e na construção civil.',
            focus: ['Frigoríficos', 'Saúde do trabalhador', 'Acolhida em pequenas cidades'],
        },
        {
            uf: 'RS',
            name: 'Rio Grande do Sul — Porto Alegre e Caxias do Sul',
            region: 'Sul',
            text: 'Região de imigração histórica que hoje recebe novos fluxos: senegaleses, haitianos e venezuelanos.',
            focus: ['Memória migrante', 'Inserção laboral', 'Enfrentamento à xenofobia'],
        },
    ];

    get filtered(): Regional[] {
        return this.activeRegion === 'Todas'
            ? this.regionais
            : this.regionais.filter((r) => r.region === this.activeRegion);
    }

    setRegion(region: string) {
        this.activeRegion = region;
    }
}
