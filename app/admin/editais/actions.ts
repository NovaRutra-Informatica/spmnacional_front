'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { EditalStatus } from '@/lib/generated/prisma/enums';
import {
    actionError,
    actionOk,
    formBoolean,
    formDate,
    formNumber,
    formString,
    runAction,
    zodErrors,
    type ActionState,
} from '@/lib/server/actions';
import { recordAudit } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';

/** Toda operação neste módulo exige a mesma permissão. */
const PERMISSAO = 'editais';

/**
 * O painel e a página pública leem a mesma tabela: invalidar só uma delas
 * deixaria o site mostrando um edital que já mudou.
 */
function revalidar(): void {
    revalidatePath('/admin/editais');
    revalidatePath('/publicacoes/editais');
}

const schema = z.object({
    code: z
        .string()
        .min(3, 'Informe o código do edital (ex.: EDITAL 03/2026).')
        .max(80, 'Use no máximo 80 caracteres no código.'),
    title: z.string().min(5, 'Informe um título com pelo menos 5 caracteres.'),
    description: z.string().min(20, 'Descreva o edital em pelo menos 20 caracteres.'),
    status: z.enum(EditalStatus, 'Escolha uma situação válida.'),
    deadlineText: z
        .string()
        .min(5, 'Informe o texto do prazo (ex.: Inscrições até 30 de setembro de 2026).'),
    scope: z.string().min(2, 'Informe a abrangência (ex.: Nacional ou SP · RS).'),
    order: z
        .number('A ordem precisa ser um número.')
        .int('A ordem precisa ser um número inteiro.')
        .min(0, 'A ordem não pode ser negativa.')
        .max(999, 'A ordem máxima é 999.'),
});

/** "Bolsas de formação" → "bolsas-de-formacao". */
function slugify(value: string): string {
    return (
        value
            .normalize('NFD')
            // Remove os acentos já separados pelo NFD (categoria "marca" do Unicode).
            .replace(/\p{M}/gu, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 90)
    );
}

/**
 * Dois editais podem ter títulos parecidos, mas o slug é único no banco:
 * acrescenta sufixo até encontrar um livre em vez de estourar erro do Postgres.
 */
async function slugUnico(base: string, ignorarId?: string): Promise<string> {
    const raiz = base || 'edital';
    let candidato = raiz;
    let sufixo = 2;

    for (;;) {
        const existente = await prisma.edital.findFirst({
            where: { slug: candidato, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
            select: { id: true },
        });

        if (!existente) return candidato;

        candidato = `${raiz}-${sufixo}`;
        sufixo += 1;
    }
}

/** O anexo vem da biblioteca; a URL é copiada para o campo que o site lê. */
async function resolverAnexo(
    mediaId: string | null,
): Promise<{ ok: true; fileMediaId: string | null; fileUrl: string | null } | { ok: false }> {
    if (!mediaId) return { ok: true, fileMediaId: null, fileUrl: null };

    const media = await prisma.media.findUnique({ where: { id: mediaId }, select: { url: true } });
    if (!media) return { ok: false };

    return { ok: true, fileMediaId: mediaId, fileUrl: media.url };
}

export async function salvarEdital(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const id = formString(formData, 'id');

        const parsed = schema.safeParse({
            code: formString(formData, 'code'),
            title: formString(formData, 'title'),
            description: formString(formData, 'description'),
            status: formString(formData, 'status'),
            deadlineText: formString(formData, 'deadlineText'),
            scope: formString(formData, 'scope'),
            order: formNumber(formData, 'order') ?? 0,
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const dados = parsed.data;

        const duplicado = await prisma.edital.findFirst({
            where: { code: dados.code, ...(id ? { id: { not: id } } : {}) },
            select: { id: true },
        });

        if (duplicado) {
            return actionError('Já existe um edital com este código.', {
                code: 'Este código já é usado por outro edital.',
            });
        }

        const anexo = await resolverAnexo(formString(formData, 'fileMediaId') || null);
        if (!anexo.ok) {
            return actionError('O anexo escolhido não existe mais na biblioteca.', {
                fileMediaId: 'Selecione outro arquivo.',
            });
        }

        const comum = {
            ...dados,
            deadlineAt: formDate(formData, 'deadlineAt'),
            published: formBoolean(formData, 'published'),
            fileMediaId: anexo.fileMediaId,
            fileUrl: anexo.fileUrl,
        };

        if (id) {
            const atual = await prisma.edital.findUnique({
                where: { id },
                select: { title: true, slug: true },
            });

            if (!atual) {
                return actionError('Edital não encontrado. Atualize a página e tente de novo.');
            }

            // Slug só muda quando o título muda: link já divulgado continua funcionando.
            const slug =
                atual.title === dados.title
                    ? atual.slug
                    : await slugUnico(slugify(dados.title), id);

            const salvo = await prisma.edital.update({
                where: { id },
                data: { ...comum, slug },
            });

            await recordAudit({
                action: 'Edital atualizado',
                target: `${salvo.code} — ${salvo.title}`,
                userId: user.id,
                actorLabel: user.email,
                metadata: { status: salvo.status, published: salvo.published },
            });

            revalidar();
            return actionOk('Edital atualizado.', { id: salvo.id });
        }

        const criado = await prisma.edital.create({
            data: { ...comum, slug: await slugUnico(slugify(dados.title)) },
        });

        await recordAudit({
            action: 'Edital criado',
            target: `${criado.code} — ${criado.title}`,
            userId: user.id,
            actorLabel: user.email,
            metadata: { status: criado.status, published: criado.published },
        });

        revalidar();
        return actionOk('Edital criado.', { id: criado.id });
    });
}

export async function alternarPublicacaoEdital(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const id = formString(formData, 'id');
        const atual = await prisma.edital.findUnique({
            where: { id },
            select: { code: true, title: true, published: true },
        });

        if (!atual) {
            return actionError('Edital não encontrado. Atualize a página e tente de novo.');
        }

        const published = !atual.published;
        await prisma.edital.update({ where: { id }, data: { published } });

        await recordAudit({
            action: published ? 'Edital publicado' : 'Edital despublicado',
            target: `${atual.code} — ${atual.title}`,
            userId: user.id,
            actorLabel: user.email,
        });

        revalidar();
        return actionOk(published ? 'Edital publicado no site.' : 'Edital retirado do site.', {
            id,
        });
    });
}

export async function excluirEdital(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const id = formString(formData, 'id');
        const atual = await prisma.edital.findUnique({
            where: { id },
            select: { code: true, title: true },
        });

        if (!atual) {
            return actionError('Edital não encontrado. Atualize a página e tente de novo.');
        }

        await prisma.edital.delete({ where: { id } });

        await recordAudit({
            action: 'Edital excluído',
            target: `${atual.code} — ${atual.title}`,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
        });

        revalidar();
        return actionOk('Edital excluído.');
    });
}
