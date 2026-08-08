import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { authGuard } from './core/auth.guard';

const SUFFIX = ' | SPM — Serviço Pastoral dos Migrantes';
const ADMIN_SUFFIX = ' | Painel SPM';

export const routes: Routes = [
    {
        path: '',
        component: HomeComponent,
        title: 'SPM — Serviço Pastoral dos Migrantes',
    },

    // ------------------------------------------------------------------
    // Quem Somos
    // ------------------------------------------------------------------
    {
        path: 'quem-somos',
        title: 'Quem Somos' + SUFFIX,
        loadComponent: () =>
            import('./pages/quem-somos/quem-somos.component').then((m) => m.QuemSomosComponent),
    },
    {
        path: 'quem-somos/historia',
        title: 'Nossa História' + SUFFIX,
        loadComponent: () =>
            import('./pages/historia/historia.component').then((m) => m.HistoriaComponent),
    },
    {
        path: 'quem-somos/estrutura',
        title: 'Estrutura e Coordenação' + SUFFIX,
        loadComponent: () =>
            import('./pages/estrutura/estrutura.component').then((m) => m.EstruturaComponent),
    },
    {
        path: 'quem-somos/documentos',
        title: 'Documentos' + SUFFIX,
        loadComponent: () =>
            import('./pages/documentos/documentos.component').then((m) => m.DocumentosComponent),
    },

    // ------------------------------------------------------------------
    // Atuação
    // ------------------------------------------------------------------
    {
        path: 'o-que-fazemos',
        title: 'O que fazemos' + SUFFIX,
        loadComponent: () =>
            import('./pages/atuacao/atuacao.component').then((m) => m.AtuacaoComponent),
    },
    {
        path: 'onde-estamos',
        title: 'Onde estamos' + SUFFIX,
        loadComponent: () =>
            import('./pages/onde-estamos/onde-estamos.component').then(
                (m) => m.OndeEstamosComponent,
            ),
    },
    {
        path: 'transparencia',
        title: 'Transparência' + SUFFIX,
        loadComponent: () =>
            import('./pages/transparencia/transparencia.component').then(
                (m) => m.TransparenciaComponent,
            ),
    },

    // ------------------------------------------------------------------
    // Legislação
    // ------------------------------------------------------------------
    {
        path: 'legislacao',
        title: 'Legislação' + SUFFIX,
        loadComponent: () =>
            import('./pages/legislacao/legislacao.component').then((m) => m.LegislacaoComponent),
    },
    {
        path: 'legislacao/lei-de-migracao',
        title: 'Lei nº 13.445/2017 — Lei de Migração' + SUFFIX,
        loadComponent: () =>
            import('./pages/lei-de-migracao/lei-de-migracao.component').then(
                (m) => m.LeiDeMigracaoComponent,
            ),
    },
    {
        path: 'legislacao/lei-municipal-16478',
        title: 'Lei Municipal nº 16.478/2016' + SUFFIX,
        loadComponent: () =>
            import('./pages/lei-municipal/lei-municipal.component').then(
                (m) => m.LeiMunicipalComponent,
            ),
    },
    {
        path: 'legislacao/decreto-57533',
        title: 'Decreto nº 57.533/2016' + SUFFIX,
        loadComponent: () =>
            import('./pages/decreto/decreto.component').then((m) => m.DecretoComponent),
    },

    // ------------------------------------------------------------------
    // Publicações
    // ------------------------------------------------------------------
    {
        path: 'publicacoes',
        title: 'Publicações' + SUFFIX,
        loadComponent: () =>
            import('./pages/publicacoes/publicacoes.component').then((m) => m.PublicacoesComponent),
    },
    {
        path: 'publicacoes/blog',
        title: 'Blog e Notícias' + SUFFIX,
        loadComponent: () => import('./pages/blog/blog.component').then((m) => m.BlogComponent),
    },
    {
        path: 'publicacoes/blog/spm-40-anos',
        title: '40 anos de caminhada com quem migra' + SUFFIX,
        loadComponent: () =>
            import('./pages/artigo/artigo.component').then((m) => m.ArtigoComponent),
    },
    {
        path: 'publicacoes/editais',
        title: 'Editais' + SUFFIX,
        loadComponent: () =>
            import('./pages/editais/editais.component').then((m) => m.EditaisComponent),
    },
    {
        path: 'publicacoes/testemunhos',
        title: 'Testemunhos' + SUFFIX,
        loadComponent: () =>
            import('./pages/testemunhos/testemunhos.component').then((m) => m.TestemunhosComponent),
    },

    // ------------------------------------------------------------------
    // Semana do Migrante
    // ------------------------------------------------------------------
    {
        path: 'semana-do-migrante',
        title: 'Semana do Migrante' + SUFFIX,
        loadComponent: () =>
            import('./pages/semana-do-migrante/semana-do-migrante.component').then(
                (m) => m.SemanaDoMigranteComponent,
            ),
    },
    {
        path: 'semana-do-migrante/material-2026',
        title: 'Material 2026 — 41ª Semana do Migrante' + SUFFIX,
        loadComponent: () =>
            import('./pages/material-2026/material-2026.component').then(
                (m) => m.Material2026Component,
            ),
    },
    {
        path: 'semana-do-migrante/material-2025',
        title: 'Material 2025 — 40ª Semana do Migrante' + SUFFIX,
        loadComponent: () =>
            import('./pages/material-2025/material-2025.component').then(
                (m) => m.Material2025Component,
            ),
    },
    {
        path: 'semana-do-migrante/material-2024',
        title: 'Material 2024 — 39ª Semana do Migrante' + SUFFIX,
        loadComponent: () =>
            import('./pages/material-2024/material-2024.component').then(
                (m) => m.Material2024Component,
            ),
    },

    // ------------------------------------------------------------------
    // Serviços e institucional
    // ------------------------------------------------------------------
    {
        path: 'como-ajudar',
        title: 'Como Ajudar' + SUFFIX,
        loadComponent: () =>
            import('./pages/como-ajudar/como-ajudar.component').then((m) => m.ComoAjudarComponent),
    },
    {
        path: 'fale-conosco',
        title: 'Fale Conosco' + SUFFIX,
        loadComponent: () =>
            import('./pages/fale-conosco/fale-conosco.component').then(
                (m) => m.FaleConoscoComponent,
            ),
    },
    {
        path: 'atendente',
        title: 'Área do Atendente' + SUFFIX,
        loadComponent: () =>
            import('./pages/atendente/atendente.component').then((m) => m.AtendenteComponent),
    },
    {
        path: 'politica-de-privacidade',
        title: 'Política de Privacidade' + SUFFIX,
        loadComponent: () =>
            import('./pages/privacidade/privacidade.component').then((m) => m.PrivacidadeComponent),
    },

    // ------------------------------------------------------------------
    // Painel administrativo (área restrita)
    // ------------------------------------------------------------------
    {
        path: 'admin',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/admin/admin-layout/admin-layout.component').then(
                (m) => m.AdminLayoutComponent,
            ),
        children: [
            {
                path: '',
                title: 'Painel' + ADMIN_SUFFIX,
                loadComponent: () =>
                    import('./pages/admin/dashboard/dashboard.component').then(
                        (m) => m.AdminDashboardComponent,
                    ),
            },
            {
                path: 'noticias',
                title: 'Notícias' + ADMIN_SUFFIX,
                loadComponent: () =>
                    import('./pages/admin/noticias/noticias.component').then(
                        (m) => m.AdminNoticiasComponent,
                    ),
            },
            {
                path: 'noticias/nova',
                title: 'Nova notícia' + ADMIN_SUFFIX,
                loadComponent: () =>
                    import('./pages/admin/noticia-editor/noticia-editor.component').then(
                        (m) => m.AdminNoticiaEditorComponent,
                    ),
            },
            {
                path: 'midia',
                title: 'Biblioteca de mídia' + ADMIN_SUFFIX,
                loadComponent: () =>
                    import('./pages/admin/midia/midia.component').then(
                        (m) => m.AdminMidiaComponent,
                    ),
            },
            {
                path: 'usuarios',
                title: 'Usuários' + ADMIN_SUFFIX,
                loadComponent: () =>
                    import('./pages/admin/usuarios/usuarios.component').then(
                        (m) => m.AdminUsuariosComponent,
                    ),
            },
            {
                path: 'usuarios/novo',
                title: 'Convidar usuário' + ADMIN_SUFFIX,
                loadComponent: () =>
                    import('./pages/admin/usuario-editor/usuario-editor.component').then(
                        (m) => m.AdminUsuarioEditorComponent,
                    ),
            },
            {
                path: 'acessos',
                title: 'Perfis e permissões' + ADMIN_SUFFIX,
                loadComponent: () =>
                    import('./pages/admin/acessos/acessos.component').then(
                        (m) => m.AdminAcessosComponent,
                    ),
            },
            {
                path: 'configuracoes',
                title: 'Configurações' + ADMIN_SUFFIX,
                loadComponent: () =>
                    import('./pages/admin/configuracoes/configuracoes.component').then(
                        (m) => m.AdminConfiguracoesComponent,
                    ),
            },
        ],
    },

    // ------------------------------------------------------------------
    // Redirecionamentos legados e 404
    // ------------------------------------------------------------------
    { path: 'sobre', redirectTo: 'quem-somos', pathMatch: 'full' },
    { path: 'contato', redirectTo: 'fale-conosco', pathMatch: 'full' },
    { path: 'noticias', redirectTo: 'publicacoes/blog', pathMatch: 'full' },
    { path: 'impacto', redirectTo: 'transparencia', pathMatch: 'full' },
    {
        path: '**',
        title: 'Página não encontrada' + SUFFIX,
        loadComponent: () =>
            import('./pages/nao-encontrado/nao-encontrado.component').then(
                (m) => m.NaoEncontradoComponent,
            ),
    },
];
