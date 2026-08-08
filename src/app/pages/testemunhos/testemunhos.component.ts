import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

interface Testemunho {
    text: string;
    name: string;
    origin: string;
    initials: string;
    photo?: string;
}

@Component({
    selector: 'app-testemunhos',
    standalone: true,
    imports: [CommonModule, PageHeroComponent, PageCtaComponent, AnimateOnScrollDirective],
    templateUrl: './testemunhos.component.html',
})
export class TestemunhosComponent {
    readonly destaque: Testemunho = {
        text: 'Eu achei que tinha perdido tudo quando deixei a Venezuela. Atravessei com dois filhos e uma mochila. No SPM eu não ganhei só comida e um lugar para dormir: ganhei gente que sentou comigo, explicou meus direitos e me perguntou o que eu queria fazer da minha vida. Hoje eu é que recebo quem chega.',
        name: 'Maria González',
        origin: 'Venezuelana, acolhida em São Paulo — hoje agente de acolhida',
        initials: 'MG',
        photo: 'assets/venezuelana.jpeg',
    };

    readonly testemunhos: Testemunho[] = [
        {
            text: 'Saí do Ceará aos dezessete anos para cortar cana no interior de São Paulo. Prometeram alojamento e salário. Encontrei um barracão com trinta homens e uma dívida que só crescia. Foi um agente da pastoral que entrou naquele alojamento e explicou que aquilo tinha nome: trabalho escravo.',
            name: 'José Ferreira',
            origin: 'Migrante interno, Ceará → São Paulo',
            initials: 'JF',
        },
        {
            text: 'Cheguei do Haiti falando creole e um pouco de francês. O curso de português do SPM não me ensinou só a língua: me ensinou a ler um contrato de aluguel e a entender o que estava escrito na minha carteira de trabalho.',
            name: 'Wisly Pierre',
            origin: 'Haitiano, residente em Curitiba (PR)',
            initials: 'WP',
        },
        {
            text: 'Sou Warao. Meu povo atravessa a fronteira há muito tempo, mas ninguém nos perguntava nada. A equipe de Boa Vista foi a primeira que sentou com as nossas anciãs antes de decidir qualquer coisa sobre nós.',
            name: 'Dalia Rivas',
            origin: 'Indígena Warao, Roraima',
            initials: 'DR',
        },
        {
            text: 'Vim do Senegal vender na rua. Fui apreendido três vezes, perdi mercadoria, perdi dinheiro. No SPM me explicaram que eu tinha direito à defesa e me acompanharam na Defensoria. Não recuperei a mercadoria, mas recuperei a certeza de que eu não era criminoso.',
            name: 'Ibrahima Diallo',
            origin: 'Senegalês, residente em Caxias do Sul (RS)',
            initials: 'ID',
        },
        {
            text: 'Cheguei grávida, sem documento e sem falar português. Me disseram no posto que sem papel não tinha atendimento. A agente do SPM foi comigo no dia seguinte com a lei impressa na mão. Meu filho nasceu no SUS, como era o direito dele.',
            name: 'Rosa Mamani',
            origin: 'Boliviana, residente em São Paulo (SP)',
            initials: 'RM',
        },
        {
            text: 'Trabalhei quatro anos em frigorífico no oeste catarinense. Quando adoeci, ninguém me explicou o que era afastamento nem auxílio. O SPM-SC me acompanhou até o INSS e ficou comigo em todas as perícias.',
            name: 'Jean Baptiste',
            origin: 'Haitiano, residente em Santa Catarina',
            initials: 'JB',
        },
        {
            text: 'Deixei o Vale do Jequitinhonha achando que voltaria em um ano. Voltei em dezoito. A pastoral acompanhou minha família enquanto eu estava fora e me ajudou a recomeçar quando voltei — porque migração de retorno também é migração.',
            name: 'Antônia Souza',
            origin: 'Migrante de retorno, Minas Gerais',
            initials: 'AS',
        },
        {
            text: 'Fugi da guerra e cheguei ao Rio sem conhecer ninguém. O mais difícil não foi a travessia: foi o silêncio depois. O grupo de convivência do SPM foi o primeiro lugar onde alguém me perguntou como eu estava, e não de onde eu era.',
            name: 'Samir Haddad',
            origin: 'Sírio, refugiado no Rio de Janeiro (RJ)',
            initials: 'SH',
        },
    ];
}
