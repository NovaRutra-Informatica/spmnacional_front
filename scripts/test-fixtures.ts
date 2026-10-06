import { assertIsolatedDatabase } from '../tests/integration/guard';
import { prisma } from '../lib/server/db';
import { hashToken } from '../lib/server/crypto';
import catalog from '../lib/i18n/interface-catalog.json';
import { prepareTranslation } from '../lib/server/translation-content';
import { translationId } from '../lib/server/translation-store';
import type { TranslationLocale } from '../lib/i18n/config';

assertIsolatedDatabase();

/** Cache fictício para testar UI sem rede, credenciais ou tradução cobrada. */
async function seedSyntheticTranslations(postId: string, content: string) {
    if (process.env.E2E_TRANSLATION_ENABLED !== 'true') return;
    if (process.env.TRANSLATION_DAILY_CHARACTER_LIMIT !== '0')
        throw new Error('Fixtures de tradução exigem orçamento zero.');
    for (const locale of ['en', 'fr', 'es', 'ar'] as const) {
        const fake = (source: string) =>
            `[TEST ${locale}] ${locale === 'ar' ? 'مرحبا ' : ''}${source}`;
        const insert = async (
            key: string,
            fields: Record<string, string>,
            format: 'text' | 'markdown' = 'text',
        ) => {
            const { sourceHash } = prepareTranslation(fields, format);
            await prisma.publicTranslation.create({
                data: {
                    id: translationId(key, sourceHash, locale as TranslationLocale),
                    contentKey: key,
                    sourceHash,
                    locale,
                    translatedFields: Object.fromEntries(
                        Object.entries(fields).map(([name, text]) => [name, fake(text)]),
                    ),
                },
            });
        };
        for (const [key, texts] of Object.entries(catalog)) {
            for (let offset = 0; offset < texts.length; offset += 512) {
                await insert(
                    `interface:${key}:${offset}`,
                    Object.fromEntries(
                        texts.slice(offset, offset + 512).map((text, index) => [`t${index}`, text]),
                    ),
                );
            }
        }
        await insert(`markdown:post:${postId}`, { content }, 'markdown');
    }
}

async function main() {
    try {
        const localAccess = process.env.E2E_LOCAL_TEST_AUTH === 'true';
        const tokens = [
            process.env.E2E_SESSION_TOKEN ?? '',
            process.env.E2E_MOBILE_SESSION_TOKEN ?? '',
        ];
        if (
            tokens.some((token) => !/^[A-Za-z0-9_-]{43}$/.test(token)) ||
            new Set(tokens).size !== tokens.length ||
            process.env.GOOGLE_OAUTH_ALLOWED_DOMAIN !== (localAccess ? '' : 'example.test') ||
            (localAccess && process.env.LOCAL_TEST_AUTH_USER_ID !== 'e2e-admin')
        ) {
            throw new Error('Sessão/domínio sintéticos inválidos.');
        }
        for (const key of ['noticias', 'midia', 'config']) {
            await prisma.permission.create({ data: { key, label: key, hint: 'Teste sintético' } });
        }
        const role = await prisma.role.create({
            data: {
                key: 'admin',
                name: 'Administrador teste',
                description: 'Somente testes',
                permissions: {
                    create: ['noticias', 'midia', 'config'].map((permissionKey) => ({
                        permissionKey,
                    })),
                },
            },
        });
        const admin = await prisma.user.create({
            data: {
                id: 'e2e-admin',
                name: 'Administrador de teste',
                email: 'admin@example.test',
                initials: 'AT',
                roleId: role.id,
                status: 'ATIVO',
                googleSub: 'e2e-google-admin',
            },
        });
        // O E2E local deve obter a sessão pelo formulário real, nunca por fixture.
        if (!localAccess) {
            await prisma.session.createMany({
                data: tokens.map((token) => ({
                    userId: admin.id,
                    tokenHash: hashToken(token),
                    authMethod: 'GOOGLE_WORKSPACE',
                    googleSub: 'e2e-google-admin',
                    workspaceDomain: 'example.test',
                    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
                })),
            });
        }
        const category = await prisma.category.create({
            data: { name: 'Notícias', slug: 'noticias' },
        });
        const post = await prisma.post.create({
            data: {
                slug: 'noticia-publicada-teste',
                title: 'Notícia pública de teste',
                excerpt: 'Resumo de teste',
                content: 'Conteúdo sintético de teste.',
                categoryId: category.id,
                authorName: 'Equipe teste',
                status: 'PUBLICADO',
                publishedAt: new Date(Date.now() - 3600000),
            },
        });
        await seedSyntheticTranslations(post.id, post.content);
    } finally {
        await prisma.$disconnect();
    }
}
main().catch(() => {
    console.error('Não foi possível preparar os dados sintéticos.');
    process.exitCode = 1;
});
