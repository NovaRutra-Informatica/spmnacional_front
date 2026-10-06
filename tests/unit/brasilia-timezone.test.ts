import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const clockProbe = `
// The probe is outside Next's RSC runtime; replace only its import marker.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(id, parent, main) {
  return id === 'server-only' ? {} : originalLoad.call(this, id, parent, main);
};
const { formatDateTimeShort, formatDateLong, toDateInputValue } = require('./lib/labels.ts');
const { formDate } = require('./lib/server/actions.ts');
const form = new FormData();
form.set('startsAt', '2026-10-02T22:37');
form.set('dateOnly', '2026-10-02');
form.set('explicitOffset', '2026-10-02T22:37:00-03:00');
form.set('invalid', '2026-02-30T22:37');
console.log(JSON.stringify({
  label: formatDateTimeShort('2026-10-03T01:37:00.000Z'),
  parsed: formDate(form, 'startsAt')?.toISOString(),
  roundTrip: formatDateTimeShort(formDate(form, 'startsAt')),
  explicitOffset: formDate(form, 'explicitOffset')?.toISOString(),
  dateOnly: formatDateLong(formDate(form, 'dateOnly')),
  dateInput: toDateInputValue(formDate(form, 'dateOnly')),
  invalid: formDate(form, 'invalid'),
}));
`;

function probe(timezone: string) {
    const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', '-e', clockProbe],
        {
            cwd: process.cwd(),
            encoding: 'utf8',
            timeout: 15000,
            env: {
                ...process.env,
                TZ: timezone,
                DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/fixture',
            },
        },
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout.trim());
}

describe('horário de Brasília nos processos finais', () => {
    it('exibe a atividade no dia anterior correto e converte datetime-local para UTC', () => {
        expect(probe('America/Sao_Paulo')).toEqual({
            label: '02/10/2026 · 22:37',
            parsed: '2026-10-03T01:37:00.000Z',
            roundTrip: '02/10/2026 · 22:37',
            explicitOffset: '2026-10-03T01:37:00.000Z',
            dateOnly: '2 de outubro de 2026',
            dateInput: '2026-10-02',
            invalid: null,
        });
    });
    it('comprova a regressão sem TZ e preserva datas sem hora e offsets explícitos', () => {
        const utc = probe('UTC');
        expect(utc.label).toBe('03/10/2026 · 01:37');
        expect(utc.parsed).toBe('2026-10-02T22:37:00.000Z');
        expect(utc.explicitOffset).toBe('2026-10-03T01:37:00.000Z');
        expect(utc.dateOnly).toBe('2 de outubro de 2026');
        expect(utc.dateInput).toBe('2026-10-02');
    });
    it('configura o mesmo fuso na web e nos jobs HML e nos dois targets finais', () => {
        const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
        for (const target of ['migrator', 'runner']) {
            const stage = dockerfile.split(`FROM base AS ${target}`)[1].split('FROM base AS ')[0];
            expect(stage).toContain('ENV TZ=America/Sao_Paulo');
        }
        const compose = readFileSync(
            new URL('../../infra/hml/vm/docker-compose.yml', import.meta.url),
            'utf8',
        ).replace(/\r\n/g, '\n');
        const jobs = compose.split('x-job: &job')[1].split('\nservices:')[0];
        const web = compose.split('\n    web:\n')[1].split('\n    gateway:')[0];
        for (const service of [jobs, web])
            expect(service).toMatch(/environment:\s+TZ: America\/Sao_Paulo/);
    });
});
