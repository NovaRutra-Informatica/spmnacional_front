'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Regiao } from '@/lib/generated/prisma/enums';
import {
    actionError,
    actionOk,
    formBoolean,
    formList,
    formNumber,
    formString,
    runAction,
    zodErrors,
    type ActionState,
} from '@/lib/server/actions';
import { recordAudit } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';
import { UFS } from './ufs';

/** Regionais são estrutura do sistema: só quem administra configurações mexe. */
const PERMISSAO = 'config';

/**
 * Além do painel e do mapa público, a home mostra o número de UFs atendidas —
 * ela também precisa ser invalidada.
 */
function revalidar(): void {
    revalidatePath('/admin/regionais');
    revalidatePath('/onde-estamos');
    revalidatePath('/');
}

const schema = z.object({
    slug: z
        .string()
        .min(3, 'Informe um identificador com pelo menos 3 caracteres.')
        .regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífen.'),
    uf: z
        .string()
        .refine(
            (valor) => (UFS as readonly string[]).includes(valor),
            'Informe uma UF válida (ex.: SP).',
        ),
    city: z.string().max(120, 'Use no máximo 120 caracteres na cidade.'),
    name: z.string().min(3, 'Informe o nome da equipe regional.'),
    region: z.enum(Regiao, 'Escolha uma região válida.'),
    description: z.string().min(20, 'Descreva a regional em pelo menos 20 caracteres.'),
    address: z.string().max(240, 'Use no máximo 240 caracteres no endereço.'),
    phone: z.string().max(40, 'Use no máximo 40 caracteres no telefone.'),
    email: z
        .string()
        .refine(
            (valor) => !valor || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor),
            'Informe um e-mail válido.',
        ),
    order: z
        .number('A ordem precisa ser um número.')
        .int('A ordem precisa ser um número inteiro.')
        .min(0, 'A ordem não pode ser negativa.')
        .max(999, 'A ordem máxima é 999.'),
});

/** "SP — São Paulo" → "sp-sao-paulo". */
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

export async function salvarRegional(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const id = formString(formData, 'id');
        const slugInformado = formString(formData, 'slug');
        const nome = formString(formData, 'name');

        const parsed = schema.safeParse({
            // Sem slug informado, deduz do nome — o campo é o endereço da regional no site.
            slug: slugify(slugInformado || nome),
            uf: formString(formData, 'uf').toUpperCase(),
            city: formString(formData, 'city'),
            name: nome,
            region: formString(formData, 'region'),
            description: formString(formData, 'description'),
            address: formString(formData, 'address'),
            phone: formString(formData, 'phone'),
            email: formString(formData, 'email').toLowerCase(),
            order: formNumber(formData, 'order') ?? 0,
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const dados = parsed.data;

        const duplicado = await prisma.regional.findFirst({
            where: { slug: dados.slug, ...(id ? { id: { not: id } } : {}) },
            select: { id: true },
        });

        if (duplicado) {
            return actionError('Já existe uma regional com este identificador.', {
                slug: 'Este identificador já está em uso.',
            });
        }

        const focus = formList(formData, 'focus').slice(0, 12);

        const comum = {
            ...dados,
            // Campos opcionais no banco: string vazia viraria conteúdo em branco no site.
            city: dados.city || null,
            address: dados.address || null,
            phone: dados.phone || null,
            email: dados.email || null,
            focus,
            active: formBoolean(formData, 'active'),
        };

        if (id) {
            const atual = await prisma.regional.findUnique({ where: { id }, select: { id: true } });

            if (!atual) {
                return actionError('Regional não encontrada. Atualize a página e tente de novo.');
            }

            const salva = await prisma.regional.update({ where: { id }, data: comum });

            await recordAudit({
                action: 'Regional atualizada',
                target: `${salva.uf} — ${salva.name}`,
                userId: user.id,
                actorLabel: user.email,
                metadata: { slug: salva.slug, active: salva.active },
            });

            revalidar();
            return actionOk('Regional atualizada.', { id: salva.id });
        }

        const criada = await prisma.regional.create({ data: comum });

        await recordAudit({
            action: 'Regional criada',
            target: `${criada.uf} — ${criada.name}`,
            userId: user.id,
            actorLabel: user.email,
            metadata: { slug: criada.slug, active: criada.active },
        });

        revalidar();
        return actionOk('Regional criada.', { id: criada.id });
    });
}

export async function alternarAtivaRegional(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const id = formString(formData, 'id');
        const atual = await prisma.regional.findUnique({
            where: { id },
            select: { uf: true, name: true, active: true },
        });

        if (!atual) {
            return actionError('Regional não encontrada. Atualize a página e tente de novo.');
        }

        const active = !atual.active;
        await prisma.regional.update({ where: { id }, data: { active } });

        await recordAudit({
            action: active ? 'Regional reativada' : 'Regional desativada',
            target: `${atual.uf} — ${atual.name}`,
            userId: user.id,
            actorLabel: user.email,
        });

        revalidar();
        return actionOk(active ? 'Regional reativada e visível no site.' : 'Regional desativada.', {
            id,
        });
    });
}

export async function excluirRegional(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const id = formString(formData, 'id');
        const atual = await prisma.regional.findUnique({
            where: { id },
            select: { uf: true, name: true },
        });

        if (!atual) {
            return actionError('Regional não encontrada. Atualize a página e tente de novo.');
        }

        // Apagar a regional levaria junto o histórico de quem atende e das fichas
        // vinculadas: melhor desativar do que perder o vínculo.
        const [usuarios, atendimentos] = await Promise.all([
            prisma.user.count({ where: { regionalId: id } }),
            prisma.atendimento.count({ where: { regionalId: id } }),
        ]);

        if (usuarios || atendimentos) {
            const partes: string[] = [];
            if (usuarios) partes.push(`${usuarios} usuário(s)`);
            if (atendimentos) partes.push(`${atendimentos} atendimento(s)`);

            return actionError(
                `Não é possível excluir “${atual.name}”: há ${partes.join(' e ')} vinculado(s) a ela. Desative a regional ou transfira os vínculos antes de excluir.`,
            );
        }

        await prisma.regional.delete({ where: { id } });

        await recordAudit({
            action: 'Regional excluída',
            target: `${atual.uf} — ${atual.name}`,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
        });

        revalidar();
        return actionOk('Regional excluída.');
    });
}
