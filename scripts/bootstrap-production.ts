/** Primeiro acesso em banco vazio, sem seed/conteúdo demo. Não recebe segredos por argv. */
import 'dotenv/config';
import { prisma } from '../lib/server/db';
import { logError } from '../lib/server/logger';
import { AccountInputError, bootstrapProduction } from './lib/account-provisioning';

async function main(): Promise<void> {
    if (process.argv.length > 2)
        throw new AccountInputError(
            'Bootstrap aceita apenas variáveis BOOTSTRAP_ADMIN_EMAIL/NAME e GOOGLE_OAUTH_ALLOWED_DOMAIN, não argumentos.',
        );
    if (!process.env.DATABASE_URL) throw new AccountInputError('DATABASE_URL é obrigatória.');
    if (process.env.BOOTSTRAP_ADMIN_PASSWORD)
        throw new AccountInputError(
            'BOOTSTRAP_ADMIN_PASSWORD não é suportado; use Google Workspace.',
        );
    await bootstrapProduction(prisma, {
        email: process.env.BOOTSTRAP_ADMIN_EMAIL ?? '',
        name: process.env.BOOTSTRAP_ADMIN_NAME,
        workspaceDomain: process.env.GOOGLE_OAUTH_ALLOWED_DOMAIN ?? '',
    });
    console.log(
        'Bootstrap concluído: perfis, permissões e um administrador. Nenhum conteúdo demonstrativo foi criado.',
    );
}
main()
    .catch((error: unknown) => {
        if (error instanceof AccountInputError) console.error(error.message);
        else {
            logError('bootstrap.failed', error);
            console.error(
                'Bootstrap não concluído. Verifique a configuração e a disponibilidade do banco.',
            );
        }
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
