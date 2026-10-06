/** Nunca permite que a preparação de carga use um banco não descartável. */
export function assertIsolatedLoadDatabase(): void {
    let url: URL;
    try {
        url = new URL(process.env.DATABASE_URL ?? '');
    } catch {
        throw new Error('Carga exige banco descartável criado pelo executor isolado.');
    }

    const port = Number(url.port);
    if (
        !/^spm-load-[a-f0-9]{16}$/.test(process.env.SPM_LOAD_RUN ?? '') ||
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        url.hostname !== '127.0.0.1' ||
        url.pathname !== '/spm_load' ||
        url.username !== 'spm_load' ||
        !url.password ||
        !Number.isInteger(port) ||
        port < 1024 ||
        port > 65535 ||
        url.search !== '' ||
        url.hash !== ''
    ) {
        throw new Error('Carga exige banco descartável criado pelo executor isolado.');
    }
}
