'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
    actionError,
    actionOk,
    formBoolean,
    formNumber,
    formString,
    runAction,
    zodErrors,
    type ActionState,
} from '@/lib/server/actions';
import { recordAudit } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';

/** Testemunho é conteúdo editorial: mesma permissão das notícias. */
const PERMISSAO = 'noticias';

function revalidar(): void {
    revalidatePath('/admin/testemunhos');
    revalidatePath('/publicacoes/testemunhos');
}

const schema = z.object({
    text: z.string().min(30, 'O depoimento precisa de pelo menos 30 caracteres.'),
    personName: z.string().min(2, 'Informe o nome (ou o pseudônimo) de quem falou.'),
    origin: z.string().min(2, 'Informe a origem (ex.: Haitiano, residente em Curitiba).'),
    initials: z
        .string()
        .min(1, 'Informe as iniciais exibidas no avatar.')
        .max(3, 'Use no máximo 3 letras nas iniciais.')
        .regex(/^\p{L}+$/u, 'Use apenas letras nas iniciais.'),
    consentNote: z.string().max(500, 'Resuma o registro do consentimento em até 500 caracteres.'),
    order: z
        .number('A ordem precisa ser um número.')
        .int('A ordem precisa ser um número inteiro.')
        .min(0, 'A ordem não pode ser negativa.')
        .max(999, 'A ordem máxima é 999.'),
});

/** "Rosa M." → "RM"; usado quando a pessoa não informa as iniciais. */
function iniciaisDe(nome: string): string {
    const partes = nome
        .split(/\s+/)
        .map((parte) => parte.replace(/[^\p{L}]/gu, ''))
        .filter(Boolean);

    if (!partes.length) return '';

    const letras = partes.length === 1 ? partes[0]!.slice(0, 2) : partes[0]![0]! + partes[1]![0]!;
    return letras.toUpperCase();
}

export async function salvarTestemunho(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const id = formString(formData, 'id');
        const personName = formString(formData, 'personName');

        const parsed = schema.safeParse({
            text: formString(formData, 'text'),
            personName,
            origin: formString(formData, 'origin'),
            // Sem iniciais informadas, deduz do nome para o avatar do site nunca ficar vazio.
            initials: (formString(formData, 'initials') || iniciaisDe(personName)).toUpperCase(),
            consentNote: formString(formData, 'consentNote'),
            order: formNumber(formData, 'order') ?? 0,
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const dados = parsed.data;
        const consent = formBoolean(formData, 'consent');
        const published = formBoolean(formData, 'published');

        // Política editorial e LGPD: nada de história de vida no ar sem consentimento.
        if (published && !consent) {
            return actionError(
                'Não é possível publicar um testemunho sem consentimento registrado.',
                {
                    consent: 'Marque o consentimento antes de publicar.',
                },
            );
        }

        // Consentimento sem registro de como foi obtido não serve de prova depois.
        if (consent && !dados.consentNote) {
            return actionError('Registre como o consentimento foi obtido.', {
                consentNote: 'Descreva quando e como a pessoa autorizou a publicação.',
            });
        }

        const comum = {
            ...dados,
            consent,
            consentNote: dados.consentNote || null,
            anonymized: formBoolean(formData, 'anonymized'),
            featured: formBoolean(formData, 'featured'),
            published,
        };

        if (id) {
            const atual = await prisma.testemunho.findUnique({
                where: { id },
                select: { id: true },
            });

            if (!atual) {
                return actionError('Testemunho não encontrado. Atualize a página e tente de novo.');
            }

            const salvo = await prisma.testemunho.update({ where: { id }, data: comum });

            await recordAudit({
                action: 'Testemunho atualizado',
                target: `${salvo.personName} — ${salvo.origin}`,
                userId: user.id,
                actorLabel: user.email,
                metadata: { consent: salvo.consent, published: salvo.published },
            });

            revalidar();
            return actionOk('Testemunho atualizado.', { id: salvo.id });
        }

        const criado = await prisma.testemunho.create({ data: comum });

        await recordAudit({
            action: 'Testemunho criado',
            target: `${criado.personName} — ${criado.origin}`,
            userId: user.id,
            actorLabel: user.email,
            metadata: { consent: criado.consent, published: criado.published },
        });

        revalidar();
        return actionOk('Testemunho criado.', { id: criado.id });
    });
}

/** Alterna publicação ou destaque a partir da lista, sem abrir o formulário. */
export async function alternarFlagTestemunho(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const id = formString(formData, 'id');
        const campo = formString(formData, 'campo');

        if (campo !== 'published' && campo !== 'featured') {
            return actionError('Operação inválida.');
        }

        const atual = await prisma.testemunho.findUnique({
            where: { id },
            select: {
                personName: true,
                origin: true,
                consent: true,
                published: true,
                featured: true,
            },
        });

        if (!atual) {
            return actionError('Testemunho não encontrado. Atualize a página e tente de novo.');
        }

        const valor = !atual[campo];

        // O destaque aparece no site tanto quanto a publicação — mesma trava.
        if (valor && !atual.consent) {
            return actionError(
                'Este testemunho ainda não tem consentimento registrado. Abra o formulário e registre antes de exibi-lo.',
            );
        }

        await prisma.testemunho.update({
            where: { id },
            data: campo === 'published' ? { published: valor } : { featured: valor },
        });

        const rotulos =
            campo === 'published'
                ? ['Testemunho despublicado', 'Testemunho publicado']
                : ['Destaque de testemunho removido', 'Testemunho destacado'];
        const acao = valor ? rotulos[1]! : rotulos[0]!;

        await recordAudit({
            action: acao,
            target: `${atual.personName} — ${atual.origin}`,
            userId: user.id,
            actorLabel: user.email,
        });

        revalidar();
        return actionOk(`${acao}.`, { id });
    });
}

export async function excluirTestemunho(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const id = formString(formData, 'id');
        const atual = await prisma.testemunho.findUnique({
            where: { id },
            select: { personName: true, origin: true },
        });

        if (!atual) {
            return actionError('Testemunho não encontrado. Atualize a página e tente de novo.');
        }

        await prisma.testemunho.delete({ where: { id } });

        await recordAudit({
            action: 'Testemunho excluído',
            target: `${atual.personName} — ${atual.origin}`,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
        });

        revalidar();
        return actionOk('Testemunho excluído.');
    });
}
