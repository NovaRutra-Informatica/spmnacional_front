'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';
import SiteChrome from './SiteChrome';

/**
 * As rotas do painel usam layout próprio, sem o cabeçalho e o rodapé
 * públicos — mesma regra que existia no AppComponent do Angular.
 */
export default function SiteShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isAdminArea = pathname.startsWith('/admin');

    if (isAdminArea) {
        return <>{children}</>;
    }

    return (
        <>
            <Header />
            <main>{children}</main>
            <Footer />
            <SiteChrome />
        </>
    );
}
