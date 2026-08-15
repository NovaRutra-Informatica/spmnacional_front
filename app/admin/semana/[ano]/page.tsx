import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { toDateInputValue } from '@/lib/labels';
import type { EdicaoDefaults } from '../EdicaoForm';
import PageContent, { type MaterialRow, type MediaOption, type ProgramaRow } from './PageContent';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Edição da Semana | Painel SPM' },
};

interface PageProps {
    params: Promise<{ ano: string }>;
}

export default async function Page({ params }: PageProps) {
    const [, { ano }] = await Promise.all([requirePermission('noticias'), params]);

    const anoNumero = Number.parseInt(ano, 10);
    if (!Number.isFinite(anoNumero)) {
        notFound();
    }

    const edicao = await prisma.semanaEdicao.findUnique({
        where: { ano: anoNumero },
        include: {
            materiais: { orderBy: { order: 'asc' } },
            programacao: { orderBy: { order: 'asc' } },
        },
    });

    if (!edicao) {
        notFound();
    }

    // Materiais podem apontar para um arquivo já enviado à biblioteca de mídia.
    const media = await prisma.media.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, originalName: true, kind: true },
    });

    const defaults: EdicaoDefaults = {
        id: edicao.id,
        ano: String(edicao.ano),
        edicao: edicao.edicao,
        tema: edicao.tema,
        lema: edicao.lema,
        periodo: edicao.periodo,
        startsOn: toDateInputValue(edicao.startsOn),
        endsOn: toDateInputValue(edicao.endsOn),
        coverUrl: edicao.coverUrl ?? '',
        resumo: edicao.resumo,
        citacao: edicao.citacao ?? '',
        objetivos: edicao.objetivos.join('\n'),
        published: edicao.published,
    };

    const materiais: MaterialRow[] = edicao.materiais.map((item) => ({
        id: item.id,
        icon: item.icon,
        title: item.title,
        meta: item.meta,
        fileUrl: item.fileUrl ?? '',
        mediaId: item.mediaId ?? '',
        order: item.order,
    }));

    const programacao: ProgramaRow[] = edicao.programacao.map((item) => ({
        id: item.id,
        dia: item.dia,
        title: item.title,
        text: item.text,
        order: item.order,
    }));

    const mediaOptions: MediaOption[] = media.map((item) => ({
        id: item.id,
        label: `${item.originalName} (${item.kind.toLowerCase()})`,
    }));

    return (
        <PageContent
            edicaoId={edicao.id}
            ano={edicao.ano}
            titulo={`${edicao.ano} · ${edicao.tema}`}
            subtitulo={`${edicao.edicao} — ${edicao.periodo}`}
            defaults={defaults}
            materiais={materiais}
            programacao={programacao}
            mediaOptions={mediaOptions}
        />
    );
}
