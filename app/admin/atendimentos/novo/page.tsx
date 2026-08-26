import type { Metadata } from 'next';
import { toDateInputValue } from '@/lib/labels';
import { requirePermission } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { RETENCAO_PADRAO_ANOS, escopoRegional, retencaoPadrao } from '../politica';
import PageContent, { type RegionalOption } from './PageContent';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Novo atendimento | Painel SPM' },
};

export default async function Page() {
    const user = await requirePermission('atendimentos');

    const regionais = await prisma.regional.findMany({
        where: escopoRegional(user),
        orderBy: [{ name: 'asc' }],
        select: { id: true, name: true, uf: true },
    });

    const opcoes: RegionalOption[] = regionais.map((regional) => ({
        id: regional.id,
        nome: `${regional.name} (${regional.uf})`,
    }));

    // Quem não é administrador geral recebe só a própria regional na lista, então
    // a primeira opção já é a resposta certa quando a conta não tem vínculo.
    const regionalPadrao = user.regionalId ?? opcoes[0]?.id ?? '';

    return (
        <PageContent
            regionais={opcoes}
            regionalPadrao={regionalPadrao}
            retencaoPadraoInput={toDateInputValue(retencaoPadrao())}
            retencaoPadraoAnos={RETENCAO_PADRAO_ANOS}
            usuario={{ nome: user.name, iniciais: user.initials, perfil: user.role.name }}
        />
    );
}
