import { spawnSync } from 'node:child_process';

export function assertLocalDockerEndpoint(endpoint) {
    if (
        typeof endpoint !== 'string' ||
        !/^(?:unix:\/\/\/[^\r\n\0?#]+|npipe:\/\/\/\/\.\/pipe\/[A-Za-z0-9._-]+)$/.test(endpoint)
    ) {
        throw new Error(
            'Testes isolados exigem daemon Docker local via unix socket ou named pipe.',
        );
    }
    return endpoint;
}

// DOCKER_CONTEXT takes precedence over DOCKER_HOST; inspect only the context's
// local metadata. No daemon request or mutation occurs until the endpoint passes.
export function resolveLocalDockerEndpoint(env, inspectContext) {
    const endpoint = env.DOCKER_CONTEXT
        ? inspectContext(env.DOCKER_CONTEXT)
        : env.DOCKER_HOST || inspectContext();
    return assertLocalDockerEndpoint(endpoint);
}

/** @param {{env?: Record<string, string | undefined>, run?: typeof spawnSync, cwd?: string}} options */
export function localDockerConnection(options = {}) {
    const { env = process.env, run = spawnSync, cwd = process.cwd() } = options;
    const read = (args) => {
        const result = run('docker', args, {
            env,
            cwd,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 15000,
        });
        if (result.status !== 0)
            throw new Error('Não foi possível verificar o contexto Docker local.');
        return result.stdout.trim();
    };
    const endpoint = resolveLocalDockerEndpoint(env, (selected) => {
        const context = selected || read(['context', 'show']);
        let metadata;
        try {
            metadata = JSON.parse(read(['context', 'inspect', context]));
        } catch {
            throw new Error('Não foi possível verificar o endpoint do contexto Docker.');
        }
        if (!Array.isArray(metadata) || metadata.length !== 1)
            throw new Error('Contexto Docker ambíguo.');
        return metadata[0]?.Endpoints?.docker?.Host;
    });
    const withEnv = (base) => {
        const pinned = { ...base, DOCKER_HOST: endpoint };
        delete pinned.DOCKER_CONTEXT;
        return pinned;
    };
    return Object.freeze({
        endpoint,
        env: withEnv(env),
        withEnv,
        args: (args) => ['--host', endpoint, ...args],
    });
}
