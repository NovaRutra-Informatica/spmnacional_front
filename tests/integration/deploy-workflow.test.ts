import { describe, expect, it } from 'vitest';
import {
    compatibilityStep,
    databaseProtocol,
    extractWorkflowRun,
    rollbackStep,
    runWorkflowStep,
    workflowFixture,
} from '../helpers/deploy-workflow';

const isJobMutation = (command: string[]) =>
    command[0] === 'gcloud' &&
    command[1] === 'run' &&
    command[2] === 'jobs' &&
    ['update', 'execute'].includes(command[3]);
const isTrafficMutation = (command: string[]) =>
    command.slice(0, 4).join(' ') === 'gcloud run services update-traffic';
const sqlGuardArgs =
    '--args=scripts/lib/check-migrations.mjs,--mode=online,--app-protocol=scoped-rls-v1';

describe('Bash real do workflow de deploy, isolado sem rede', () => {
    it('extrai só o bloco run do passo escolhido e recusa nomes ausentes/duplicados', () => {
        const source =
            '  - name: Guard\r\n    run: |\r\n      set -eu\r\n      echo guard\r\n    env:\r\n      OTHER: ignore\r\n  - name: Later\r\n    run: echo later\r\n';
        expect(extractWorkflowRun(source, 'Guard')).toBe('set -eu\necho guard\n');
        expect(() => extractWorkflowRun(source, 'Missing')).toThrow();
        expect(() => extractWorkflowRun(source + source, 'Guard')).toThrow();
    });

    it('inspeciona app, migrador e todas as revisões anteriores antes do guard SQL', () => {
        const result = runWorkflowStep(compatibilityStep);
        expect(result.status, result.stderr).toBe(0);
        expect(result.githubOutput).toBe(`verified=${databaseProtocol}\n`);
        expect(
            result.commands.filter((c) => c[0] === 'docker' && c[1] === 'pull').map((c) => c[3]),
        ).toEqual([
            workflowFixture.APP_IMAGE,
            workflowFixture.IMAGE,
            workflowFixture.FIXTURE_PREVIOUS_A_IMAGE,
            workflowFixture.FIXTURE_PREVIOUS_B_IMAGE,
        ]);
        expect(
            result.commands.filter((c) => c[0] === 'docker' && c[1] === 'image').map((c) => c[5]),
        ).toEqual([
            workflowFixture.APP_IMAGE,
            workflowFixture.IMAGE,
            workflowFixture.FIXTURE_PREVIOUS_A_IMAGE,
            workflowFixture.FIXTURE_PREVIOUS_B_IMAGE,
        ]);
        const revisions = result.commands.filter(
            (c) => c.slice(0, 4).join(' ') === 'gcloud run revisions describe',
        );
        expect(revisions.map((c) => c[4])).toEqual(['fixture-live-a', 'fixture-live-b']);
        const mutations = result.commands.filter(isJobMutation);
        expect(mutations.map((c) => c[3])).toEqual(['update', 'execute']);
        expect(mutations[0]).toContain(sqlGuardArgs);
        expect(mutations[0]).toContain(workflowFixture.IMAGE);
        expect(mutations[1]).toContain('--wait');
        expect(result.commands.indexOf(mutations[0])).toBeGreaterThan(
            result.commands.findLastIndex((c) => c[0] === 'docker'),
        );
        expect(result.commands.some(isTrafficMutation)).toBe(false);
    });

    it.each([
        ['app antigo', { FIXTURE_APP_LABEL: 'legacy' }],
        ['migrador antigo', { FIXTURE_MIGRATOR_LABEL: 'legacy' }],
        ['primeira revisão anterior antiga', { FIXTURE_PREVIOUS_A_LABEL: 'legacy' }],
        ['segunda revisão anterior antiga', { FIXTURE_PREVIOUS_B_LABEL: 'legacy' }],
        ['app sem label', { FIXTURE_APP_LABEL: '' }],
        ['migrador sem label', { FIXTURE_MIGRATOR_LABEL: '' }],
        ['revisão anterior sem label', { FIXTURE_PREVIOUS_B_LABEL: '' }],
        ['app com tag mutável', { APP_IMAGE: 'fixture/app:latest' }],
        ['migrador sem digest', { IMAGE: 'fixture/migrator' }],
        ['revisão anterior sem digest', { FIXTURE_PREVIOUS_A_IMAGE: '' }],
        [
            'segunda revisão anterior com tag mutável',
            { FIXTURE_PREVIOUS_B_IMAGE: 'fixture/old:latest' },
        ],
        ['pull indisponível', { FIXTURE_PULL_EXIT: '42' }],
        ['inspect indisponível', { FIXTURE_INSPECT_EXIT: '42' }],
        ['consulta de revisão falhou', { FIXTURE_REVISION_EXIT: '42' }],
    ] satisfies Array<[string, Record<string, string>]>)(
        'bloqueia %s antes de qualquer mutação SQL',
        (_name, overrides) => {
            const result = runWorkflowStep(compatibilityStep, overrides);
            expect(result.status).not.toBe(0);
            expect(result.commands.filter(isJobMutation)).toEqual([]);
            expect(result.commands.filter(isTrafficMutation)).toEqual([]);
            expect(result.githubOutput).toBe('');
        },
    );

    it('falha de guard SQL interrompe o passo de compatibilidade', () => {
        const result = runWorkflowStep(compatibilityStep, { FIXTURE_SQL_EXIT: '42' });
        expect(result.status).toBe(42);
        expect(result.commands.filter(isJobMutation).map((c) => c[3])).toEqual([
            'update',
            'execute',
        ]);
        expect(result.commands.some(isTrafficMutation)).toBe(false);
    });

    it('rollback revalida o banco antes de devolver o split original de tráfego', () => {
        const result = runWorkflowStep(rollbackStep);
        expect(result.status, result.stderr).toBe(0);
        expect(result.commands.map((c) => c.slice(0, 4).join(' '))).toEqual([
            'gcloud run jobs update',
            'gcloud run jobs execute',
            'gcloud run services update-traffic',
        ]);
        expect(result.commands[0]).toContain(sqlGuardArgs);
        expect(result.commands[0]).toContain(workflowFixture.MIGRATOR_IMAGE);
        expect(result.commands[1]).toContain('--wait');
        expect(result.commands[2]).toContain(workflowFixture.PREVIOUS_TRAFFIC);
    });

    it.each([
        ['SQL incompatível', { FIXTURE_SQL_EXIT: '42' }],
        ['job de guard indisponível', { FIXTURE_JOB_UPDATE_EXIT: '42' }],
        ['protocolo não verificado', { VERIFIED_PROTOCOL: '' }],
        ['protocolo antigo', { VERIFIED_PROTOCOL: 'legacy' }],
    ] satisfies Array<[string, Record<string, string>]>)(
        'rollback bloqueia tráfego quando %s',
        (_name, overrides: Record<string, string>) => {
            const result = runWorkflowStep(rollbackStep, overrides);
            expect(result.status).not.toBe(0);
            expect(result.commands.filter(isTrafficMutation)).toEqual([]);
            if (overrides.VERIFIED_PROTOCOL !== undefined) expect(result.commands).toEqual([]);
            if (overrides.FIXTURE_SQL_EXIT) {
                expect(result.commands.filter(isJobMutation).map((c) => c[3])).toEqual([
                    'update',
                    'execute',
                ]);
                expect(result.commands[0]).toContain(sqlGuardArgs);
            }
            if (overrides.FIXTURE_JOB_UPDATE_EXIT) {
                expect(result.commands.filter(isJobMutation).map((c) => c[3])).toEqual(['update']);
            }
        },
    );
});
