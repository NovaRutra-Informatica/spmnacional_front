/** Perfis iniciais compartilhados pelo seed demo e bootstrap vazio de produção. */
export const PERMISSIONS = [
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
export const ROLES = [
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
