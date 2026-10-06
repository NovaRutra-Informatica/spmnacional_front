import 'server-only';

import { headers } from 'next/headers';
import { env } from './env';

export class UntrustedOriginError extends Error {
    constructor() {
        super('A origem desta solicitação não foi reconhecida. Reabra o site e tente novamente.');
        this.name = 'UntrustedOriginError';
    }
}

/** Defesa adicional à proteção nativa do Next; não confia em X-Forwarded-Host. */
export function isTrustedMutationOrigin(
    headerList: Pick<Headers, 'get'>,
    appUrl: string,
    development = false,
): boolean {
    const rawOrigin = headerList.get('origin');
    if (!rawOrigin || headerList.get('sec-fetch-site') === 'cross-site') return false;

    try {
        const origin = new URL(rawOrigin);
        const canonical = new URL(appUrl);
        // Origin não é uma URL de navegação: caminhos, credenciais e origem opaca são inválidos.
        if (
            !['https:', 'http:'].includes(origin.protocol) ||
            rawOrigin !== origin.origin ||
            origin.username ||
            origin.password
        )
            return false;

        if (origin.origin === canonical.origin) return true;

        // Permite a porta alternativa do Next dev, mas nunca um host encaminhado pelo cliente.
        return (
            development &&
            ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) &&
            origin.host === headerList.get('host')
        );
    } catch {
        return false;
    }
}

/** Chamar apenas em mutações recebidas do navegador, nunca durante renderização/GET. */
export async function assertTrustedMutationOrigin(): Promise<void> {
    if (
        !isTrustedMutationOrigin(await headers(), env.appUrl, process.env.NODE_ENV !== 'production')
    ) {
        throw new UntrustedOriginError();
    }
}
