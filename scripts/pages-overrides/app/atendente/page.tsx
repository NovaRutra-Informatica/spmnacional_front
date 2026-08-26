/**
 * Versão estática de `app/atendente/page.tsx`.
 *
 * O original lê a sessão (`getCurrentUser`) e a query string (`?proximo=`,
 * `?erro=`). As duas coisas obrigam renderização por requisição, o que o
 * `output: 'export'` não faz — daí esta versão, que só monta o PageContent com
 * valores fixos. O botão do Google fica escondido (`googleEnabled={false}`)
 * porque o OAuth precisa da rota `/api/auth/google`, que não existe aqui.
 */

import type { Metadata } from 'next';
import PageContent from './PageContent';

export const metadata: Metadata = { title: 'Área do Atendente' };

export default function Page() {
    return <PageContent googleEnabled={false} proximo="/admin" />;
}
