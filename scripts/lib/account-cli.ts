import { AccountInputError } from './account-provisioning';

export function parseAccountArgs(args: string[]): Record<string, string | boolean> {
    const options: Record<string, string | boolean> = {};
    const flags = new Set(['--atualizar']);
    const values = new Set(['--email', '--nome', '--perfil', '--regional']);
    for (let index = 0; index < args.length; index++) {
        const key = args[index];
        if (/^--(?:senha|password)(?:[-=]|$)/.test(key))
            throw new AccountInputError(
                'Senhas locais não são suportadas; cadastre uma conta Google Workspace.',
            );
        if (key in options) throw new AccountInputError('Parâmetro repetido.');
        if (flags.has(key)) {
            options[key] = true;
            continue;
        }
        if (!values.has(key) || !args[index + 1] || args[index + 1].startsWith('--'))
            throw new AccountInputError(
                'Parâmetros inválidos. Use --email, --nome, --perfil, --regional e --atualizar.',
            );
        options[key] = args[++index];
    }
    if (typeof options['--email'] !== 'string') throw new AccountInputError('Informe --email.');
    return options;
}
