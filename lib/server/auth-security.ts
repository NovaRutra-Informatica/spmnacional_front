/** Regras puras compartilhadas pelo formulário, sessão e proxy. */
export function isSessionToken(token: string | null | undefined): token is string {
    return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function safeAdminDestination(input: string): string {
    if (!input || input.length > 2048 || /[\\\u0000-\u0020\u007f]/.test(input)) return '/admin';
    try {
        const destination = new URL(input, 'https://internal.invalid');
        if (destination.origin !== 'https://internal.invalid' || !input.startsWith('/'))
            return '/admin';
        const decodedPath = decodeURIComponent(destination.pathname);
        if (/[\\\u0000-\u0020\u007f]/.test(decodedPath)) return '/admin';
        // A resolução de URL elimina ../ antes de avaliar a fronteira real da rota.
        if (destination.pathname !== '/admin' && !destination.pathname.startsWith('/admin/'))
            return '/admin';
        if (decodedPath.split('/').some((part) => part === '.' || part === '..')) return '/admin';
        return `${destination.pathname}${destination.search}${destination.hash}`;
    } catch {
        return '/admin';
    }
}
