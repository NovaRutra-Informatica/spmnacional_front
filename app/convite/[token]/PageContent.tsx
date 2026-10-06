import Link from 'next/link';
/** Compatibility component: old invitations are never password-activation credentials. */
export default function PageContent() {
    return <Link href="/atendente">Entrar com Google Workspace</Link>;
}
