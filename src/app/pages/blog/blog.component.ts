import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageHeroComponent } from '../../shared/components/page-hero/page-hero.component';
import { PageCtaComponent } from '../../shared/components/page-cta/page-cta.component';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

interface Post {
    title: string;
    excerpt: string;
    date: string;
    category: string;
    img: string;
    link?: string;
}

@Component({
    selector: 'app-blog',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        PageHeroComponent,
        PageCtaComponent,
        AnimateOnScrollDirective,
    ],
    templateUrl: './blog.component.html',
})
export class BlogComponent {
    readonly categories = [
        'Todas',
        'Notícias',
        'Reflexão',
        'Ação social',
        'Incidência',
        'Formação',
    ];

    activeCategory = 'Todas';

    readonly featured: Post = {
        title: '40 anos de caminhada com quem migra',
        excerpt:
            'Quatro décadas depois da pergunta “Para onde vais?”, o Serviço Pastoral dos Migrantes olha para trás e para a frente: o que mudou nas rotas, no trabalho e na acolhida — e o que continua exatamente igual.',
        date: '25 de junho de 2025',
        category: 'Reflexão',
        img: 'assets/exemplo-migrantes.jpeg',
        link: '/publicacoes/blog/spm-40-anos',
    };

    readonly posts: Post[] = [
        {
            title: '41ª Semana do Migrante reforça apelo por moradia digna',
            excerpt:
                'Com o lema “Eu não tenho onde morar!”, a edição de 2026 conectou a pauta migratória à Campanha da Fraternidade e levou o debate sobre habitação a comunidades de todo o país.',
            date: '22 de junho de 2026',
            category: 'Notícias',
            img: 'assets/house.jpg',
        },
        {
            title: 'Fraternidade e Moradia: o que a CF 2026 tem a ver com quem migra',
            excerpt:
                'Quem chega é sempre o último da fila do aluguel. Uma leitura da Campanha da Fraternidade a partir da experiência das famílias migrantes nas periferias urbanas.',
            date: '18 de março de 2026',
            category: 'Reflexão',
            img: 'assets/hero-bg-large.jpeg',
        },
        {
            title: 'Acesso à informação em regiões de fronteira: o que aprendemos',
            excerpt:
                'Relato das equipes de Roraima, Amazonas e Mato Grosso do Sul sobre como a falta de informação clara empurra pessoas para rotas perigosas e para redes de aliciamento.',
            date: '2 de março de 2026',
            category: 'Ação social',
            img: 'assets/venezuelana.jpeg',
        },
        {
            title: 'Mutirão na fronteira garante documentação a 380 famílias',
            excerpt:
                'Ação conjunta entre SPM, Defensoria Pública da União e Polícia Federal regularizou a situação migratória de famílias venezuelanas e Warao em Boa Vista.',
            date: '14 de fevereiro de 2026',
            category: 'Ação social',
            img: 'assets/exemplo-migrantes.jpeg',
        },
        {
            title: 'Nota pública: xenofobia nas redes não é opinião, é violência',
            excerpt:
                'O SPM se posiciona sobre a escalada de discurso de ódio contra comunidades migrantes nas plataformas digitais e cobra responsabilização.',
            date: '9 de fevereiro de 2026',
            category: 'Incidência',
            img: 'assets/hero-bg-large.jpeg',
        },
        {
            title: 'Trabalho análogo à escravidão: os números que não aparecem',
            excerpt:
                'Análise das operações de fiscalização nas cadeias da cana, da laranja e do café — e do que elas revelam sobre o aliciamento de trabalhadores migrantes.',
            date: '20 de janeiro de 2026',
            category: 'Incidência',
            img: 'assets/house.jpg',
        },
        {
            title: 'Português como língua de acolhimento: um método, não um curso',
            excerpt:
                'Como as equipes do SPM transformaram aulas de português em espaços de organização coletiva, escuta e formação de lideranças migrantes.',
            date: '11 de dezembro de 2025',
            category: 'Formação',
            img: 'assets/venezuelana.jpeg',
        },
        {
            title: 'Assembleia Nacional define prioridades para o biênio',
            excerpt:
                'Delegados de treze estados aprovaram plano de trabalho com foco em moradia, enfrentamento ao tráfico de pessoas e formação de lideranças migrantes.',
            date: '28 de junho de 2025',
            category: 'Notícias',
            img: 'assets/exemplo-migrantes.jpeg',
        },
        {
            title: 'SPM: raízes, caminhos e alternativas',
            excerpt:
                'Um texto de fundo sobre a identidade do Serviço Pastoral dos Migrantes: de onde viemos, como caminhamos e que alternativas buscamos diante da migração forçada.',
            date: '20 de fevereiro de 2024',
            category: 'Reflexão',
            img: 'assets/padre-alfredinho.png',
        },
    ];

    get filtered(): Post[] {
        return this.activeCategory === 'Todas'
            ? this.posts
            : this.posts.filter((p) => p.category === this.activeCategory);
    }

    setCategory(cat: string) {
        this.activeCategory = cat;
    }
}
