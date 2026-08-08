import { computed, Injectable, signal } from '@angular/core';

export type NewsStatus = 'publicado' | 'rascunho' | 'agendado' | 'revisao';

export interface NewsItem {
    id: number;
    title: string;
    slug: string;
    category: string;
    excerpt: string;
    content: string;
    author: string;
    date: string;
    status: NewsStatus;
    cover: string;
    tags: string[];
    views: number;
    highlight: boolean;
}

export interface NewsDraft {
    title: string;
    slug: string;
    category: string;
    excerpt: string;
    content: string;
    author: string;
    date: string;
    status: NewsStatus;
    cover: string;
    tags: string[];
    highlight: boolean;
}

@Injectable({ providedIn: 'root' })
export class NewsService {
    readonly categories = [
        'Notícias',
        'Reflexão',
        'Ação social',
        'Incidência',
        'Formação',
        'Nota pública',
    ];

    private nextId = 10;

    readonly items = signal<NewsItem[]>([
        {
            id: 1,
            title: '41ª Semana do Migrante reforça apelo por moradia digna',
            slug: '41a-semana-do-migrante-moradia-digna',
            category: 'Notícias',
            excerpt:
                'Com o lema “Eu não tenho onde morar!”, a edição de 2026 conectou a pauta migratória à Campanha da Fraternidade.',
            content:
                'A 41ª Semana do Migrante foi celebrada de 14 a 21 de junho de 2026 em comunidades de todo o país...',
            author: 'Secretariado Nacional',
            date: '2026-06-22',
            status: 'publicado',
            cover: 'assets/house.jpg',
            tags: ['semana do migrante', 'moradia'],
            views: 4820,
            highlight: true,
        },
        {
            id: 2,
            title: 'Fraternidade e Moradia: o que a CF 2026 tem a ver com quem migra',
            slug: 'fraternidade-e-moradia-cf-2026',
            category: 'Reflexão',
            excerpt:
                'Quem chega é sempre o último da fila do aluguel. Uma leitura da Campanha da Fraternidade a partir das famílias migrantes.',
            content: 'Texto de reflexão produzido pela equipe de formação do SPM...',
            author: 'Equipe de Formação',
            date: '2026-03-18',
            status: 'publicado',
            cover: 'assets/hero-bg-large.jpeg',
            tags: ['campanha da fraternidade', 'moradia'],
            views: 3110,
            highlight: false,
        },
        {
            id: 3,
            title: 'Acesso à informação em regiões de fronteira: o que aprendemos',
            slug: 'acesso-a-informacao-em-fronteira',
            category: 'Ação social',
            excerpt:
                'Relato das equipes de Roraima, Amazonas e Mato Grosso do Sul sobre desinformação e rotas de risco.',
            content: 'Relato consolidado a partir dos encontros regionais de 2025...',
            author: 'Regional Norte',
            date: '2026-03-02',
            status: 'publicado',
            cover: 'assets/venezuelana.jpeg',
            tags: ['fronteira', 'informação'],
            views: 2075,
            highlight: false,
        },
        {
            id: 4,
            title: 'Mutirão na fronteira garante documentação a 380 famílias',
            slug: 'mutirao-fronteira-380-familias',
            category: 'Ação social',
            excerpt:
                'Ação conjunta entre SPM, Defensoria Pública da União e Polícia Federal em Boa Vista.',
            content: 'Durante três dias, equipes atenderam famílias venezuelanas e Warao...',
            author: 'Regional Roraima',
            date: '2026-02-14',
            status: 'publicado',
            cover: 'assets/exemplo-migrantes.jpeg',
            tags: ['documentação', 'roraima'],
            views: 5390,
            highlight: true,
        },
        {
            id: 5,
            title: 'Nota pública: xenofobia nas redes não é opinião, é violência',
            slug: 'nota-publica-xenofobia-nas-redes',
            category: 'Nota pública',
            excerpt:
                'O SPM se posiciona sobre a escalada de discurso de ódio contra comunidades migrantes.',
            content: 'O Serviço Pastoral dos Migrantes vem a público manifestar...',
            author: 'Coordenação Nacional',
            date: '2026-02-09',
            status: 'publicado',
            cover: 'assets/hero-bg-large.jpeg',
            tags: ['xenofobia', 'nota pública'],
            views: 8940,
            highlight: false,
        },
        {
            id: 6,
            title: 'Trabalho análogo à escravidão: os números que não aparecem',
            slug: 'trabalho-analogo-escravidao-numeros',
            category: 'Incidência',
            excerpt:
                'Análise das operações de fiscalização nas cadeias da cana, da laranja e do café.',
            content: 'Rascunho em elaboração pela equipe de incidência...',
            author: 'Equipe de Incidência',
            date: '2026-08-02',
            status: 'rascunho',
            cover: 'assets/house.jpg',
            tags: ['trabalho escravo', 'fiscalização'],
            views: 0,
            highlight: false,
        },
        {
            id: 7,
            title: 'Português como língua de acolhimento: um método, não um curso',
            slug: 'portugues-lingua-de-acolhimento',
            category: 'Formação',
            excerpt:
                'Como as aulas de português viraram espaço de organização coletiva e formação de lideranças.',
            content: 'Aguardando revisão da coordenação de formação...',
            author: 'Equipe de Formação',
            date: '2026-08-05',
            status: 'revisao',
            cover: 'assets/venezuelana.jpeg',
            tags: ['formação', 'língua portuguesa'],
            views: 0,
            highlight: false,
        },
        {
            id: 8,
            title: 'Assembleia Nacional 2026: inscrições abertas para delegados',
            slug: 'assembleia-nacional-2026-inscricoes',
            category: 'Notícias',
            excerpt: 'Equipes regionais devem indicar seus delegados até o fim de setembro.',
            content: 'Agendado para publicação automática...',
            author: 'Secretariado Nacional',
            date: '2026-09-01',
            status: 'agendado',
            cover: 'assets/exemplo-migrantes.jpeg',
            tags: ['assembleia', 'institucional'],
            views: 0,
            highlight: false,
        },
        {
            id: 9,
            title: 'SPM: raízes, caminhos e alternativas',
            slug: 'spm-raizes-caminhos-alternativas',
            category: 'Reflexão',
            excerpt: 'Um texto de fundo sobre a identidade do Serviço Pastoral dos Migrantes.',
            content: 'De onde viemos, como caminhamos e que alternativas buscamos...',
            author: 'Coordenação Nacional',
            date: '2024-02-20',
            status: 'publicado',
            cover: 'assets/padre-alfredinho.png',
            tags: ['identidade', 'história'],
            views: 12400,
            highlight: false,
        },
    ]);

