import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectDirectory = fileURLToPath(new URL('../../', import.meta.url));

function realImplementation(body: string) {
    const script = `
        const assert = require('node:assert/strict');
        const braces = require('braces');
        ${body}
        process.stdout.write('ok');
    `;
    return execFileSync(process.execPath, ['--max-old-space-size=64', '-e', script], {
        cwd: projectDirectory,
        timeout: 3000,
        maxBuffer: 16_384,
        encoding: 'utf8',
        env: {
            NODE_ENV: 'test',
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
        },
        windowsHide: true,
    });
}

describe('mitigação local de GHSA-vfj7-8cjw-p6xm na implementação real', () => {
    it('preserva glob aninhado permitido e os consumidores do ESLint', () => {
        expect(
            realImplementation(`
                const pattern = '{app,{lib,tests}}/**/*.{ts,tsx}';
                assert.deepEqual(braces.expand(pattern), [
                    'app/**/*.ts', 'app/**/*.tsx', 'lib/**/*.ts', 'lib/**/*.tsx',
                    'tests/**/*.ts', 'tests/**/*.tsx'
                ]);
                const paths = ['app/page.tsx', 'lib/helper.ts', 'tests/unit/a.test.ts', 'docs/a.md'];
                assert.deepEqual(require('micromatch')(paths, pattern), paths.slice(0, 3));
                const tasks = require('fast-glob').generateTasks(pattern);
                assert.deepEqual(tasks.flatMap(task => task.positive).sort(), braces.expand(pattern).sort());
                assert.deepEqual(braces.expand('x{1..3}'), ['x1', 'x2', 'x3']);
                assert.deepEqual(braces.expand('a{b,c}d'), ['abd', 'acd']);
            `),
        ).toBe('ok');
    });

    it('aceita a fronteira de 100 níveis sem alterar a expansão', () => {
        expect(
            realImplementation(`
                const pattern = '{'.repeat(100) + 'a,b' + '}'.repeat(100);
                assert.doesNotThrow(() => braces.parse(pattern));
                assert.doesNotThrow(() => braces(pattern));
                assert.equal(braces.expand(pattern).length, 2);
                assert.equal(braces.stringify(braces.parse(pattern)), pattern);
            `),
        ).toBe('ok');
    });

    it('mantém escapeInvalid anterior para braces literais ao limitar apenas profundidade', () => {
        expect(
            realImplementation(`
                for (const pattern of ['{a}', 'x{a}y', '{a']) {
                    assert.equal(braces.stringify(braces.parse(pattern), { escapeInvalid: true }), pattern);
                    assert.deepEqual(braces.expand(pattern, { escapeInvalid: true }), [pattern]);
                }
                assert.equal(braces.stringify(braces.parse('x{a,b}y'), { escapeInvalid: true }), 'x{a,b}y');
            `),
        ).toBe('ok');
    });

    it.each(['parse', 'compile', 'expand', 'stringify'])(
        'rejeita entrada profunda em %s antes de exaurir a pilha, com timeout no processo',
        (operation) => {
            expect(
                realImplementation(`
                    const pattern = '{'.repeat(3500) + 'a,b' + '}'.repeat(3500);
                    assert.ok(pattern.length < 10000);
                    const call = () => {
                        if ('${operation}' === 'compile') return braces(pattern);
                        if ('${operation}' === 'stringify') return braces.stringify(braces.parse(pattern));
                        return braces['${operation}'](pattern);
                    };
                    assert.throws(call, error => error instanceof SyntaxError &&
                        error.message === 'Input depth (101), exceeds max depth (100)');
                `),
            ).toBe('ok');
        },
    );

    it.each(['compile', 'expand', 'stringify'])(
        'protege também AST externa em %s, sem passar pelo parser',
        (operation) => {
            expect(
                realImplementation(`
                    let ast = { type: 'text', value: 'a' };
                    for (let i = 0; i < 101; i++) ast = { type: 'brace', nodes: [ast] };
                    ast = { type: 'root', nodes: [ast] };
                    assert.throws(() => braces.${operation}(ast), error => error instanceof RangeError &&
                        error.message === 'AST depth (101), exceeds max depth (100)');
                `),
            ).toBe('ok');
        },
    );

    it('limita profundidade combinada, sem permitir que maxDepth maior ou não finito contorne a patch', () => {
        expect(
            realImplementation(`
                const combined = '{'.repeat(51) + '('.repeat(50) + 'a' + ')'.repeat(50) + '}'.repeat(51);
                const tooDeep = '{'.repeat(101) + 'a,b' + '}'.repeat(101);
                for (const maxDepth of [1000, Infinity, NaN]) {
                    assert.throws(() => braces.parse(tooDeep, { maxDepth }), /exceeds max depth/);
                }
                assert.throws(() => braces.parse(combined), /exceeds max depth/);
                assert.throws(() => braces.parse('{{a,b},c}', { maxDepth: 1 }), /exceeds max depth/);
                assert.doesNotThrow(() => braces.parse('{{a,b},c}', { maxDepth: 2 }));
                assert.doesNotThrow(() => braces.parse((String.fromCharCode(92) + '{').repeat(101)));
            `),
        ).toBe('ok');
    });
});
