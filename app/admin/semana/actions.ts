'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { recordAudit } from '@/lib/server/audit';
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

/**
 * Semana do Migrante — edições, materiais e programação.
 *
 * O `slug` acompanha o ano (é assim que o site público monta a URL da edição),
 * por isso não é um campo do formulário.
 */

const linkSchema = z
    .string()
    .refine(
        (value) => !value || value.startsWith('/') || /^https?:\/\//i.test(value),
        'Informe um caminho começando com "/" ou um endereço http(s).',
    );

const edicaoSchema = z.object({
    ano: z
        .number('Informe o ano da edição.')
        .int('Informe um ano válido.')
        .min(1985, 'O SPM foi fundado em 1985.')
        .max(2100, 'Informe um ano válido.'),
    edicao: z.string().min(3, 'Informe a edição, por exemplo "41ª Semana do Migrante".'),
    tema: z.string().min(3, 'Informe o tema do ano.'),
    lema: z.string().min(3, 'Informe o lema do ano.'),
    periodo: z.string().min(3, 'Informe o período, por exemplo "14 a 21 de junho de 2026".'),
    coverUrl: linkSchema,
    resumo: z.string().min(20, 'O texto de abertura precisa de pelo menos 20 caracteres.'),
    citacao: z.string().max(500, 'A citação deve ter no máximo 500 caracteres.'),
});

function revalidarSemana(ano: number): void {
    revalidatePath('/admin/semana');
    revalidatePath(`/admin/semana/${ano}`);
    revalidatePath('/semana-do-migrante');
    // A rota pública por edição é `/semana-do-migrante/<ano>`; o formato antigo
    // (`material-<ano>`) sobrou apenas como redirecionamento em next.config.ts.
    revalidatePath(`/semana-do-migrante/${ano}`);
    revalidatePath('/');
}

/** Uma linha do textarea vira um item do array de objetivos. */
function parseLinhas(value: string): string[] {
    return value
        .split('\n')
        .map((linha) => linha.trim())
        .filter(Boolean);
}

function lerEdicao(formData: FormData) {
    return {
        ano: formNumber(formData, 'ano'),
        edicao: formString(formData, 'edicao'),
        tema: formString(formData, 'tema'),
        lema: formString(formData, 'lema'),
        periodo: formString(formData, 'periodo'),
        coverUrl: formString(formData, 'coverUrl'),
        resumo: formString(formData, 'resumo'),
        citacao: formString(formData, 'citacao'),
    };
}

export async function criarEdicao(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction('noticias', async (user) => {
        const parsed = edicaoSchema.safeParse(lerEdicao(formData));

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const dados = parsed.data;

        const existente = await prisma.semanaEdicao.findUnique({
            where: { ano: dados.ano },
            select: { id: true },
        });

        if (existente) {
            return actionError('Verifique os campos destacados.', {
                ano: 'Já existe uma edição cadastrada para este ano.',
            });
        }

        const saved = await prisma.semanaEdicao.create({
            data: {
                ano: dados.ano,
                slug: String(dados.ano),
                edicao: dados.edicao,
                tema: dados.tema,
                lema: dados.lema,
                periodo: dados.periodo,
                startsOn: formDate(formData, 'startsOn'),
                endsOn: formDate(formData, 'endsOn'),
                coverUrl: dados.coverUrl || null,
                resumo: dados.resumo,
                citacao: dados.citacao || null,
                objetivos: parseLinhas(formString(formData, 'objetivos')),
                published: formBoolean(formData, 'published'),
            },
        });

        await recordAudit({
            action: 'Edição da Semana do Migrante criada',
            target: `${saved.ano} — ${saved.tema}`,
            userId: user.id,
            actorLabel: user.email,
            metadata: { edicaoId: saved.id, ano: saved.ano },
        });

        revalidarSemana(saved.ano);
        return actionOk('Edição criada.', { id: saved.id, ano: saved.ano });
    });
}

