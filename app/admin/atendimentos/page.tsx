import type { Metadata } from 'next';
import { formatDateTimeShort, formatDateLong } from '@/lib/labels';
import { requirePermission } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import PageContent, { type AtendimentoRow, type RegionalOption } from './PageContent';
import { escopoAtendimento, isAdminGeral, retencaoVencida } from './politica';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Atendimentos | Painel SPM' },
};

/** Teto da listagem: a tela é operacional, não é lugar de baixar a base inteira. */
const LIMITE_LISTAGEM = 300;

export default async function Page() {
    const user = await requirePermission('atendimentos');

    const escopo = escopoAtendimento(user);
    const admin = isAdminGeral(user);
    const agora = new Date();

    const [
        registros,
        total,
        abertos,
        acompanhamento,
        encaminhados,
        vencidos,
        pendentes,
        regionais,
    ] = await Promise.all([
        prisma.atendimento.findMany({
            where: escopo,
            orderBy: [{ abertoEm: 'desc' }],
            take: LIMITE_LISTAGEM,
            // Nenhum campo cifrado é lido aqui — ver comentário em PageContent.
            select: {
                id: true,
                codigo: true,
                status: true,
                faixaEtaria: true,
                necessidades: true,
                abertoEm: true,
                retencaoAte: true,
                regionalId: true,
                regional: { select: { name: true } },
            },
        }),
        prisma.atendimento.count({ where: escopo }),
        prisma.atendimento.count({ where: { ...escopo, status: 'ABERTO' } }),
        prisma.atendimento.count({ where: { ...escopo, status: 'EM_ACOMPANHAMENTO' } }),
        prisma.atendimento.count({ where: { ...escopo, status: 'ENCAMINHADO' } }),
        prisma.atendimento.count({ where: { ...escopo, retencaoAte: { lt: agora } } }),
        // Fichas com prazo vencido que ainda guardam dado pessoal: são as únicas
        // em que o botão "Anonimizar" tem o que apagar. Só o id sai do banco —
        // o texto cifrado continua onde está.
        prisma.atendimento.findMany({
            where: {
                ...escopo,
                retencaoAte: { lt: agora },
                OR: [
                    { nomeEncrypted: { not: null } },
                    { contatoEncrypted: { not: null } },
                    { observacoes: { not: null } },
                ],
            },
            select: { id: true },
        }),
        // O filtro por regional só existe para quem enxerga mais de uma.
        admin
            ? prisma.regional.findMany({
                  where: { active: true },
                  orderBy: [{ name: 'asc' }],
                  select: { id: true, name: true },
              })
            : Promise.resolve<{ id: string; name: string }[]>([]),
    ]);

    const aguardandoAnonimizacao = new Set(pendentes.map((pendente) => pendente.id));

    const rows: AtendimentoRow[] = registros.map((registro) => ({
        id: registro.id,
        codigo: registro.codigo,
        regionalId: registro.regionalId,
        regionalNome: registro.regional.name,
        faixaEtaria: registro.faixaEtaria,
        necessidades: registro.necessidades,
        status: registro.status,
        abertoEmLabel: formatDateTimeShort(registro.abertoEm),
        retencaoLabel: formatDateLong(registro.retencaoAte),
        retencaoVencida: retencaoVencida(registro.retencaoAte, agora),
        podeAnonimizar: aguardandoAnonimizacao.has(registro.id),
    }));

    const opcoesRegionais: RegionalOption[] = regionais.map((regional) => ({
        id: regional.id,
        nome: regional.name,
    }));

    const semRegional = !admin && !user.regionalId;

    return (
        <PageContent
            rows={rows}
            regionais={opcoesRegionais}
            podeFiltrarRegional={admin}
            stats={{ abertos, acompanhamento, encaminhados, vencidos }}
            total={total}
            truncado={total > rows.length}
            escopoLabel={
                admin
                    ? 'você acompanha todas as regionais'
                    : `escopo: ${user.regionalName ?? 'sem regional vinculada'}`
            }
            aviso={
                semRegional
                    ? 'Sua conta não está vinculada a nenhuma regional. Enquanto isso, nenhuma ficha é exibida e não é possível abrir novos atendimentos — peça à coordenação para fazer o vínculo.'
                    : null
            }
        />
    );
}
