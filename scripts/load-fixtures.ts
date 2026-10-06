import type { PrismaClient, Prisma } from '../lib/generated/prisma/client';
import { PERMISSIONS } from '../lib/config/roles';
import { assertIsolatedLoadDatabase } from '../tests/load/guard';

type CryptoServices = typeof import('../lib/server/crypto');

const DAY_MS = 24 * 60 * 60 * 1000;
const FIXTURE_MEDIA_PREFIX = 'biblioteca/carga-';
const FIXTURE_CONTACT_PREFIX = 'load-message-';
const HOT_ARTICLE_SLUG = 'noticia-carga-0001';

function indexLabel(index: number): string {
    return String(index + 1).padStart(4, '0');
}

function sampleText(prefix: string, minimumBytes: number): string {
    const paragraph =
        '\n\nA equipe sintética de acolhimento organiza atividades de formação, orientação e ' +
        'participação comunitária. Este conteúdo foi gerado exclusivamente para medir o ' +
        'desempenho da aplicação em um ambiente descartável e não descreve pessoas reais.';
    let text = prefix;
    while (Buffer.byteLength(text, 'utf8') < minimumBytes) text += paragraph;
    return text;
}

async function seed(prisma: PrismaClient, crypto: CryptoServices): Promise<void> {
    // Esta verificação é repetida sob lock na transação, antes da primeira escrita.
    if ((await prisma.user.count()) > 0) {
        throw new Error('A base de carga não está vazia.');
    }
    const password = process.env.LOAD_ADMIN_PASSWORD ?? '';
    const token = process.env.LOAD_SESSION_TOKEN ?? '';
    const tokens: unknown = JSON.parse(process.env.LOAD_SESSION_TOKENS ?? '[]');
    if (
        password.length < 16 ||
        password.length > 128 ||
        !/^[A-Za-z0-9_-]{43}$/.test(token) ||
        Buffer.from(token, 'base64url').toString('base64url') !== token ||
        !Array.isArray(tokens) ||
        tokens.length !== 3 ||
        new Set(tokens).size !== 3 ||
        tokens[0] !== token ||
        tokens.some((value) => typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) ||
        process.env.GOOGLE_OAUTH_ALLOWED_DOMAIN !== 'example.test'
    ) {
        throw new Error('Credenciais sintéticas ausentes ou inválidas.');
    }

    const passwordHash = await crypto.hashPassword(password);
    const now = new Date();
    const adminId = 'load-user-admin';
    const roleId = 'load-role-admin';
    const content = sampleText(
        '## Acolhimento e participação\n\n### Encontro comunitário\n\n' +
            '- Formação da equipe\n- Orientação e acolhimento\n- Integração comunitária\n\n' +
            '> Registro inteiramente sintético para teste de carga.',
        4096,
    );
    const messageBody = sampleText('Mensagem sintética sobre acolhimento.', 1024);

    const regionalDefinitions = [
        { region: 'NORTE', uf: 'PA' },
        { region: 'NORDESTE', uf: 'PE' },
        { region: 'CENTRO_OESTE', uf: 'GO' },
        { region: 'SUDESTE', uf: 'SP' },
        { region: 'SUL', uf: 'PR' },
    ] as const;
    const regionals: Prisma.RegionalCreateManyInput[] = regionalDefinitions.map((entry, index) => ({
        id: `load-regional-${indexLabel(index)}`,
        slug: `regional-carga-${indexLabel(index)}`,
        name: `Regional sintética ${indexLabel(index)}`,
        description: 'Unidade fictícia usada somente em testes de carga.',
        ...entry,
        focus: ['Acolhimento', 'Formação'],
        active: true,
        order: index,
    }));
    const categories: Prisma.CategoryCreateManyInput[] = Array.from({ length: 8 }, (_, index) => ({
        id: `load-category-${indexLabel(index)}`,
        slug: `categoria-carga-${indexLabel(index)}`,
        name: `Categoria sintética ${indexLabel(index)}`,
        order: index,
    }));
    const tags: Prisma.TagCreateManyInput[] = Array.from({ length: 20 }, (_, index) => ({
        id: `load-tag-${indexLabel(index)}`,
        slug: `tema-carga-${indexLabel(index)}`,
        name: `Tema sintético ${indexLabel(index)}`,
    }));
    const media: Prisma.MediaCreateManyInput[] = Array.from({ length: 250 }, (_, index) => {
        const label = indexLabel(index);
        const storageKey = `${FIXTURE_MEDIA_PREFIX}${label}.png`;
        return {
            id: `load-media-${label}`,
            filename: `carga-${label}.png`,
            originalName: `carga-${label}.png`,
            mimeType: 'image/png',
            size: 65536,
            kind: 'IMAGEM',
            url: `/api/arquivos/${storageKey}`,
            storageKey,
            uploadedById: adminId,
            createdAt: new Date(now.getTime() - index * 60_000),
        };
    });
    const posts: Prisma.PostCreateManyInput[] = Array.from({ length: 500 }, (_, index) => {
        const label = indexLabel(index);
        return {
            id: `load-post-${label}`,
            slug: `noticia-carga-${label}`,
            title: `Notícia de carga ${label}: acolhimento e participação`,
            excerpt: `Relato sintético ${label} sobre acolhimento, formação e integração comunitária.`,
            content,
            categoryId: categories[index % categories.length].id!,
            authorId: adminId,
            authorName: 'Equipe sintética de carga',
            status: index < 350 ? 'PUBLICADO' : index < 450 ? 'RASCUNHO' : 'AGENDADO',
            publishedAt:
                index < 350
                    ? new Date(now.getTime() - (index + 1) * DAY_MS)
                    : index < 450
                      ? null
                      : new Date(now.getTime() + (index - 449) * DAY_MS),
            highlight: index === 0,
            views: 0,
            // As últimas cinquenta mídias ficam privadas para testar autorização sob carga.
            ...(index < 200 ? { coverMediaId: media[index].id, coverUrl: media[index].url } : {}),
            createdAt: new Date(now.getTime() - (index + 2) * DAY_MS),
            updatedAt: new Date(now.getTime() - index * 60_000),
        };
    });
    const postTags: Prisma.PostTagCreateManyInput[] = posts.flatMap((post, index) => [
        { postId: post.id!, tagId: tags[index % tags.length].id! },
        { postId: post.id!, tagId: tags[(index + 7) % tags.length].id! },
    ]);
    const atendimentoStatuses = [
        'ABERTO',
        'EM_ACOMPANHAMENTO',
        'ENCAMINHADO',
        'ENCERRADO',
    ] as const;
    const ageGroups = ['JOVEM', 'ADULTO', 'IDOSO', 'NAO_INFORMADO'] as const;
    const needs = [
        'ACOLHIDA',
        'DOCUMENTACAO',
        'TRABALHO',
        'LINGUA_PORTUGUESA',
        'EDUCACAO',
    ] as const;
    const atendimentos: Prisma.AtendimentoCreateManyInput[] = Array.from(
        { length: 300 },
        (_, index) => ({
            id: `load-atendimento-${indexLabel(index)}`,
            codigo: `CARGA-${indexLabel(index)}`,
            regionalId: regionals[index % regionals.length].id!,
            nomeEncrypted: crypto.encryptSensitive(`Pessoa fictícia de carga ${indexLabel(index)}`),
            contatoEncrypted: crypto.encryptSensitive(`pessoa-${indexLabel(index)}@example.test`),
            faixaEtaria: ageGroups[index % ageGroups.length],
            genero: 'NAO_INFORMADO',
            idiomas: ['Português', index % 2 === 0 ? 'Espanhol' : 'Francês'],
            necessidades: [needs[index % needs.length]],
            observacoes: crypto.encryptSensitive('Ficha sintética sem dados de pessoas reais.'),
            status: atendimentoStatuses[index % atendimentoStatuses.length],
            abertoPorId: adminId,
            abertoEm: new Date(now.getTime() - (index + 1) * DAY_MS),
            encerradoEm:
                index % atendimentoStatuses.length === 3 ? new Date(now.getTime() - 60_000) : null,
            retencaoAte: new Date(now.getTime() + (365 + index) * DAY_MS),
        }),
    );
    const contactStatuses = ['NOVA', 'EM_ATENDIMENTO', 'RESPONDIDA', 'ARQUIVADA'] as const;
    const contacts: Prisma.ContactMessageCreateManyInput[] = Array.from(
        { length: 1000 },
        (_, index) => ({
            id: `${FIXTURE_CONTACT_PREFIX}${indexLabel(index)}`,
            name: crypto.encryptSensitive(`Contato sintético ${indexLabel(index)}`)!,
            email: crypto.encryptSensitive(`contato-${indexLabel(index)}@example.test`)!,
            city: crypto.encryptSensitive(`Cidade fictícia ${index % 5}`),
            subject: 'Acolhimento — mensagem de carga',
            message: crypto.encryptSensitive(`${messageBody}\n\nRegistro ${indexLabel(index)}.`)!,
            status: contactStatuses[index % contactStatuses.length],
            assignedToId: index % 2 === 0 ? adminId : null,
            respondedAt:
                index % contactStatuses.length === 2 ? new Date(now.getTime() - 60_000) : null,
            encryptedAt: now,
            createdAt: new Date(now.getTime() - index * 60_000),
            updatedAt: new Date(now.getTime() - index * 60_000),
        }),
    );

    await prisma.$transaction(
        async (tx) => {
            await tx.$executeRaw`LOCK TABLE "User" IN EXCLUSIVE MODE`;
            if ((await tx.user.count()) !== 0) throw new Error('A base de carga não está vazia.');
            await tx.permission.createMany({ data: PERMISSIONS });
            await tx.role.create({
                data: {
                    id: roleId,
                    key: 'admin',
                    name: 'Administrador sintético de carga',
                    description: 'Perfil exclusivo do ambiente descartável de teste.',
                    system: true,
                    permissions: {
                        create: PERMISSIONS.map(({ key }) => ({ permissionKey: key })),
                    },
                },
            });
            await tx.user.create({
                data: {
                    id: adminId,
                    name: 'Administrador de carga',
                    email: 'admin@example.test',
                    initials: 'AC',
                    roleId,
                    status: 'ATIVO',
                    passwordHash,
                    googleSub: 'load-google-admin-0',
                },
            });
            // Três identidades/sessões distintas no cenário simultâneo editorial.
            await tx.user.createMany({
                data: [1, 2].map((index) => ({
                    id: `${adminId}-${index}`,
                    name: `Editor sintético ${index}`,
                    email: `editor-${index}@example.test`,
                    initials: `E${index}`,
                    roleId,
                    status: 'ATIVO' as const,
                    googleSub: `load-google-admin-${index}`,
                })),
            });
            await tx.session.createMany({
                data: Array.from({ length: 30 }, (_, index) => ({
                    tokenHash: crypto.hashToken(
                        index < 3 ? tokens[index] : crypto.generateToken(32),
                    ),
                    userId: index > 0 && index < 3 ? `${adminId}-${index}` : adminId,
                    authMethod: 'GOOGLE_WORKSPACE',
                    googleSub: `load-google-admin-${index < 3 ? index : 0}`,
                    workspaceDomain: 'example.test',
                    lastSeenAt: now,
                    expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
                })),
            });
            await tx.regional.createMany({ data: regionals });
            await tx.category.createMany({ data: categories });
            await tx.tag.createMany({ data: tags });
            await tx.media.createMany({ data: media });
            await tx.post.createMany({ data: posts });
            await tx.postTag.createMany({ data: postTags });
            await tx.atendimento.createMany({ data: atendimentos });
            await tx.contactMessage.createMany({ data: contacts });
            await tx.agendaEvent.createMany({
                data: Array.from({ length: 30 }, (_, index) => ({
                    id: `load-agenda-${indexLabel(index)}`,
                    title: `Encontro de carga ${indexLabel(index)}`,
                    description: 'Evento sintético de acolhimento e formação.',
                    startsAt: new Date(now.getTime() + (index + 1) * DAY_MS),
                    endsAt: new Date(now.getTime() + (index + 1) * DAY_MS + 2 * 60 * 60 * 1000),
                    published: true,
                    source: 'MANUAL',
                })),
            });
            await tx.auditLog.createMany({
                data: Array.from({ length: 50 }, (_, index) => ({
                    id: `load-audit-${indexLabel(index)}`,
                    userId: adminId,
                    actorLabel: 'Equipe sintética',
                    action: 'Preparação do ambiente de carga',
                    target: `Registro sintético ${indexLabel(index)}`,
                    createdAt: new Date(now.getTime() - index * 60_000),
                })),
            });
        },
        { timeout: 120_000, maxWait: 10_000 },
    );
}

