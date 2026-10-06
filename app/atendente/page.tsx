import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser, getLocalTestAccount } from '@/lib/server/auth';
import { safeAdminDestination } from '@/lib/server/auth-security';
import { isGoogleOAuthEnabled } from '@/lib/server/env';
import { env } from '@/lib/server/env';
import { workspaceDomain } from '@/lib/config/workspace-auth';
import PageContent from './PageContent';

// Lê a sessão a cada requisição: nada aqui pode ser pré-renderizado.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Área do Atendente' };

type SearchParams = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined): string {
    if (Array.isArray(valor)) return valor[0] ?? '';
    return valor ?? '';
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const user = await getCurrentUser();
    if (user) {
        redirect('/admin');
    }

    const params = await searchParams;

    // O `erro` vem do retorno do Google; corta-se o tamanho para não deixar
    // alguém usar a URL de login como mural de texto arbitrário.
    const erro = primeiro(params.erro).slice(0, 200);

    return (
        <PageContent
            localTestAccount={await getLocalTestAccount()}
            googleEnabled={
                isGoogleOAuthEnabled() && Boolean(workspaceDomain(env.google.allowedDomain))
            }
            proximo={safeAdminDestination(primeiro(params.proximo))}
            erroInicial={erro || undefined}
        />
    );
}