    readonly total = computed(() => this.items().length);
    readonly published = computed(
        () => this.items().filter((i) => i.status === 'publicado').length,
    );
    readonly drafts = computed(() => this.items().filter((i) => i.status === 'rascunho').length);
    readonly scheduled = computed(() => this.items().filter((i) => i.status === 'agendado').length);
    readonly inReview = computed(() => this.items().filter((i) => i.status === 'revisao').length);
    readonly totalViews = computed(() => this.items().reduce((sum, i) => sum + i.views, 0));

    create(draft: NewsDraft): NewsItem {
        const item: NewsItem = { ...draft, id: this.nextId++, views: 0 };
        this.items.update((list) => [item, ...list]);
        return item;
    }

    remove(id: number): void {
        this.items.update((list) => list.filter((i) => i.id !== id));
    }

    setStatus(id: number, status: NewsStatus): void {
        this.items.update((list) => list.map((i) => (i.id === id ? { ...i, status } : i)));
    }

    toggleHighlight(id: number): void {
        this.items.update((list) =>
            list.map((i) => (i.id === id ? { ...i, highlight: !i.highlight } : i)),
        );
    }

    private readonly diacritics = new RegExp('[\\u0300-\\u036f]', 'g');

    slugify(value: string): string {
        return value
            .normalize('NFD')
            .replace(this.diacritics, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
    }
}
