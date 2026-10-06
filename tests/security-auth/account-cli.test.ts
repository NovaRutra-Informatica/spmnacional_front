import { describe, expect, it } from 'vitest';
import { parseAccountArgs } from '../../scripts/lib/account-cli';
describe('CLI somente Workspace', () => {
    it.each([
        ['--senha', 'segredo'],
        ['--senha=segredo'],
        ['--password', 'segredo'],
        ['--senha-stdin'],
    ])('rejeita opções de senha legadas %j', (...args) => {
        expect(() => parseAccountArgs(args)).toThrow('Senhas locais não são suportadas');
    });
    it('aceita e-mail, perfil e atualização explícita sem senha', () => {
        expect(
            parseAccountArgs([
                '--email',
                'equipe@example.test',
                '--perfil',
                'editor',
                '--atualizar',
            ]),
        ).toEqual({
            '--email': 'equipe@example.test',
            '--perfil': 'editor',
            '--atualizar': true,
        });
    });
    it('rejeita parâmetro repetido e desconhecido', () => {
        expect(() => parseAccountArgs(['--email', 'x@y.test', '--email', 'a@y.test'])).toThrow();
        expect(() => parseAccountArgs(['--unknown'])).toThrow();
        expect(() => parseAccountArgs([])).toThrow();
    });
});
