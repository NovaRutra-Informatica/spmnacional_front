import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
    assertLocalDockerEndpoint,
    localDockerConnection,
    resolveLocalDockerEndpoint,
} from '../../scripts/lib/docker-local.mjs';

describe('Docker local obrigatório antes de qualquer mutação de teste', () => {
    it.each([
        'unix:///var/run/docker.sock',
        'unix:///run/user/1000/docker.sock',
        'npipe:////./pipe/dockerDesktopLinuxEngine',
    ])('aceita somente transporte local %s', (endpoint) =>
        expect(assertLocalDockerEndpoint(endpoint)).toBe(endpoint),
    );
    it.each([
        'ssh://user@example.test',
        'tcp://127.0.0.1:2375',
        'tcp://192.0.2.1:2376',
        'npipe:////server/pipe/docker_engine',
        'unix://remote/docker.sock',
        '',
        undefined,
        'unix:///var/run/docker.sock?host=other',
        'unix:///var/run/docker.sock\n',
    ])('recusa %s', (endpoint) => {
        expect(() => assertLocalDockerEndpoint(endpoint)).toThrow('daemon Docker local');
    });
    it('DOCKER_CONTEXT sobrepõe DOCKER_HOST e o endpoint efetivo remoto é recusado', () => {
        const inspect = vi.fn(() => 'ssh://fixture@example.test');
        expect(() =>
            resolveLocalDockerEndpoint(
                { DOCKER_CONTEXT: 'remote', DOCKER_HOST: 'unix:///var/run/docker.sock' },
                inspect,
            ),
        ).toThrow();
        expect(inspect).toHaveBeenCalledExactlyOnceWith('remote');
        expect(
            resolveLocalDockerEndpoint(
                { DOCKER_CONTEXT: 'local', DOCKER_HOST: 'ssh://ignored@example.test' },
                () => 'unix:///var/run/docker.sock',
            ),
        ).toBe('unix:///var/run/docker.sock');
    });
    it('DOCKER_HOST remoto é recusado sem consulta ao daemon ou ao contexto', () => {
        const inspect = vi.fn();
        expect(() =>
            resolveLocalDockerEndpoint({ DOCKER_HOST: 'tcp://192.0.2.1:2375' }, inspect),
        ).toThrow();
        expect(inspect).not.toHaveBeenCalled();
    });
    it('resolve contexto ativo só com metadados locais e fixa endpoint/env sem trocar contexto global', () => {
        const calls: string[][] = [];
        const run = vi.fn((_command: string, args: string[]) => {
            calls.push(args);
            return {
                status: 0,
                stdout:
                    args[1] === 'show'
                        ? 'desktop-linux\n'
                        : JSON.stringify([
                              {
                                  Endpoints: {
                                      docker: { Host: 'npipe:////./pipe/dockerDesktopLinuxEngine' },
                                  },
                              },
                          ]),
            };
        });
        const connection = localDockerConnection({
            env: {},
            run: run as unknown as typeof spawnSync,
        });
        expect(calls).toEqual([
            ['context', 'show'],
            ['context', 'inspect', 'desktop-linux'],
        ]);
        expect(connection.args(['run', 'fixture'])).toEqual([
            '--host',
            connection.endpoint,
            'run',
            'fixture',
        ]);
        const input = {
            DOCKER_CONTEXT: 'old',
            POSTGRES_PASSWORD: 'synthetic-only',
            BASE_URL: 'fixed',
        };
        expect(connection.withEnv(input)).toEqual({
            POSTGRES_PASSWORD: 'synthetic-only',
            BASE_URL: 'fixed',
            DOCKER_HOST: connection.endpoint,
        });
        expect(input.DOCKER_CONTEXT).toBe('old');
    });
    it('contexto remoto/inválido nunca alcança comandos run/start/create', () => {
        for (const raw of [
            JSON.stringify([{ Endpoints: { docker: { Host: 'ssh://fixture@example.test' } } }]),
            'invalid',
            '[]',
        ]) {
            const run = vi.fn(() => ({ status: 0, stdout: raw }));
            expect(() =>
                localDockerConnection({
                    env: { DOCKER_CONTEXT: 'fixture' },
                    run: run as unknown as typeof spawnSync,
                }),
            ).toThrow();
            expect(run.mock.calls).toHaveLength(1);
        }
        const failed = vi.fn(() => ({ status: 1, stdout: '' }));
        expect(() =>
            localDockerConnection({ env: {}, run: failed as unknown as typeof spawnSync }),
        ).toThrow();
    });
    it.each(['scripts/test-load.mjs', 'scripts/test-isolated.mjs'])(
        '%s recusa host remoto antes de executar Docker e não imprime o endpoint privado',
        (script) => {
            const result = spawnSync(
                process.execPath,
                [
                    script,
                    ...(script.includes('load')
                        ? ['--skip-build', '--profile=capacity', '--engine=monotonic']
                        : ['integration']),
                ],
                {
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        DOCKER_CONTEXT: '',
                        DOCKER_HOST: 'ssh://private-fixture@example.test',
                    },
                    timeout: 5000,
                },
            );
            expect(result.status).not.toBe(0);
            expect(result.stderr).toContain('daemon Docker local');
            expect(result.stderr).not.toContain('private-fixture');
            const source = readFileSync(script, 'utf8');
            expect(source.indexOf('localDockerConnection({ cwd: root })')).toBeLessThan(
                source.indexOf("'run',"),
            );
        },
    );
});
