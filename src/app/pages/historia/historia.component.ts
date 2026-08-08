import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

interface Milestone {
    year: string;
    title: string;
    text: string;
}

@Component({
    selector: 'app-historia',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './historia.component.html',
})
export class HistoriaComponent {
    readonly milestones: Milestone[] = [
        {
            year: '1887 · 1895',
            title: 'As raízes scalabrinianas',
            text: 'São João Batista Scalabrini funda os Missionários de São Carlos (1887) e, com Madre Assunta Marchetti, as Irmãs Missionárias de São Carlos (1895), para acompanhar as levas de emigrantes italianos que chegavam às Américas. É dessa raiz que nasce a tradição de cuidado da Igreja com quem migra no Brasil.',
        },
        {
            year: '1969',
            title: 'O Dia do Migrante no calendário da Igreja',
            text: 'O Papa Paulo VI institui a celebração do Dia do Migrante, convocando as Igrejas locais a olhar para a mobilidade humana como um sinal dos tempos.',
        },
        {
            year: '1979',
            title: 'O Brasil escolhe o 25 de junho',
            text: 'A CNBB determina que, no Brasil, o Dia do Migrante seja celebrado em 25 de junho — data que até hoje organiza o calendário do SPM e da Semana do Migrante.',
        },
        {
            year: '1980',
            title: 'Campanha da Fraternidade: “Para onde vais?”',
            text: 'A CF de 1980 coloca o êxodo rural e a migração no centro da reflexão eclesial brasileira. Milhares de comunidades discutem por que tanta gente é obrigada a deixar sua terra. Ali está a semente do SPM.',
        },
        {
            year: '1981',
            title: 'Primeiro Dia do Migrante',
            text: 'Celebrado com o lema “Por que somos obrigados a sair da nossa terra?”, o primeiro Dia do Migrante já nasce com o tom que marcaria o serviço: mais do que socorrer, perguntar pelas causas.',
        },
        {
            year: '1984 · 1985',
            title: 'Nasce o Serviço Pastoral dos Migrantes',
            text: 'A articulação nacional amadurece em 1984 e, em outubro de 1985, o SPM é fundado. No ano seguinte é oficialmente reconhecido como organismo da Pastoral Social da CNBB, com secretariado nacional em São Paulo.',
        },
        {
            year: '1986',
            title: 'A primeira Semana do Migrante',
            text: 'Com o lema “Tomareis posse da terra e nela habitareis”, começa a Semana do Migrante — hoje com mais de quarenta edições consecutivas e materiais de formação distribuídos por todo o país.',
        },
        {
            year: 'Anos 1990',
            title: 'Fronteiras, canaviais e grandes cidades',
            text: 'O SPM se espalha pelas rotas da migração interna: os canaviais paulistas, as frentes agrícolas do Centro-Oeste, as periferias metropolitanas e as fronteiras do Norte e do Sul. Cresce a denúncia do trabalho análogo à escravidão e do tráfico de pessoas.',
        },
        {
            year: '2010',
            title: 'A chegada haitiana',
            text: 'Após o terremoto no Haiti, milhares de pessoas cruzam o Acre e o Amazonas rumo ao Brasil. As equipes do SPM na Amazônia se tornam ponto de apoio, orientação e denúncia das condições de travessia.',
        },
        {
            year: '2016 · 2017',
            title: 'Novas leis, novos direitos',
            text: 'É aprovada a Lei Municipal nº 16.478/2016, em São Paulo, e sancionada a Lei nº 13.445/2017 — a Lei de Migração, que substitui o Estatuto do Estrangeiro e passa a tratar quem migra como sujeito de direitos. O SPM participa ativamente da mobilização por ambas.',
        },
        {
            year: '2018 em diante',
            title: 'Venezuela, Roraima e a resposta em rede',
            text: 'O deslocamento venezuelano leva o SPM a reforçar a presença em Roraima e no Amazonas, com mutirões de documentação, acolhida e articulação com a rede humanitária.',
        },
        {
            year: '2025',
            title: '40 anos de caminhada',
            text: 'A 40ª Semana do Migrante, realizada de 15 a 22 de junho, celebra os 40 anos do SPM com o tema “Migração e Esperança” e o lema “Sempre no caminho com os migrantes”.',
        },
        {
            year: '2026',
            title: '“Eu não tenho onde morar!”',
            text: 'A 41ª Semana do Migrante, de 14 a 21 de junho, coloca a moradia no centro do debate — em sintonia com a Campanha da Fraternidade de 2026 — sob o tema “Migração e Moradia”.',
        },
    ];
}
