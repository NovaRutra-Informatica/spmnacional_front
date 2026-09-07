/**
 * Cria ou atualiza um usuário do painel pela linha de comando.
 *
 * Uso:
 *   npm run user:create -- --email admin --senha "uma-frase-secreta-longa" --nome "Admin"
 *   npm run user:create -- --email maria@spmnacional.org.br --senha "..." --perfil editor
 *
 * Parâmetros:
 *   --email     identificador do login (aceita e-mail ou um apelido simples)
 *   --senha     senha em texto puro; é gravada como hash scrypt
 *   --nome      nome exibido no painel (padrão: o próprio e-mail)
 *   --perfil    chave do perfil: admin | editor | atendente | coordenacao | leitura
 *   --regional  slug da regional (opcional). Ex.: sp-sao-paulo, ce-fortaleza
 *
 * Existindo o usuário, a senha, o perfil e o status são atualizados — serve
 * também para destravar uma conta bloqueada ou redefinir uma senha esquecida.
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client.ts';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
) => Promise<Buffer>;

/** Mesmo formato de `lib/server/crypto.ts`: scrypt$<salt base64>$<hash base64>. */
async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(password.normalize('NFKC'), salt, 64);
    return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

function iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '??';
    const primeira = partes[0]?.[0] ?? '';
    const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
    return (primeira + ultima).toUpperCase();
}

function arg(nome: string): string | undefined {
    const indice = process.argv.indexOf(`--${nome}`);
    return indice >= 0 ? process.argv[indice + 1] : undefined;
}

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
    const email = arg('email')?.trim().toLowerCase();
    const senha = arg('senha');
    const perfilKey = arg('perfil') ?? 'admin';
    const regionalSlug = arg('regional');

    if (!email || !senha) {
        console.error('Faltam parâmetros. Exemplo:');
        console.error(
            '  npm run user:create -- --email admin --senha "uma-frase-secreta-longa" --nome "Admin"',
        );
        process.exit(1);
    }

    if (senha.length < 12 || senha.length > 128) {
        console.error('A senha deve ter entre 12 e 128 caracteres.');
        process.exit(1);
    }

    const nome = arg('nome') ?? email;

    const perfil = await prisma.role.findUnique({ where: { key: perfilKey } });
    if (!perfil) {
        const disponiveis = await prisma.role.findMany({ select: { key: true } });
        console.error(
            `Perfil "${perfilKey}" não existe. Disponíveis: ${disponiveis.map((r) => r.key).join(', ')}`,
        );
        process.exit(1);
    }

    const regional = regionalSlug
        ? await prisma.regional.findUnique({ where: { slug: regionalSlug } })
        : null;

    if (regionalSlug && !regional) {
        console.error(`Regional "${regionalSlug}" não encontrada.`);
        process.exit(1);
    }

    const passwordHash = await hashPassword(senha);

    const usuario = await prisma.user.upsert({
        where: { email },
        update: {
            name: nome,
            passwordHash,
            roleId: perfil.id,
            status: 'ATIVO',
            // Uma senha nova destrava a conta e invalida qualquer convite pendente.
            failedLoginCount: 0,
            lockedUntil: null,
            inviteTokenHash: null,
            inviteExpiresAt: null,
            ...(regional ? { regionalId: regional.id } : {}),
        },
        create: {
            name: nome,
            email,
            initials: iniciais(nome),
            passwordHash,
            roleId: perfil.id,
            regionalId: regional?.id ?? null,
            status: 'ATIVO',
        },
        include: { role: { include: { permissions: true } }, regional: { select: { name: true } } },
    });

    // Trocar a senha encerra as sessões antigas — mesma regra da tela de perfil.
    const encerradas = await prisma.session.updateMany({
        where: { userId: usuario.id, revokedAt: null },
        data: { revokedAt: new Date() },
    });

    console.log('Usuário pronto para uso:');
    console.log(`  login .......: ${usuario.email}`);
    console.log(`  nome ........: ${usuario.name}`);
    console.log(`  perfil ......: ${usuario.role.name}`);
    console.log(
        `  permissões ..: ${usuario.role.permissions.map((p) => p.permissionKey).join(', ') || '(nenhuma)'}`,
    );
    console.log(`  regional ....: ${usuario.regional?.name ?? '—'}`);
    console.log(`  status ......: ${usuario.status}`);
    if (encerradas.count > 0) {
        console.log(`  sessões encerradas: ${encerradas.count}`);
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
