/** Explicit, temporary local testing only. Never an alternative cloud login method. */
export interface LocalTestAuthConfig {
    enabled: boolean;
    userId: string | null;
}

function localOrigin(source: Record<string, string | undefined>): URL | null {
    const raw = source.APP_URL?.trim();
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (
            !['http:', 'https:'].includes(url.protocol) ||
            !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
            url.username ||
            url.password ||
            url.pathname !== '/' ||
            url.search ||
            url.hash ||
            ![url.origin, `${url.origin}/`].includes(raw)
        )
            return null;
        return url;
    } catch {
        return null;
    }
}

export function readLocalTestAuth(source: Record<string, string | undefined>): LocalTestAuthConfig {
    const off: LocalTestAuthConfig = { enabled: false, userId: null };
    if (source.LOCAL_TEST_AUTH_ENABLED !== 'true' || source.DEPLOYMENT_TARGET !== 'local')
        return off;
    if (
        source.K_SERVICE?.trim() ||
        source.K_REVISION?.trim() ||
        source.GOOGLE_OAUTH_CLIENT_ID?.trim() ||
        source.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
    )
        return off;
    if (!localOrigin(source)) return off;
    const userId = source.LOCAL_TEST_AUTH_USER_ID?.trim() ?? '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) return off;
    return { enabled: true, userId };
}

/** Host is the actual request host; forwarded-host is never a source of authority. */
export function isLocalTestRequest(
    headerList: Pick<Headers, 'get'>,
    source: Record<string, string | undefined>,
): boolean {
    if (!readLocalTestAuth(source).enabled) return false;
    const origin = localOrigin(source)!;
    const host = headerList.get('host');
    if (!host || host.toLowerCase() !== origin.host.toLowerCase()) return false;
    // Next can supply a matching forwarded-host internally. A conflicting proxy
    // host or explicit cross-site browser request must not activate this mode.
    const forwardedHost = headerList.get('x-forwarded-host');
    if (forwardedHost && forwardedHost.toLowerCase() !== origin.host.toLowerCase()) return false;
    return headerList.get('sec-fetch-site') !== 'cross-site';
}