export async function atualizarEdicao(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction('noticias', async (user) => {
        const id = formString(formData, 'id');
        if (!id) {
            return actionError('Edição não identificada.');
        }

        const parsed = edicaoSchema.safeParse(lerEdicao(formData));
        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const dados = parsed.data;

        const atual = await prisma.semanaEdicao.findUnique({
            where: { id },
            select: { id: true, ano: true },
        });

        if (!atual) {
            return actionError('Edição não encontrada.');
        }

        // Mudar o ano muda a URL pública, então o slug precisa acompanhar.
        if (dados.ano !== atual.ano) {
            const conflito = await prisma.semanaEdicao.findUnique({
                where: { ano: dados.ano },
                select: { id: true },
            });

            if (conflito) {
                return actionError('Verifique os campos destacados.', {
                    ano: 'Já existe uma edição cadastrada para este ano.',
                });
            }
        }

        const saved = await prisma.semanaEdicao.update({
            where: { id },
            data: {
                ano: dados.ano,
                slug: String(dados.ano),
                edicao: dados.edicao,
                tema: dados.tema,
                lema: dados.lema,
                periodo: dados.periodo,
                startsOn: formDate(formData, 'startsOn'),
                endsOn: formDate(formData, 'endsOn'),
                coverUrl: dados.coverUrl || null,
                resumo: dados.resumo,
                citacao: dados.citacao || null,
                objetivos: parseLinhas(formString(formData, 'objetivos')),
                published: formBoolean(formData, 'published'),
            },
        });

        await recordAudit({
            action: 'Edição da Semana do Migrante alterada',
            target: `${saved.ano} — ${saved.tema}`,
            userId: user.id,
            actorLabel: user.email,
            metadata: { edicaoId: saved.id, publicada: saved.published },
        });

        revalidarSemana(atual.ano);
        revalidarSemana(saved.ano);
        return actionOk('Edição salva.', { id: saved.id, ano: saved.ano });
    });
}

export async function excluirEdicao(formData: FormData): Promise<void> {
    await runAction('noticias', async (user) => {
        const id = formString(formData, 'id');
        if (!id) {
            return actionError('Edição não identificada.');
        }

        const atual = await prisma.semanaEdicao.findUnique({
            where: { id },
            select: { ano: true, tema: true },
        });

        if (!atual) {
            return actionError('Edição não encontrada.');
        }

        // Materiais e programação caem junto por cascade — ver schema.prisma.
        await prisma.semanaEdicao.delete({ where: { id } });

        await recordAudit({
            action: 'Edição da Semana do Migrante excluída',
            target: `${atual.ano} — ${atual.tema}`,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
        });

        revalidarSemana(atual.ano);
        return actionOk('Edição excluída.');
    });
}

// ---------------------------------------------------------
// Materiais
// ---------------------------------------------------------

const materialSchema = z.object({
    icon: z.string().min(2, 'Informe o ícone, por exemplo "fa-book-open".'),
    title: z.string().min(3, 'Informe o título do material.'),
    meta: z.string().min(2, 'Descreva o formato, por exemplo "PDF · 1,2 MB".'),
    fileUrl: linkSchema,
});

