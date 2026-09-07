/**
 * Carga inicial do banco.
 *
 * Os dados institucionais (regionais, coordenação, edições da Semana do
 * Migrante, contatos) vieram de fontes públicas do próprio SPM, da CNBB e da
 * CEPAST — as referências estão em devdocs/FONTES.md.
 *
 * O que é conteúdo de demonstração está marcado como tal, para a equipe saber
 * o que precisa substituir antes de publicar.
 *
 * Idempotente: pode rodar quantas vezes for preciso.
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client.ts';
import { createHmac, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
) => Promise<Buffer>;

async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(password.normalize('NFKC'), salt, 64);
    return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * A senha só é exigida quando ainda não existe um hash para a conta inicial.
 * Não há valor padrão: um seed executado sem segredo explícito deve falhar em
 * vez de publicar uma credencial conhecida.
 */
function requireSeedAdminPassword(): string {
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) {
        throw new Error(
            'SEED_ADMIN_PASSWORD é obrigatória para criar a senha inicial do administrador.',
        );
    }

    const normalized = password.normalize('NFKC');
    if (normalized !== normalized.trim()) {
        throw new Error('SEED_ADMIN_PASSWORD não pode começar ou terminar com espaços.');
    }

    if (normalized.length < 12) {
        throw new Error('SEED_ADMIN_PASSWORD deve ter pelo menos 12 caracteres.');
    }

    const compact = normalized.toLowerCase().replace(/\s/g, '');
    const placeholder =
        /^(admin|password|senha|changeme|change-me|trocar|temporaria|temporario|placeholder|example|exemplo|soufoda)[0-9!@#$%^&*._-]*$/;
    if (placeholder.test(compact)) {
        throw new Error('SEED_ADMIN_PASSWORD não pode ser uma senha padrão ou placeholder.');
    }

    if (new Set(compact).size < 6) {
        throw new Error('SEED_ADMIN_PASSWORD é repetitiva demais; use uma senha mais forte.');
    }

    return normalized;
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO = 'Conteúdo de demonstração — substituir antes de publicar.';

// =========================================================
// 1. Permissões e perfis
// =========================================================

const PERMISSIONS = [
    {
        key: 'noticias',
        label: 'Publicar notícias',
        hint: 'Criar, editar e publicar no blog',
        order: 1,
    },
    { key: 'midia', label: 'Biblioteca de mídia', hint: 'Enviar e remover arquivos', order: 2 },
    {
        key: 'editais',
        label: 'Gerenciar editais',
        hint: 'Abrir e encerrar chamadas públicas',
        order: 3,
    },
    {
        key: 'atendimentos',
        label: 'Registrar atendimentos',
        hint: 'Acessar fichas de casos',
        order: 4,
    },
    {
        key: 'usuarios',
        label: 'Gerenciar usuários',
        hint: 'Convidar, editar e desativar no escopo autorizado',
        order: 5,
    },
    {
        key: 'config',
        label: 'Configurações do site',
        hint: 'Alterar dados institucionais',
        order: 6,
    },
];

const ROLES = [
    {
        key: 'admin',
        name: 'Administrador geral',
        description: 'Acesso irrestrito, incluindo gestão de usuários e configurações.',
        system: true,
        order: 1,
        permissions: ['noticias', 'midia', 'editais', 'atendimentos', 'usuarios', 'config'],
    },
    {
        key: 'editor',
        name: 'Editor de conteúdo',
        description: 'Produz e publica conteúdo no site, sem acesso a dados de atendimento.',
        system: true,
        order: 2,
        permissions: ['noticias', 'midia', 'editais'],
    },
    {
        key: 'atendente',
        name: 'Atendente regional',
        description: 'Registra atendimentos da sua regional e envia arquivos de apoio.',
        system: true,
        order: 3,
        permissions: ['midia', 'atendimentos'],
    },
    {
        key: 'coordenacao',
        name: 'Coordenação regional',
        description: 'Acompanha a regional, publica conteúdo e gerencia a equipe local.',
        system: true,
        order: 4,
        permissions: ['noticias', 'midia', 'editais', 'atendimentos', 'usuarios'],
    },
    {
        key: 'leitura',
        name: 'Somente leitura',
        description: 'Visualiza relatórios e conteúdo, sem permissão de alteração.',
        system: true,
        order: 5,
        permissions: [],
    },
];

// =========================================================
// 2. Regionais — unidades publicadas pelo próprio SPM
//    Fonte: spmnacional.org.br (páginas Norte, Nordeste,
//    Centro-Oeste, Sudeste e Sul), consultadas em agosto/2026.
// =========================================================

const REGIONAIS = [
    {
        slug: 'sp-sao-paulo',
        uf: 'SP',
        city: 'São Paulo',
        name: 'São Paulo — Secretariado Nacional',
        region: 'SUDESTE' as const,
        description:
            'Sede nacional do SPM. De aqui saem os subsídios da Semana do Migrante, as notas públicas e o apoio administrativo às equipes de todo o país.',
        focus: ['Secretariado nacional', 'Formação e subsídios', 'Incidência política'],
        address: 'Rua Caiambé, 126 — Vila Monumento / Ipiranga, CEP 04264-060',
        phone: '(11) 2063-7064',
        email: 'spm.nac@terra.com.br',
        order: 1,
    },
    {
        slug: 'am-manaus',
        uf: 'AM',
        city: 'Manaus',
        name: 'Amazonas — Manaus',
        region: 'NORTE' as const,
        description:
            'Equipe sediada na Arquidiocese de Manaus, no coração da rota amazônica de migração e das travessias pelo rio Solimões.',
        focus: ['Rotas fluviais', 'Acolhida urbana', 'Interculturalidade indígena'],
        address: 'Arquidiocese de Manaus — Rua Coronel Sérgio Pessoa, s/n, Centro, CEP 69001-970',
        order: 1,
    },
    {
        slug: 'ro-ji-parana',
        uf: 'RO',
        city: 'Ji-Paraná',
        name: 'Rondônia — Ji-Paraná',
        region: 'NORTE' as const,
        description:
            'Sediada na Paróquia São Sebastião, no bairro Jardim dos Migrantes — nome que conta a história da própria cidade.',
        focus: ['Migração interna', 'Trabalho no campo', 'Acolhida paroquial'],
        address:
            'Paróquia São Sebastião — Rua das Pedras, 267, Jardim dos Migrantes, CEP 76900-722',
        order: 2,
    },
    {
        slug: 'ma-balsas',
        uf: 'MA',
        city: 'Balsas',
        name: 'Maranhão — Balsas',
        region: 'NORDESTE' as const,
        description:
            'Região de fronteira agrícola do MATOPIBA, para onde migram trabalhadores atraídos pela expansão do agronegócio.',
        focus: ['Trabalho rural', 'Prevenção ao aliciamento', 'Migração sazonal'],
        address: 'Igreja Nossa Senhora de Fátima — Rua Luíz Gomes, 92, Bairro Açucena',
        order: 1,
    },
    {
        slug: 'pi-teresina',
        uf: 'PI',
        city: 'Teresina',
        name: 'Piauí — Teresina',
        region: 'NORDESTE' as const,
        description:
            'Equipe da Arquidiocese de Teresina, acompanhando quem sai do Piauí atrás de trabalho e quem retorna.',
        focus: ['Migração de saída', 'Migração de retorno', 'Formação de lideranças'],
        address: 'Arquidiocese de Teresina — Avenida Frei Serafim, 3.200, CEP 64001-500',
        order: 2,
    },
    {
        slug: 'ce-fortaleza',
        uf: 'CE',
        city: 'Fortaleza',
        name: 'Ceará — Fortaleza',
        region: 'NORDESTE' as const,
        description:
            'Referência do SPM no Nordeste, com trabalho histórico de prevenção ao aliciamento de trabalhadores rurais e ao tráfico de pessoas.',
        focus: ['Prevenção ao aliciamento', 'Enfrentamento ao tráfico', 'Juventude'],
        address: 'Rua Rodrigues Júnior, 300, Centro, CEP 60060-000',
        order: 3,
    },
    {
        slug: 'pb-inga',
        uf: 'PB',
        city: 'Ingá',
        name: 'Paraíba — Ingá',
        region: 'NORDESTE' as const,
        description: 'Equipe de base no agreste paraibano, junto a comunidades rurais.',
        focus: ['Comunidades rurais', 'Êxodo rural', 'Organização de base'],
        address: 'Rua Antônio da Silva, 53, Ananias, CEP 58380-000',
        order: 4,
    },
    {
        slug: 'pb-conde',
        uf: 'PB',
        city: 'Conde',
        name: 'Paraíba — Conde',
        region: 'NORDESTE' as const,
        description: 'Equipe no litoral sul da Paraíba, em região de forte pressão imobiliária.',
        focus: ['Moradia', 'Território', 'Acolhida comunitária'],
        address: 'Rua dos Tabajaras, s/n, Loteamento Village Jacumã, CEP 58322-000',
        order: 5,
    },
    {
        slug: 'pb-bayeux',
        uf: 'PB',
        city: 'Bayeux',
        name: 'Paraíba — Bayeux',
        region: 'NORDESTE' as const,
        description:
            'Equipe na Região Metropolitana de João Pessoa, acompanhando famílias migrantes na periferia urbana.',
        focus: ['Periferia urbana', 'Moradia', 'Geração de renda'],
        address:
            'Rua Senador Ruy Carneiro (Loteamento Planalto), 40, Comercial Norte, CEP 58309-784',
        order: 6,
    },
    {
        slug: 'mt-cuiaba',
        uf: 'MT',
        city: 'Cuiabá',
        name: 'Mato Grosso — Cuiabá',
        region: 'CENTRO_OESTE' as const,
        description:
            'Equipe em região de fronteira agrícola, com forte fluxo de trabalhadores migrantes internos.',
        focus: ['Trabalho no agronegócio', 'Migração interna', 'Direitos trabalhistas'],
        address: 'Avenida Gonçalo Antunes de Barros, 2785, Novo Mato Grosso, CEP 78058-743',
        order: 1,
    },
    {
        slug: 'ms-campo-grande',
        uf: 'MS',
        city: 'Campo Grande',
        name: 'Mato Grosso do Sul — Campo Grande',
        region: 'CENTRO_OESTE' as const,
        description:
            'Equipe da Arquidiocese de Campo Grande, em estado de fronteira com Bolívia e Paraguai.',
        focus: ['Fronteira', 'Documentação', 'Enfrentamento ao tráfico'],
        address:
            'Arquidiocese de Campo Grande — Av. Amando de Oliveira, 448, Bairro Amambaí, CEP 79008-010',
        order: 2,
    },
    {
        slug: 'df-pamig-nucleo-bandeirante',
        uf: 'DF',
        city: 'Brasília',
        name: 'Distrito Federal — PAMIG Núcleo Bandeirante',
        region: 'CENTRO_OESTE' as const,
        description:
            'Pastoral do Migrante na Paróquia São João Bosco, no Núcleo Bandeirante — cidade nascida da migração que construiu Brasília.',
        focus: ['Acolhida paroquial', 'Migração interna', 'Memória migrante'],
        address: 'Paróquia São João Bosco — Praça Padre Roque, terceira avenida',
        order: 3,
    },
    {
        slug: 'df-pamig-itapua',
        uf: 'DF',
        city: 'Brasília',
        name: 'Distrito Federal — PAMIG Itapuã',
        region: 'CENTRO_OESTE' as const,
        description: 'Pastoral do Migrante na Paróquia São Luís Orione, no Itapuã.',
        focus: ['Acolhida paroquial', 'Periferia urbana', 'Formação'],
        address: 'Paróquia São Luís Orione — Av. São Luís Orione, Del Lago II, quadra 378',
        order: 4,
    },
    {
        slug: 'df-pamig-sobradinho',
        uf: 'DF',
        city: 'Brasília',
        name: 'Distrito Federal — PAMIG Sobradinho',
        region: 'CENTRO_OESTE' as const,
        description: 'Pastoral do Migrante na Paróquia Bom Jesus dos Migrantes, em Sobradinho.',
        focus: ['Acolhida paroquial', 'Migração interna', 'Organização de base'],
        address: 'Paróquia Bom Jesus dos Migrantes — Quadra 04, Área Especial 02',
        order: 5,
    },
    {
        slug: 'df-oassab',
        uf: 'DF',
        city: 'Brasília',
        name: 'Distrito Federal — OASSAB',
        region: 'CENTRO_OESTE' as const,
        description:
            'Base do SPM na Asa Sul, próxima às instâncias federais — ponto de apoio da incidência política nacional.',
        focus: ['Incidência legislativa', 'Conselhos nacionais', 'Articulação em rede'],
        address: 'SGAS Quadra 601, Módulo 3, Conjunto Bom Jesus, L2 Sul, CEP 70200-610',
        order: 6,
    },
    {
        slug: 'pr-londrina',
        uf: 'PR',
        city: 'Londrina',
        name: 'Paraná — Londrina',
        region: 'SUL' as const,
        description:
            'Equipe da Arquidiocese de Londrina, no norte do Paraná, região de imigração histórica e de novos fluxos.',
        focus: ['Inserção laboral', 'Português como acolhimento', 'Memória migrante'],
        address: 'Arquidiocese de Londrina — Rua Dom Bosco, 145, CEP 86060-340',
        order: 1,
    },
    {
        slug: 'pr-curitiba',
        uf: 'PR',
        city: 'Curitiba',
        name: 'Paraná — Curitiba',
        region: 'SUL' as const,
        description:
            'Equipe da Arquidiocese de Curitiba, com presença junto a comunidades haitianas, venezuelanas e senegalesas na capital.',
        focus: ['Acolhida urbana', 'Documentação', 'Enfrentamento à xenofobia'],
        address: 'Arquidiocese de Curitiba — Rua Manoel Ribas, 6252, Santa Felicidade',
        order: 2,
    },
];

// =========================================================
// 3. Categorias e notícias
// =========================================================

const CATEGORIES = [
    { slug: 'noticias', name: 'Notícias', order: 1 },
    { slug: 'reflexao', name: 'Reflexão', order: 2 },
    { slug: 'acao-social', name: 'Ação social', order: 3 },
    { slug: 'incidencia', name: 'Incidência', order: 4 },
    { slug: 'formacao', name: 'Formação', order: 5 },
    { slug: 'nota-publica', name: 'Nota pública', order: 6 },
];

const POSTS = [
    {
        slug: '41a-semana-do-migrante-moradia-digna',
        title: '41ª Semana do Migrante reforça apelo por moradia digna',
        category: 'noticias',
        excerpt:
            'Com o tema “Migração e Moradia” e o lema “Eu não tenho onde morar!”, a edição de 2026 foi aberta no Santuário Nacional de Aparecida e encerrada no Arsenal da Esperança, em São Paulo.',
        content: `A 41ª Semana do Migrante foi celebrada de **14 a 21 de junho de 2026**, com o tema “Migração e Moradia” e o lema “Eu não tenho onde morar!”, em sintonia com a Campanha da Fraternidade de 2026, dedicada ao direito de morar.

A missa de abertura foi presidida por **Dom João Aparecido Bergamasco, SAC**, presidente do SPM, no Santuário Nacional de Aparecida, acompanhada da Romaria do Migrante.

## Um tema que atravessa toda a acolhida

Não existe integração sem endereço. Sem comprovante de residência não se consegue matrícula na escola, cadastro no posto de saúde, conta bancária nem emprego formal. A moradia não é uma etapa posterior da acolhida: é a condição de todas as outras.

Ao longo da semana, as equipes regionais promoveram rodas de conversa pelo método **ver, discernir e agir**, celebrações litúrgicas, momentos culturais e audiências públicas sobre direitos humanos, xenofobia e racismo.

## Dia Nacional do Migrante

O encerramento aconteceu em **21 de junho**, com missa às 10h no Arsenal da Esperança, na Mooca, em São Paulo, seguida de lanche partilhado e visita ao Museu da Imigração.

> “Eu não tenho onde morar” não é uma frase sobre imóveis. É uma frase sobre pertencimento.

Os subsídios da edição — texto-base, roteiros para rodas de conversa e roteiro litúrgico — continuam disponíveis para download.`,
        authorName: 'Secretariado Nacional',
        status: 'PUBLICADO' as const,
        publishedAt: new Date('2026-06-22T12:00:00Z'),
        highlight: true,
        cover: '/assets/house.jpg',
        views: 4820,
        tags: ['semana do migrante', 'moradia'],
    },
    {
        slug: 'spm-40-anos',
        title: '40 anos de caminhada com quem migra',
        category: 'reflexao',
        excerpt:
            'Quatro décadas depois da pergunta “Para onde vais?”, o Serviço Pastoral dos Migrantes olha para trás e para a frente: o que mudou nas rotas, no trabalho e na acolhida — e o que continua exatamente igual.',
        content: `Em 1980, a Campanha da Fraternidade perguntou ao Brasil para onde ele estava indo. Cinco anos depois, um grupo de agentes de pastoral decidiu que a pergunta merecia mais do que um ano de campanha: merecia um serviço permanente. Nascia o Serviço Pastoral dos Migrantes, fundado em **outubro de 1985** e reconhecido como organismo da CNBB em 1986.

## O que mudou

A mudança mais visível está na lei. Até 2017, a norma que regia a vida das pessoas estrangeiras no Brasil era o Estatuto do Estrangeiro, escrito em 1980 sob a lógica da segurança nacional. A [Lei nº 13.445/2017](/legislacao/lei-de-migracao) inverteu o paradigma: quem migra deixou de ser ameaça e passou a ser sujeito de direitos.

Mudou também o mapa. O SPM nasceu olhando para dentro — para o êxodo rural, para as famílias que deixavam o Nordeste rumo aos canaviais paulistas, para as periferias que cresciam sem infraestrutura. Hoje acompanhamos também quem chega de fora.

E mudou o protagonismo. Nas primeiras assembleias, migrantes eram tema. Hoje são delegados, coordenadores e formadores. Foi a maior aprendizagem destas quatro décadas: **ninguém organiza ninguém — as pessoas se organizam**.

> “Fui migrante e vocês me acolheram.” A frase de Mateus não é um convite à caridade distante. É uma identificação.

## O que não mudou

A causa. Em 1981, o primeiro Dia do Migrante perguntava: “Por que somos obrigados a sair da nossa terra?” A pergunta segue de pé.

Continua também a exploração. As operações de fiscalização seguem encontrando trabalho análogo à escravidão nas cadeias da cana, da laranja, do eucalipto e do café.

E continua a moradia como ferida aberta — não por acaso, a [41ª Semana do Migrante](/semana-do-migrante/2026) escolheu exatamente esse tema.

## O que vem pela frente

Três frentes nos ocupam agora: a **aplicação** da Lei de Migração, que ainda não chegou a todos os balcões de atendimento; a **migração climática**, que já move gente dentro do Brasil e quase não aparece nas políticas públicas; e o **enfrentamento à xenofobia digital**.

Nada disso se enfrenta sozinho. Foi por isso que o SPM nasceu articulado. Quarenta anos depois, a resposta à pergunta de 1980 continua a mesma: vamos para onde a gente estiver indo junto.`,
        authorName: 'Secretariado Nacional',
        status: 'PUBLICADO' as const,
        publishedAt: new Date('2025-06-25T12:00:00Z'),
        highlight: false,
        cover: '/assets/padre-alfredinho.png',
        views: 12400,
        tags: ['identidade', 'história', '40 anos'],
    },
    {
        slug: 'assembleia-nacional-elege-coordenacao',
        title: 'Assembleia Nacional elege nova coordenação do SPM',
        category: 'noticias',
        excerpt:
            'Reunida em São Paulo, a Assembleia Nacional do SPM definiu as prioridades do período e elegeu a diretoria que conduz o serviço.',
        content: `A Assembleia Nacional do Serviço Pastoral dos Migrantes reuniu-se em **São Paulo, de 3 a 5 de novembro de 2023**, com delegados das equipes regionais.

A assembleia — instância máxima do SPM, convocada a cada dois anos — elegeu a diretoria e aprovou o plano de trabalho do período.

## Composição eleita

- **Presidente:** Dom João Aparecido Bergamasco, SAC
- **Vice-presidente:** Padre Valdecir Mayer Molinari, CS
- **Secretária:** Irmã Ires De Costa, MSCS
- **Vice-secretária:** Márcia Maria de Oliveira
- **Tesoureiro:** Arivaldo José Sezyshta
- **Vice-tesoureira:** Gilvanda Torres

A **coordenação colegiada** é formada por José Roberto Saraiva dos Santos, Rosana Maria Taveira do Nascimento e Maria Ozania da Silva. Padre Alfredinho Gonçalves e Anibal Brasil Freire Bardales atuam como assessores.

O SPM está vinculado ao setor de Mobilidade Humana da Comissão Episcopal para a Ação Sociotransformadora da CNBB.`,
        authorName: 'Secretariado Nacional',
        status: 'PUBLICADO' as const,
        publishedAt: new Date('2023-11-14T12:00:00Z'),
        highlight: false,
        cover: '/assets/exemplo-migrantes.jpeg',
        views: 3110,
        tags: ['assembleia', 'institucional', 'coordenação'],
    },
    {
        slug: 'direitos-independem-da-situacao-migratoria',
        title: 'Saúde, escola e trabalho independem da situação migratória',
        category: 'incidencia',
        excerpt:
            'A Lei de Migração é explícita: os direitos valem independentemente da condição migratória. Ainda assim, a recusa de atendimento continua sendo a violação mais relatada às nossas equipes.',
        content: `A [Lei nº 13.445/2017](/legislacao/lei-de-migracao) não deixa margem para dúvida. O artigo 4º garante à pessoa migrante, **em igualdade com os nacionais**, o acesso a serviços públicos de saúde e assistência social, à educação pública e aos direitos trabalhistas — e o parágrafo 1º acrescenta que esses direitos são exercidos **independentemente da situação migratória**.

## O que a lei diz, ponto a ponto

- **Art. 3º, III** — princípio da não criminalização da migração.
- **Art. 4º, VIII** — saúde e assistência social sem discriminação por nacionalidade ou condição migratória.
- **Art. 4º, X** — educação pública, vedada a discriminação por nacionalidade ou condição migratória.
- **Art. 4º, XI** — garantia dos direitos trabalhistas.
- **Art. 4º, XIII** — direito à informação e **confidencialidade dos dados pessoais** do migrante.
- **Art. 109** — entrar ou permanecer sem autorização é infração **administrativa**, não crime.

## Por que isso importa no balcão

Uma parte relevante das violações que nossas equipes acompanham não vem de má-fé, mas de desinformação de quem atende: a exigência de um documento que a lei não pede, a recusa de matrícula por falta de histórico escolar, a negativa de cadastro no posto de saúde.

> Direito que não se conhece não se exerce — e isso vale tanto para quem migra quanto para quem atende.

Se você passou por uma situação assim, [registre conosco](/fale-conosco). O atendimento é gratuito e sigiloso.`,
        authorName: 'Equipe de Incidência',
        status: 'PUBLICADO' as const,
        publishedAt: new Date('2026-04-10T12:00:00Z'),
        highlight: false,
        cover: '/assets/hero-bg-large.jpeg',
        views: 2075,
        tags: ['lei de migração', 'direitos', 'incidência'],
    },
    {
        slug: 'migracao-e-casa-comum-balanco',
        title: 'Migração e Casa Comum: o que ficou da 39ª Semana',
        category: 'reflexao',
        excerpt:
            'A edição de 2024 colocou lado a lado duas realidades que quase nunca aparecem juntas no debate público: a degradação ambiental e o deslocamento humano forçado.',
        content: `A 39ª Semana do Migrante, celebrada de **16 a 23 de junho de 2024** com o lema “Amplia o espaço da tua tenda” (Is 54,2), tratou de um tema que só cresceu desde então.

Seca prolongada no semiárido, enchentes no Sul, calor extremo nas periferias urbanas, avanço da monocultura sobre territórios tradicionais. Cada um desses processos produz migração — e produz, sobretudo, migração de quem já tinha menos.

> Não há crise ambiental de um lado e crise migratória do outro. Há uma só crise, com dois rostos.

A tenda que se amplia é a que cabe mais gente sem expulsar ninguém: metáfora exata do que a ecologia integral propõe.`,
        authorName: 'Equipe de Formação',
        status: 'PUBLICADO' as const,
        publishedAt: new Date('2024-06-24T12:00:00Z'),
        highlight: false,
        cover: '/assets/venezuelana.jpeg',
        views: 1890,
        tags: ['semana do migrante', 'casa comum', 'clima'],
    },
    {
        slug: 'nota-publica-xenofobia-nas-redes',
        title: 'Nota pública: xenofobia nas redes não é opinião, é violência',
        category: 'nota-publica',
        excerpt:
            'O SPM se posiciona sobre a escalada de discurso de ódio contra comunidades migrantes nas plataformas digitais e cobra responsabilização.',
        content: `O Serviço Pastoral dos Migrantes vem a público manifestar preocupação com a escalada de discurso de ódio dirigido a comunidades migrantes nas plataformas digitais.

A Lei de Migração estabelece, entre os princípios da política migratória brasileira, o **repúdio e a prevenção à xenofobia, ao racismo e a quaisquer formas de discriminação** (art. 3º, II). Não se trata de uma recomendação: é diretriz legal.

## O que pedimos

1. Que as plataformas cumpram suas próprias políticas de moderação, em português e nas demais línguas faladas por comunidades migrantes no Brasil.
2. Que o poder público trate a xenofobia digital como o que ela é — violência, não opinião.
3. Que as comunidades eclesiais não repitam, nem por descuido, narrativas que desumanizam quem chega.

Reafirmamos: **migrar não é crime**. Entrar ou permanecer em situação irregular é infração administrativa, e a lei brasileira adota expressamente a não criminalização da migração.`,
        authorName: 'Coordenação Nacional',
        status: 'PUBLICADO' as const,
        publishedAt: new Date('2026-02-09T12:00:00Z'),
        highlight: false,
        cover: '/assets/hero-bg-large.jpeg',
        views: 8940,
        tags: ['xenofobia', 'nota pública'],
    },
    {
        slug: 'portugues-lingua-de-acolhimento',
        title: 'Português como língua de acolhimento: um método, não um curso',
        category: 'formacao',
        excerpt:
            'Como as aulas de português viraram espaço de organização coletiva, escuta e formação de lideranças migrantes.',
        content: `Rascunho em elaboração pela equipe de formação.

A proposta é sistematizar a experiência das equipes que trabalham com português como língua de acolhimento, mostrando que a aula é, antes de tudo, um espaço de encontro.`,
        authorName: 'Equipe de Formação',
        status: 'REVISAO' as const,
        publishedAt: null,
        highlight: false,
        cover: '/assets/venezuelana.jpeg',
        views: 0,
        tags: ['formação', 'língua portuguesa'],
    },
    {
        slug: 'trabalho-analogo-escravidao-numeros',
        title: 'Trabalho análogo à escravidão: os números que não aparecem',
        category: 'incidencia',
        excerpt:
            'Análise das operações de fiscalização nas cadeias da cana, da laranja e do café e do que elas revelam sobre o aliciamento de trabalhadores migrantes.',
        content: `Rascunho em elaboração pela equipe de incidência. Aguarda consolidação dos dados das operações mais recentes.`,
        authorName: 'Equipe de Incidência',
        status: 'RASCUNHO' as const,
        publishedAt: null,
        highlight: false,
        cover: '/assets/house.jpg',
        views: 0,
        tags: ['trabalho escravo', 'fiscalização'],
    },
    {
        slug: 'dia-internacional-do-migrante-2026',
        title: 'Dia Internacional do Migrante: programação nacional',
        category: 'noticias',
        excerpt:
            'Em 18 de dezembro, as equipes do SPM promovem celebrações e atividades em todo o país.',
        content: `Publicação agendada. O texto será complementado com a programação enviada pelas regionais.

O Dia Internacional do Migrante é celebrado em **18 de dezembro**, data em que a Assembleia Geral da ONU adotou a Convenção Internacional sobre a Proteção dos Direitos de Todos os Trabalhadores Migrantes e dos Membros das suas Famílias.`,
        authorName: 'Secretariado Nacional',
        status: 'AGENDADO' as const,
        publishedAt: new Date('2026-12-10T12:00:00Z'),
        highlight: false,
        cover: '/assets/exemplo-migrantes.jpeg',
        views: 0,
        tags: ['agenda', 'dia internacional do migrante'],
    },
];

// =========================================================
// 4. Semana do Migrante — edições confirmadas
// =========================================================

const MATERIAIS_PADRAO = [
    { icon: 'fa-book-open', title: 'Texto-base', meta: 'PDF · material de aprofundamento' },
    {
        icon: 'fa-comments',
        title: 'Roteiro para roda de conversa',
        meta: 'PDF · método ver, discernir e agir',
    },
    { icon: 'fa-church', title: 'Roteiro de celebração', meta: 'PDF · sugestão litúrgica' },
    { icon: 'fa-hands-praying', title: 'Oração oficial', meta: 'PDF · para rezar em comunidade' },
    { icon: 'fa-image', title: 'Cartaz oficial', meta: 'PDF em alta resolução' },
];

const SEMANAS = [
    {
        ano: 2026,
        slug: '2026',
        edicao: '41ª Semana do Migrante',
        tema: 'Migração e Moradia',
        lema: '“Eu não tenho onde morar!”',
        periodo: '14 a 21 de junho de 2026',
        startsOn: new Date('2026-06-14T00:00:00Z'),
        endsOn: new Date('2026-06-21T23:59:59Z'),
        coverUrl: '/assets/house.jpg',
        citacao:
            '“Eu não tenho onde morar” não é uma frase sobre imóveis. É uma frase sobre pertencimento.',
        resumo: `Não existe integração sem endereço. Sem comprovante de residência não se consegue matrícula, cadastro no posto de saúde, conta bancária nem emprego formal. A moradia não é uma etapa posterior da acolhida: é a condição de todas as outras.

A 41ª Semana do Migrante coloca essa realidade no centro, em sintonia direta com a Campanha da Fraternidade de 2026, dedicada à moradia. A abertura foi no Santuário Nacional de Aparecida, com Romaria do Migrante, e o Dia Nacional do Migrante foi celebrado no Arsenal da Esperança, em São Paulo.`,
        objetivos: [
            'Evidenciar a relação entre migração forçada e déficit habitacional',
            'Denunciar a exploração no aluguel informal, nos cortiços e nas moradias precárias',
            'Incidir para que planos municipais de habitação incluam a população migrante',
            'Fortalecer coletivos de migrantes que já atuam por moradia em suas cidades',
        ],
        programacao: [
            {
                dia: 'Domingo, 14/06',
                title: 'Abertura',
                text: 'Missa de abertura no Santuário Nacional de Aparecida, com Romaria do Migrante.',
            },
            {
                dia: 'Segunda, 15/06',
                title: 'Moradia é direito',
                text: 'Roda de conversa sobre aluguel, cortiços e despejos, com o movimento de moradia.',
            },
            {
                dia: 'Terça, 16/06',
                title: 'Escuta migrante',
                text: 'Encontro conduzido por lideranças migrantes para levantar demandas locais.',
            },
            {
                dia: 'Quarta, 17/06',
                title: 'Formação',
                text: 'Oficina sobre a Lei de Migração e sobre políticas municipais de habitação.',
            },
            {
                dia: 'Quinta, 18/06',
                title: 'Incidência',
                text: 'Audiência pública sobre direitos humanos, xenofobia e racismo.',
            },
            {
                dia: 'Sexta, 19/06',
                title: 'Cultura',
                text: 'Noite intercultural com música, comida e narrativas das comunidades migrantes.',
            },
            {
                dia: 'Sábado, 20/06',
                title: 'Mutirão',
                text: 'Ação prática: mutirão de documentação ou de cadastro em programas habitacionais.',
            },
            {
                dia: 'Domingo, 21/06',
                title: 'Dia Nacional do Migrante',
                text: 'Missa às 10h no Arsenal da Esperança, na Mooca (SP), com lanche partilhado e visita ao Museu da Imigração.',
            },
        ],
    },
    {
        ano: 2025,
        slug: '2025',
        edicao: '40ª Semana do Migrante',
        tema: 'Migração e Esperança',
        lema: '“Sempre no caminho com os migrantes”',
        periodo: '15 a 22 de junho de 2025',
        startsOn: new Date('2025-06-15T00:00:00Z'),
        endsOn: new Date('2025-06-22T23:59:59Z'),
        coverUrl: '/assets/exemplo-migrantes.jpeg',
        citacao:
            'Esperança, aqui, não é otimismo. É a decisão teimosa de continuar caminhando com quem ninguém acompanha.',
        resumo: `A 40ª Semana do Migrante coincidiu com os quarenta anos do SPM, fundado em outubro de 1985. Não foi apenas uma celebração de aniversário: foi um exercício de memória e de projeção.

A celebração de abertura aconteceu em 15 de junho, no Santuário Nacional de Aparecida, presidida por Dom Ricardo Hoepers. O encerramento e o Dia do Migrante foram celebrados em 22 de junho, na Igreja Nossa Senhora da Paz, no Glicério, em São Paulo. Um seminário comemorativo dos 40 anos foi realizado em 11 de junho, em Brasília.`,
        objetivos: [
            'Celebrar os 40 anos do Serviço Pastoral dos Migrantes',
            'Retomar a pergunta fundadora de 1981: “Por que somos obrigados a sair da nossa terra?”',
            'Reunir a memória das quatro décadas de Semana do Migrante',
            'Reafirmar o compromisso de caminhar junto, e não à frente nem atrás',
        ],
        programacao: [
            {
                dia: '11/06',
                title: 'Seminário dos 40 anos',
                text: 'Seminário comemorativo em Brasília, com a rede parceira.',
            },
            {
                dia: 'Domingo, 15/06',
                title: 'Abertura',
                text: 'Missa no Santuário Nacional de Aparecida, presidida por Dom Ricardo Hoepers.',
            },
            {
                dia: 'Domingo, 22/06',
                title: 'Dia do Migrante',
                text: 'Celebração às 11h na Igreja Nossa Senhora da Paz, Rua do Glicério, 225, São Paulo.',
            },
        ],
    },
    {
        ano: 2024,
        slug: '2024',
        edicao: '39ª Semana do Migrante',
        tema: 'Migração e Casa Comum',
        lema: '“Amplia o espaço da tua tenda” (Is 54,2)',
        periodo: '16 a 23 de junho de 2024',
        startsOn: new Date('2024-06-16T00:00:00Z'),
        endsOn: new Date('2024-06-23T23:59:59Z'),
        coverUrl: '/assets/hero-bg-large.jpeg',
        citacao:
            'Não há crise ambiental de um lado e crise migratória do outro. Há uma só crise, com dois rostos.',
        resumo: `A 39ª Semana do Migrante colocou lado a lado duas realidades que quase nunca aparecem juntas no debate público: a degradação ambiental e o deslocamento humano forçado.

A abertura aconteceu no Santuário Nacional de Nossa Senhora Aparecida, no domingo 16 de junho. O lema, tirado do profeta Isaías, foi um chamado à hospitalidade: a tenda que se amplia é a que cabe mais gente sem expulsar ninguém.`,
        objetivos: [
            'Evidenciar a relação entre eventos climáticos extremos e deslocamentos internos',
            'Denunciar projetos econômicos que expulsam comunidades de seus territórios',
            'Aproximar a pauta migratória das pastorais da terra, indigenista e da juventude',
            'Pautar o reconhecimento do deslocamento por causas climáticas',
        ],
        programacao: [
            {
                dia: 'Domingo, 16/06',
                title: 'Abertura',
                text: 'Missa no Santuário Nacional de Nossa Senhora Aparecida.',
            },
            {
                dia: 'Durante a semana',
                title: 'Rodas de conversa',
                text: 'Encontros sobre ecologia integral e deslocamento forçado nas regionais.',
            },
            {
                dia: 'Domingo, 23/06',
                title: 'Encerramento',
                text: 'Celebrações locais nas comunidades participantes.',
            },
        ],
    },
    {
        ano: 2023,
        slug: '2023',
        edicao: '38ª Semana do Migrante',
        tema: 'Migração e Soberania Alimentar',
        lema: '“Pátria é a Terra que lhe dá o pão”',
        periodo: '18 a 25 de junho de 2023',
        startsOn: new Date('2023-06-18T00:00:00Z'),
        endsOn: new Date('2023-06-25T23:59:59Z'),
        coverUrl: '/assets/exemplo-migrantes.jpeg',
        citacao: '“Pátria é a Terra que lhe dá o pão.” — São João Batista Scalabrini',
        resumo: `A 38ª Semana do Migrante ligou a migração forçada à questão da terra e do alimento, retomando uma frase de São João Batista Scalabrini.

A celebração de abertura aconteceu no Santuário Nacional de Aparecida, no domingo 18 de junho de 2023, na missa das 12h.`,
        objetivos: [
            'Relacionar migração forçada, concentração fundiária e insegurança alimentar',
            'Recuperar a tradição scalabriniana no cuidado com quem migra',
            'Fortalecer o diálogo com a Comissão Pastoral da Terra',
        ],
        programacao: [
            {
                dia: 'Domingo, 18/06',
                title: 'Abertura',
                text: 'Missa das 12h no Santuário Nacional de Aparecida.',
            },
            {
                dia: 'Domingo, 25/06',
                title: 'Dia do Migrante',
                text: 'Celebrações nas comunidades, na data nacional do Dia do Migrante.',
            },
        ],
    },
];

// =========================================================
// 5. Agenda
// =========================================================

const AGENDA = [
    {
        title: 'Dia Mundial do Migrante e do Refugiado',
        description:
            'Celebrado pela Igreja no último domingo de setembro, com tema definido anualmente pela Santa Sé.',
        startsAt: new Date('2026-09-27T00:00:00Z'),
        endsAt: new Date('2026-09-27T23:59:59Z'),
        allDay: true,
        location: 'Comunidades de todo o país',
    },
    {
        title: 'Dia Internacional do Migrante',
        description:
            'Data instituída pela ONU, em referência à Convenção Internacional sobre a Proteção dos Direitos de Todos os Trabalhadores Migrantes e dos Membros das suas Famílias.',
        startsAt: new Date('2026-12-18T00:00:00Z'),
        endsAt: new Date('2026-12-18T23:59:59Z'),
        allDay: true,
        location: 'Comunidades de todo o país',
    },
    {
        title: '42ª Semana do Migrante',
        description:
            'Tema e lema serão definidos pela Coordenação Nacional. A Semana acontece tradicionalmente na terceira semana de junho.',
        startsAt: new Date('2027-06-13T00:00:00Z'),
        endsAt: new Date('2027-06-20T23:59:59Z'),
        allDay: true,
        location: 'Nacional',
    },
    {
        title: '41ª Semana do Migrante — Dia Nacional do Migrante',
        description:
            'Missa às 10h no Arsenal da Esperança, seguida de lanche partilhado e visita ao Museu da Imigração.',
        startsAt: new Date('2026-06-21T13:00:00Z'),
        endsAt: new Date('2026-06-21T17:00:00Z'),
        allDay: false,
        location: 'Arsenal da Esperança — Rua Dr. Almeida Lima, 900, Mooca, São Paulo (SP)',
    },
];

// =========================================================
// 6. Editais, testemunhos e documentos
// =========================================================

const EDITAIS = [
    {
        code: 'EDITAL 03/2026',
        slug: 'edital-03-2026-apoio-a-coletivos',
        title: 'Apoio a coletivos e associações de migrantes',
        description:
            'Seleção de iniciativas lideradas por pessoas migrantes, com apoio financeiro e acompanhamento técnico. Inspirado nas ações de fortalecimento de coletivos previstas no Decreto nº 57.533/2016.',
        status: 'ABERTO' as const,
        deadlineText: 'Inscrições até 30 de setembro de 2026',
        deadlineAt: new Date('2026-09-30T23:59:59Z'),
        scope: 'Nacional',
        order: 1,
    },
    {
        code: 'EDITAL 02/2026',
        slug: 'edital-02-2026-bolsas-formacao',
        title: 'Bolsas de formação em direito migratório',
        description:
            'Bolsas para agentes de pastoral, lideranças migrantes e estudantes no curso de extensão em direito migratório e acolhida.',
        status: 'ABERTO' as const,
        deadlineText: 'Inscrições até 15 de setembro de 2026',
        deadlineAt: new Date('2026-09-15T23:59:59Z'),
        scope: 'Nacional · modalidade on-line',
        order: 2,
    },
    {
        code: 'CHAMADA 01/2026',
        slug: 'chamada-01-2026-tradutores',
        title: 'Cadastro de tradutores e intérpretes comunitários',
        description:
            'Cadastro de reserva para atuação em creole haitiano, espanhol, francês e árabe junto às equipes regionais.',
        status: 'EM_ANALISE' as const,
        deadlineText: 'Encerrado em 30 de junho de 2026',
        deadlineAt: new Date('2026-06-30T23:59:59Z'),
        scope: 'AM · CE · DF · PR · SP',
        order: 3,
    },
    {
        code: 'EDITAL 01/2026',
        slug: 'edital-01-2026-moradia',
        title: 'Projetos de moradia digna para famílias migrantes',
        description:
            'Apoio a iniciativas comunitárias de moradia e enfrentamento a despejos, em sintonia com a 41ª Semana do Migrante.',
        status: 'ENCERRADO' as const,
        deadlineText: 'Encerrado em 31 de maio de 2026',
        deadlineAt: new Date('2026-05-31T23:59:59Z'),
        scope: 'Nacional',
        order: 4,
    },
];

const TESTEMUNHOS = [
    {
        text: 'Saí do Piauí aos dezessete anos para trabalhar na colheita. Prometeram alojamento e salário. Encontrei um barracão com trinta homens e uma dívida que só crescia. Foi um agente da pastoral que entrou naquele alojamento e explicou que aquilo tinha nome.',
        personName: 'José F.',
        origin: 'Migrante interno, Piauí → Mato Grosso',
        initials: 'JF',
        featured: false,
        order: 1,
    },
    {
        text: 'Cheguei do Haiti falando creole e um pouco de francês. O curso de português não me ensinou só a língua: me ensinou a ler um contrato de aluguel e a entender o que estava escrito na minha carteira de trabalho.',
        personName: 'Wisly P.',
        origin: 'Haitiano, residente em Curitiba (PR)',
        initials: 'WP',
        featured: true,
        order: 2,
    },
    {
        text: 'Cheguei grávida, sem documento e sem falar português. Me disseram no posto que sem papel não tinha atendimento. A agente do SPM foi comigo no dia seguinte com a lei impressa na mão. Meu filho nasceu no SUS, como era o direito dele.',
        personName: 'Rosa M.',
        origin: 'Boliviana, residente em Campo Grande (MS)',
        initials: 'RM',
        featured: false,
        order: 3,
    },
    {
        text: 'Deixei o sertão da Paraíba achando que voltaria em um ano. Voltei em dezoito. A pastoral acompanhou minha família enquanto eu estava fora e me ajudou a recomeçar quando voltei — porque migração de retorno também é migração.',
        personName: 'Antônia S.',
        origin: 'Migrante de retorno, Paraíba',
        initials: 'AS',
        featured: false,
        order: 4,
    },
];

const DOCUMENTOS = [
    {
        title: 'Estatuto do Serviço Pastoral dos Migrantes',
        category: 'INSTITUCIONAL' as const,
        meta: 'PDF · documento institucional',
        icon: 'fa-file-contract',
        order: 1,
    },
    {
        title: 'Identidade, missão e metodologia FIA',
        category: 'INSTITUCIONAL' as const,
        meta: 'PDF · formação institucional',
        icon: 'fa-compass',
        order: 2,
    },
    {
        title: 'Carta final da Assembleia Nacional',
        category: 'ASSEMBLEIAS' as const,
        meta: 'PDF · assembleia bienal',
        icon: 'fa-file-signature',
        order: 1,
    },
    {
        title: 'Ata da Assembleia Nacional',
        category: 'ASSEMBLEIAS' as const,
        meta: 'PDF · registro oficial',
        icon: 'fa-file-lines',
        order: 2,
    },
    {
        title: 'Nota pública sobre moradia digna para famílias migrantes',
        category: 'NOTAS_PUBLICAS' as const,
        meta: 'PDF · junho de 2026',
        icon: 'fa-bullhorn',
        order: 1,
    },
    {
        title: 'Nota pública contra a xenofobia nas redes sociais',
        category: 'NOTAS_PUBLICAS' as const,
        meta: 'PDF · fevereiro de 2026',
        icon: 'fa-bullhorn',
        order: 2,
    },
    {
        title: 'Roteiro de círculos bíblicos sobre mobilidade humana',
        category: 'FORMACAO' as const,
        meta: 'PDF · subsídio de formação',
        icon: 'fa-book-open',
        order: 1,
    },
    {
        title: 'Cartilha: seus direitos como pessoa migrante no Brasil',
        category: 'FORMACAO' as const,
        meta: 'PDF · material de bolso',
        icon: 'fa-book',
        order: 2,
    },
    {
        title: 'Guia de acolhida para paróquias e comunidades',
        category: 'FORMACAO' as const,
        meta: 'PDF · orientação prática',
        icon: 'fa-book',
        order: 3,
    },
    {
        title: 'Relatório de atividades',
        category: 'RELATORIOS' as const,
        meta: 'PDF · prestação de contas anual',
        icon: 'fa-chart-column',
        order: 1,
    },
    {
        title: 'Demonstrativo financeiro',
        category: 'RELATORIOS' as const,
        meta: 'PDF · prestação de contas anual',
        icon: 'fa-coins',
        order: 2,
    },
];

// =========================================================
// Execução
// =========================================================

async function main() {
    console.log('Semeando o banco…');

    // --- Permissões e perfis ---
    for (const permission of PERMISSIONS) {
        await prisma.permission.upsert({
            where: { key: permission.key },
            update: permission,
            create: permission,
        });
    }

    for (const role of ROLES) {
        const { permissions, ...data } = role;
        const saved = await prisma.role.upsert({
            where: { key: role.key },
            update: data,
            create: data,
        });

        await prisma.rolePermission.deleteMany({ where: { roleId: saved.id } });
        if (permissions.length) {
            await prisma.rolePermission.createMany({
                data: permissions.map((permissionKey) => ({ roleId: saved.id, permissionKey })),
            });
        }
    }
    console.log(`  perfis: ${ROLES.length} · permissões: ${PERMISSIONS.length}`);

    // --- Regionais ---
    for (const regional of REGIONAIS) {
        await prisma.regional.upsert({
            where: { slug: regional.slug },
            update: regional,
            create: regional,
        });
    }
    const ufs = new Set(REGIONAIS.map((r) => r.uf));
    console.log(`  regionais: ${REGIONAIS.length} unidades em ${ufs.size} UFs`);

    // --- Usuário administrador ---
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'admin' } });
    const sede = await prisma.regional.findUnique({ where: { slug: 'sp-sao-paulo' } });

    const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@spmnacional.org.br').toLowerCase();
    const adminName = process.env.SEED_ADMIN_NAME || 'Administrador do SPM';
    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
    const initialPasswordHash = existingAdmin?.passwordHash
        ? existingAdmin.passwordHash
        : await hashPassword(requireSeedAdminPassword());

    await prisma.user.upsert({
        where: { email: adminEmail },
        update: {
            name: adminName,
            roleId: adminRole.id,
            status: 'ATIVO',
            // Não sobrescreve uma senha já trocada pela equipe.
            ...(existingAdmin?.passwordHash ? {} : { passwordHash: initialPasswordHash }),
        },
        create: {
            name: adminName,
            email: adminEmail,
            initials: 'AD',
            passwordHash: initialPasswordHash,
            roleId: adminRole.id,
            regionalId: sede?.id ?? null,
            status: 'ATIVO',
        },
    });
    console.log(`  administrador: ${adminEmail}`);

    // --- Categorias ---
    for (const category of CATEGORIES) {
        await prisma.category.upsert({
            where: { slug: category.slug },
            update: category,
            create: category,
        });
    }

    // --- Notícias ---
    for (const post of POSTS) {
        const { category, tags, cover, ...data } = post;
        const cat = await prisma.category.findUniqueOrThrow({ where: { slug: category } });

        const saved = await prisma.post.upsert({
            where: { slug: post.slug },
            update: { ...data, categoryId: cat.id, coverUrl: cover },
            create: { ...data, categoryId: cat.id, coverUrl: cover },
        });

        await prisma.postTag.deleteMany({ where: { postId: saved.id } });
        for (const tagName of tags) {
            const slug = tagName
                .normalize('NFD')
                .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            const tag = await prisma.tag.upsert({
                where: { slug },
                update: {},
                create: { slug, name: tagName },
            });
            await prisma.postTag.create({ data: { postId: saved.id, tagId: tag.id } });
        }
    }
    console.log(`  notícias: ${POSTS.length}`);

    // --- Semana do Migrante ---
    for (const semana of SEMANAS) {
        const { programacao, ...data } = semana;
        const saved = await prisma.semanaEdicao.upsert({
            where: { ano: semana.ano },
            update: data,
            create: data,
        });

        await prisma.semanaMaterial.deleteMany({ where: { edicaoId: saved.id } });
        await prisma.semanaMaterial.createMany({
            data: MATERIAIS_PADRAO.map((material, index) => ({
                edicaoId: saved.id,
                icon: material.icon,
                title: `${material.title} — ${semana.ano}`,
                meta: material.meta,
                order: index,
            })),
        });

        await prisma.semanaPrograma.deleteMany({ where: { edicaoId: saved.id } });
        await prisma.semanaPrograma.createMany({
            data: programacao.map((item, index) => ({ ...item, edicaoId: saved.id, order: index })),
        });
    }
    console.log(`  edições da Semana do Migrante: ${SEMANAS.length}`);

    // --- Agenda ---
    for (const event of AGENDA) {
        const existing = await prisma.agendaEvent.findFirst({
            where: { title: event.title, startsAt: event.startsAt },
        });
        if (existing) {
            await prisma.agendaEvent.update({ where: { id: existing.id }, data: event });
        } else {
            await prisma.agendaEvent.create({ data: event });
        }
    }
    console.log(`  eventos da agenda: ${AGENDA.length}`);

    // --- Editais ---
    for (const edital of EDITAIS) {
        await prisma.edital.upsert({
            where: { slug: edital.slug },
            update: edital,
            create: edital,
        });
    }
    console.log(`  editais: ${EDITAIS.length}`);

    // --- Testemunhos ---
    const totalTestemunhos = await prisma.testemunho.count();
    if (totalTestemunhos === 0) {
        await prisma.testemunho.createMany({
            data: TESTEMUNHOS.map((t) => ({
                ...t,
                consent: false,
                consentNote: DEMO,
                anonymized: true,
            })),
        });
    }
    console.log(`  testemunhos: ${await prisma.testemunho.count()}`);

    // --- Documentos ---
    const totalDocumentos = await prisma.documento.count();
    if (totalDocumentos === 0) {
        await prisma.documento.createMany({ data: DOCUMENTOS });
    }
    console.log(`  documentos: ${await prisma.documento.count()}`);

    // --- Configurações do site ---
    await prisma.siteSetting.upsert({
        where: { key: 'site' },
        update: {},
        create: {
            key: 'site',
            value: {
                siteName: 'SPM — Serviço Pastoral dos Migrantes',
                tagline: 'Acolher, Proteger, Promover e Integrar.',
                description:
                    'Organismo da Pastoral Social da CNBB que, desde 1985, acolhe, organiza e defende os direitos de migrantes e refugiados em todo o Brasil.',
                address: 'Rua Caiambé, 126 — Vila Monumento / Ipiranga',
                city: 'São Paulo — SP',
                zip: '04264-060',
                phone: '(11) 2063-7064',
                email: 'spm.nac@terra.com.br',
                hours: 'Segunda a sexta, das 9h às 17h',
                instagram: 'https://www.instagram.com/pastoraldosmigrantes',
                facebook: 'https://www.facebook.com/pastoraldosmigrantes',
                youtube: '',
                whatsapp: '',
                showStickyDonate: true,
                showNewsletter: true,
                showCookieNotice: true,
                maintenance: false,
            },
        },
    });

    console.log('Concluído.');
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
