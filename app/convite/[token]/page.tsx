import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
    title: 'Acesso Google Workspace',
    robots: { index: false, follow: false },
};
/** Legacy invitation URLs are no longer credentials and disclose no account information. */
export default function Page() {
    redirect('/atendente');
}
