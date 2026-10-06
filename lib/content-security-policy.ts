/** HTML receives a fresh nonce from the proxy; API and asset policies are static. */
export function contentSecurityPolicy(production: boolean, nonce?: string, analytics = false): string {
    if (nonce !== undefined && !/^[A-Za-z0-9+/=_-]{20,128}$/.test(nonce)) {
        throw new Error('Nonce CSP inválido.');
    }
    return [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        // O painel usa estilos inline em componentes React; scripts não recebem essa exceção.
        "style-src 'self' 'unsafe-inline'",
        `script-src 'self'${nonce ? ` 'nonce-${nonce}' 'strict-dynamic'` : ''}${analytics ? ' https://www.googletagmanager.com' : ''}${production ? '' : " 'unsafe-eval'"}`,
        "script-src-attr 'none'",
        `connect-src 'self'${analytics ? ' https://www.google-analytics.com https://region1.google-analytics.com' : ''}`,
        "media-src 'self' https:",
        "worker-src 'self' blob:",
        ...(production ? ['upgrade-insecure-requests'] : []),
    ].join('; ');
}