async function inspect(prisma: PrismaClient) {
    const [
        users,
        posts,
        publishedPosts,
        draftPosts,
        scheduledPosts,
        categories,
        tags,
        regionals,
        atendimentos,
        agendaEvents,
        auditLogs,
        totalMedia,
        fixtureMedia,
        totalContacts,
        fixtureContacts,
        contactStatuses,
        sessions,
        activeSessions,
        loginAttempts,
        successfulLogins,
        rateLimitBuckets,
        postViews,
        hotArticle,
        database,
        tableStatistics,
        connections,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.post.count(),
        prisma.post.count({ where: { status: 'PUBLICADO' } }),
        prisma.post.count({ where: { status: 'RASCUNHO' } }),
        prisma.post.count({ where: { status: 'AGENDADO' } }),
        prisma.category.count(),
        prisma.tag.count(),
        prisma.regional.count(),
        prisma.atendimento.count(),
        prisma.agendaEvent.count(),
        prisma.auditLog.count(),
        prisma.media.count(),
        prisma.media.count({ where: { storageKey: { startsWith: FIXTURE_MEDIA_PREFIX } } }),
        prisma.contactMessage.count(),
        prisma.contactMessage.count({ where: { id: { startsWith: FIXTURE_CONTACT_PREFIX } } }),
        prisma.contactMessage.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.session.count(),
        prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
        prisma.loginAttempt.count(),
        prisma.loginAttempt.count({ where: { success: true } }),
        prisma.rateLimitBucket.count(),
        prisma.post.aggregate({ _sum: { views: true } }),
        prisma.post.findUnique({ where: { slug: HOT_ARTICLE_SLUG }, select: { views: true } }),
        prisma.$queryRaw<Array<Record<string, number | null>>>`
            SELECT numbackends, xact_commit::float8, xact_rollback::float8,
                   blks_read::float8, blks_hit::float8, tup_returned::float8,
                   tup_fetched::float8, tup_inserted::float8, tup_updated::float8,
                   tup_deleted::float8, conflicts::float8, temp_files::float8,
                   temp_bytes::float8, deadlocks::float8,
                   blk_read_time, blk_write_time
            FROM pg_stat_database WHERE datname = current_database()
        `,
        prisma.$queryRaw<Array<Record<string, number | null>>>`
            SELECT COALESCE(SUM(seq_scan), 0)::float8 AS sequential_scans,
                   COALESCE(SUM(seq_tup_read), 0)::float8 AS sequential_rows,
                   COALESCE(SUM(idx_scan), 0)::float8 AS index_scans,
                   COALESCE(SUM(n_live_tup), 0)::float8 AS live_rows,
                   COALESCE(SUM(n_dead_tup), 0)::float8 AS dead_rows
            FROM pg_stat_user_tables
        `,
        prisma.$queryRaw<Array<Record<string, number | null>>>`
            SELECT COUNT(*)::float8 AS total,
                   COUNT(*) FILTER (WHERE state = 'active')::float8 AS active,
                   COUNT(*) FILTER (WHERE state = 'idle')::float8 AS idle,
                   COUNT(*) FILTER (WHERE wait_event_type = 'Lock')::float8 AS waiting_locks,
                   current_setting('max_connections')::int AS maximum
            FROM pg_stat_activity WHERE datname = current_database()
        `,
    ]);

    return {
        counts: {
            users,
            posts,
            publishedPosts,
            draftPosts,
            scheduledPosts,
            categories,
            tags,
            regionals,
            atendimentos,
            agendaEvents,
            auditLogs,
            media: totalMedia,
            contacts: totalContacts,
        },
        postViews: { total: postViews._sum.views ?? 0, hotArticle: hotArticle?.views ?? null },
        media: { fixtures: fixtureMedia, created: totalMedia - fixtureMedia },
        contacts: {
            fixtures: fixtureContacts,
            captured: totalContacts - fixtureContacts,
            statuses: Object.fromEntries(
                contactStatuses.map((row) => [row.status, row._count._all]),
            ),
        },
        sessions: { total: sessions, active: activeSessions },
        loginAttempts: { total: loginAttempts, successful: successfulLogins },
        rateLimitBuckets,
        database: {
            counters: database[0] ?? {},
            tables: tableStatistics[0] ?? {},
            connections: connections[0] ?? {},
        },
    };
}

let stage = 'guard';

async function main() {
    // Não há dotenv aqui: só o executor isolado pode fornecer estas variáveis.
    assertIsolatedLoadDatabase();
    const mode = process.argv[2];
    if (!['seed', 'inspect'].includes(mode) || process.argv.length !== 3) {
        throw new Error('Uso: load-fixtures.ts seed|inspect');
    }
    stage = 'import';
    const { prisma } = await import('../lib/server/db');
    try {
        stage = mode;
        if (mode === 'seed') {
            const crypto = await import('../lib/server/crypto');
            await seed(prisma, crypto);
        }
        stage = 'inspect';
        process.stdout.write(`${JSON.stringify({ ok: true, mode, ...(await inspect(prisma)) })}\n`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(() => {
    // Não imprimir objetos Prisma, URLs de conexão, senhas, tokens ou textos cifrados.
    process.stderr.write(`${JSON.stringify({ ok: false, stage, error: 'load_fixture_failed' })}\n`);
    process.exitCode = 1;
});
