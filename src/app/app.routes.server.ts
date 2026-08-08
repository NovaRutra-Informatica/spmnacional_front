import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
    // O painel administrativo depende de sessão no navegador — renderiza só no cliente.
    {
        path: 'admin',
        renderMode: RenderMode.Client,
    },
    {
        path: 'admin/**',
        renderMode: RenderMode.Client,
    },
    {
        path: '**',
        renderMode: RenderMode.Prerender,
    },
];