export async function salvarMaterial(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction('noticias', async (user) => {
        const edicaoId = formString(formData, 'edicaoId');

        const edicao = await prisma.semanaEdicao.findUnique({
            where: { id: edicaoId },
            select: { id: true, ano: true },
        });

        if (!edicao) {
            return actionError('Edição não encontrada.');
        }

        const parsed = materialSchema.safeParse({
            icon: formString(formData, 'icon'),
            title: formString(formData, 'title'),
            meta: formString(formData, 'meta'),
            fileUrl: formString(formData, 'fileUrl'),
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const mediaId = formString(formData, 'mediaId');
        const order = formNumber(formData, 'order') ?? 0;
        const id = formString(formData, 'id');

        // Sem esta conferência, um id inexistente estouraria a chave estrangeira
        // e o erro cru do banco apareceria para quem está preenchendo o formulário.
        if (mediaId) {
            const media = await prisma.media.findUnique({
                where: { id: mediaId },
                select: { id: true },
            });

            if (!media) {
                return actionError('Verifique os campos destacados.', {
                    mediaId: 'Arquivo não encontrado na biblioteca de mídia.',
                });
            }
        }

        const data = {
            icon: parsed.data.icon,
            title: parsed.data.title,
            meta: parsed.data.meta,
            fileUrl: parsed.data.fileUrl || null,
            mediaId: mediaId || null,
            order,
        };

        const saved = id
            ? await prisma.semanaMaterial.update({ where: { id }, data })
            : await prisma.semanaMaterial.create({ data: { ...data, edicaoId: edicao.id } });

        await recordAudit({
            action: id ? 'Material da Semana alterado' : 'Material da Semana adicionado',
            target: `${edicao.ano} — ${parsed.data.title}`,
            userId: user.id,
            actorLabel: user.email,
            metadata: { edicaoId: edicao.id, materialId: saved.id },
        });

        revalidarSemana(edicao.ano);
        // O id devolvido serve para o formulário se limpar depois de adicionar.
        return actionOk(id ? 'Material atualizado.' : 'Material adicionado.', { id: saved.id });
    });
}

export async function excluirMaterial(formData: FormData): Promise<void> {
    await runAction('noticias', async (user) => {
        const id = formString(formData, 'id');

        const material = await prisma.semanaMaterial.findUnique({
            where: { id },
            select: { title: true, edicao: { select: { ano: true } } },
        });

        if (!material) {
            return actionError('Material não encontrado.');
        }

        await prisma.semanaMaterial.delete({ where: { id } });

        await recordAudit({
            action: 'Material da Semana removido',
            target: `${material.edicao.ano} — ${material.title}`,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
        });

        revalidarSemana(material.edicao.ano);
        return actionOk('Material removido.');
    });
}

// ---------------------------------------------------------
// Programação
// ---------------------------------------------------------

const programaSchema = z.object({
    dia: z.string().min(2, 'Informe o dia, por exemplo "Domingo, 14/06".'),
    title: z.string().min(3, 'Informe o título da atividade.'),
    text: z.string().min(5, 'Descreva a atividade em uma frase.'),
});

export async function salvarPrograma(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction('noticias', async (user) => {
        const edicaoId = formString(formData, 'edicaoId');

        const edicao = await prisma.semanaEdicao.findUnique({
            where: { id: edicaoId },
            select: { id: true, ano: true },
        });

        if (!edicao) {
            return actionError('Edição não encontrada.');
        }

        const parsed = programaSchema.safeParse({
            dia: formString(formData, 'dia'),
            title: formString(formData, 'title'),
            text: formString(formData, 'text'),
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const id = formString(formData, 'id');
        const data = { ...parsed.data, order: formNumber(formData, 'order') ?? 0 };

        const saved = id
            ? await prisma.semanaPrograma.update({ where: { id }, data })
            : await prisma.semanaPrograma.create({ data: { ...data, edicaoId: edicao.id } });

        await recordAudit({
            action: id ? 'Programação da Semana alterada' : 'Programação da Semana adicionada',
            target: `${edicao.ano} — ${parsed.data.title}`,
            userId: user.id,
            actorLabel: user.email,
            metadata: { edicaoId: edicao.id, programaId: saved.id },
        });

        revalidarSemana(edicao.ano);
        // O id devolvido serve para o formulário se limpar depois de adicionar.
        return actionOk(id ? 'Atividade atualizada.' : 'Atividade adicionada.', { id: saved.id });
    });
}

export async function excluirPrograma(formData: FormData): Promise<void> {
    await runAction('noticias', async (user) => {
        const id = formString(formData, 'id');

        const programa = await prisma.semanaPrograma.findUnique({
            where: { id },
            select: { title: true, edicao: { select: { ano: true } } },
        });

        if (!programa) {
            return actionError('Atividade não encontrada.');
        }

        await prisma.semanaPrograma.delete({ where: { id } });

        await recordAudit({
            action: 'Programação da Semana removida',
            target: `${programa.edicao.ano} — ${programa.title}`,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
        });

        revalidarSemana(programa.edicao.ano);
        return actionOk('Atividade removida.');
    });
}
