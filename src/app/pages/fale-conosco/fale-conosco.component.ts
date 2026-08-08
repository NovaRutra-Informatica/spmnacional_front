import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
    selector: 'app-fale-conosco',
    standalone: true,
    imports: [CommonModule, RouterLink, PageHeroComponent, AnimateOnScrollDirective],
    templateUrl: './fale-conosco.component.html',
})
export class FaleConoscoComponent {
    openFaq: number | null = null;

    readonly faqs = [
        {
            q: 'Sou migrante e preciso de ajuda. O SPM atende?',
            a: 'Sim, e o atendimento é gratuito. Orientamos sobre regularização migratória, refúgio, reunião familiar, acesso a serviços públicos e denúncias de violação de direitos. Escreva para nós ou procure a equipe mais próxima na página “Onde estamos”.',
        },
        {
            q: 'O SPM oferece abrigo?',
            a: 'A rede do SPM apoia e articula casas de acolhida em várias cidades, mas a disponibilidade de vagas varia muito conforme o município e o momento. Entre em contato para que possamos indicar o serviço adequado na sua região.',
        },
        {
            q: 'Preciso de advogado. Vocês fornecem?',
            a: 'Oferecemos orientação jurídica inicial e encaminhamos para a Defensoria Pública da União, para núcleos de prática jurídica de universidades e para a rede de advogados parceiros. Não cobramos por nenhuma dessas orientações.',
        },
        {
            q: 'Quero ser voluntário. Como começo?',
            a: 'Escreva contando onde você mora, o que sabe fazer e quanto tempo pode dedicar. Encaminhamos seu contato para a equipe regional mais próxima, que fará a conversa inicial.',
        },
        {
            q: 'Minha paróquia quer iniciar um trabalho com migrantes.',
            a: 'Ótimo. Enviamos material de formação, ajudamos a mapear a presença migrante no território e conectamos sua comunidade à equipe regional do SPM. Comece pelo formulário desta página.',
        },
        {
            q: 'Como solicito uma entrevista ou dados para a imprensa?',
            a: 'Escreva para comunicacao@spmnacional.org.br informando o veículo, a pauta e o prazo. Sempre que possível indicamos porta-vozes das próprias comunidades migrantes.',
        },
    ];

    toggleFaq(i: number) {
        this.openFaq = this.openFaq === i ? null : i;
    }
}
