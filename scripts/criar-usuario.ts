/**
 * Cria conta ou redefine uma existente explicitamente (--atualizar).
 * Conta autorizada Google Workspace, sem senha local.
 * npm run user:create -- --email equipe@spm.example --nome Equipe --perfil editor
 * Perfil padrão de novas contas: leitura; atualizações preservam o perfil omitido.
 */
import 'dotenv/config';
import { prisma } from '../lib/server/db';
import { logError } from '../lib/server/logger';
import { AccountInputError, provisionAccount } from './lib/account-provisioning';
import { parseAccountArgs } from './lib/account-cli';

async function main(): Promise<void> {
    const args = parseAccountArgs(process.argv.slice(2));
    if (!process.env.DATABASE_URL) throw new AccountInputError('DATABASE_URL é obrigatória.');
    if (process.env.USER_PASSWORD)
        throw new AccountInputError('USER_PASSWORD não é suportado; use Google Workspace.');
    const result = await provisionAccount(prisma, {
        email: args['--email'] as string,
        workspaceDomain: process.env.GOOGLE_OAUTH_ALLOWED_DOMAIN ?? '',
        name: args['--nome'] as string | undefined,
        roleKey: args['--perfil'] as string | undefined,
        regionalSlug: args['--regional'] as string | undefined,
        updateExisting: args['--atualizar'] === true,
    });
    console.log(
        `Conta ${result.created ? 'criada' : 'atualizada'} com sucesso. Sessões anteriores encerradas: ${result.revokedSessions}.`,
    );
}
main()
    .catch((error: unknown) => {
        if (error instanceof AccountInputError) console.error(error.message);
        else {
            logError('account_cli.failed', error);
            console.error(
                'Operação não concluída. Verifique a configuração e a disponibilidade do banco.',
            );
        }
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
