import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

interface Edital {
    code: string;
    title: string;
    text: string;
    status: 'Aberto' | 'Em análise' | 'Encerrado';
    deadline: string;
    scope: string;
}

@Component({
    selector: 'app-editais',
    standalone: true,
    imports: [CommonModule, PageHeroComponent, PageCtaComponent, AnimateOnScrollDirective],
    templateUrl: './editais.component.html',
})
export class EditaisComponent {
    readonly editais: Edital[] = [
        {
            code: 'EDITAL 03/2026',
            title: 'Apoio a coletivos e associações de migrantes',
            text: 'Seleção de até doze iniciativas lideradas por pessoas migrantes, com apoio financeiro e acompanhamento técnico por doze meses.',
            status: 'Aberto',
            deadline: 'Inscrições até 30 de setembro de 2026',
            scope: 'Nacional',
        },
        {
            code: 'EDITAL 02/2026',
            title: 'Bolsas de formação em direito migratório',
            text: 'Vinte bolsas integrais para agentes de pastoral, lideranças migrantes e estudantes no curso de extensão em direito migratório e acolhida.',
            status: 'Aberto',
            deadline: 'Inscrições até 15 de setembro de 2026',
            scope: 'Nacional · modalidade on-line',
        },
        {
            code: 'CHAMADA 01/2026',
            title: 'Seleção de tradutores e intérpretes comunitários',
            text: 'Cadastro de reserva para atuação voluntária remunerada em creole haitiano, espanhol, francês, árabe e warao nas equipes regionais.',
            status: 'Em análise',
            deadline: 'Encerrado em 30 de junho de 2026',
            scope: 'RR · AM · SP · RS',
        },
        {
            code: 'EDITAL 01/2026',
            title: 'Projetos de moradia digna para famílias migrantes',
            text: 'Apoio a iniciativas comunitárias de moradia, assessoria em regularização fundiária e enfrentamento a despejos, em sintonia com a Semana do Migrante 2026.',
            status: 'Em análise',
            deadline: 'Encerrado em 31 de maio de 2026',
            scope: 'Nacional',
        },
        {
            code: 'EDITAL 04/2025',
            title: 'Português como língua de acolhimento',
            text: 'Seleção de equipes locais para implementação de turmas de português com metodologia de acolhimento e formação de lideranças.',
            status: 'Encerrado',
            deadline: 'Encerrado em 20 de novembro de 2025',
            scope: 'Nacional',
        },
        {
            code: 'EDITAL 03/2025',
            title: 'Comunicação popular e enfrentamento à xenofobia',
            text: 'Apoio a projetos de rádio comunitária, audiovisual e mídia digital produzidos por comunidades migrantes.',
            status: 'Encerrado',
            deadline: 'Encerrado em 12 de agosto de 2025',
            scope: 'Nacional',
        },
    ];

    readonly statusFilters = ['Todos', 'Aberto', 'Em análise', 'Encerrado'];
    activeStatus = 'Todos';

    get filtered(): Edital[] {
        return this.activeStatus === 'Todos'
            ? this.editais
            : this.editais.filter((e) => e.status === this.activeStatus);
    }

    setStatus(status: string) {
        this.activeStatus = status;
    }

    statusClass(status: string): string {
        if (status === 'Aberto') return 'status-tag status-tag--open';
        if (status === 'Em análise') return 'status-tag status-tag--review';
        return 'status-tag status-tag--closed';
    }
}
