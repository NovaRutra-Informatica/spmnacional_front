import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatDateLong, formatDateTimeShort, toDateInputValue } from '@/lib/labels';
import { requirePermission } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';
import { decryptSensitive, maskSensitive } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/db';
import { RETENCAO_MAXIMA_ANOS, escopoAtendimento, retencaoVencida } from '../politica';
import PageContent, { type AtendimentoDetalhe } from './PageContent';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    // O título fica com o rótulo genérico: o código da ficha não precisa
    // aparecer no histórico do navegador nem em captura de tela compartilhada.
    title: { absolute: 'Ficha de atendimento | Painel SPM' },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const user = await requirePermission('atendimentos');

    const registro = await prisma.atendimento.findFirst({
        where: { id, ...escopoAtendimento(user) },
        include: {
            regional: { select: { name: true, uf: true } },
            abertoPor: { select: { name: true } },
            encaminhamentos: { orderBy: [{ encaminhadoEm: 'desc' }] },
        },
    });

    // Fora do escopo e inexistente devolvem a mesma resposta: saber que a ficha
    // existe em outra regional já seria informação demais.
    if (!registro) {
        notFound();
    }

    // Accountability: aqui a leitura é o evento que mais importa registrar,
    // porque é neste ponto que o dado pessoal é decifrado.
    await recordAudit({
        action: 'Ficha de atendimento acessada',
        target: registro.codigo,
        level: 'ALERTA',
        userId: user.id,
        actorLabel: user.email,
        metadata: { regional: registro.regional.name },
    });

    const nome = decryptSensitive(registro.nomeEncrypted);
    const contato = decryptSensitive(registro.contatoEncrypted);

    const detalhe: AtendimentoDetalhe = {
        id: registro.id,
        codigo: registro.codigo,
        regionalNome: `${registro.regional.name} (${registro.regional.uf})`,
        nomeGuardado: Boolean(registro.nomeEncrypted),
        nome,
        nomeMascarado: maskSensitive(nome),
        contatoGuardado: Boolean(registro.contatoEncrypted),
        contato,
        contatoMascarado: maskSensitive(contato),
        faixaEtaria: registro.faixaEtaria,
        genero: registro.genero,
        paisOrigem: registro.paisOrigem,
        idiomas: registro.idiomas,
        chegadaAno: registro.chegadaAno,
        necessidades: registro.necessidades,
        observacoes: registro.observacoes,
        status: registro.status,
        abertoPorNome: registro.abertoPor?.name ?? null,
        abertoEmLabel: formatDateTimeShort(registro.abertoEm),
        encerradoEmLabel: registro.encerradoEm ? formatDateTimeShort(registro.encerradoEm) : null,
        retencaoInput: toDateInputValue(registro.retencaoAte),
        retencaoLabel: formatDateLong(registro.retencaoAte),
        retencaoVencida: retencaoVencida(registro.retencaoAte),
        retencaoMaximaAnos: RETENCAO_MAXIMA_ANOS,
        semDadosPessoais:
            !registro.nomeEncrypted && !registro.contatoEncrypted && !registro.observacoes,
        encaminhamentos: registro.encaminhamentos.map((encaminhamento) => ({
            id: encaminhamento.id,
            orgao: encaminhamento.orgao,
            descricao: encaminhamento.descricao,
            quandoLabel: formatDateTimeShort(encaminhamento.encaminhadoEm),
            registradoPor: encaminhamento.registradoPor,
        })),
    };

    return <PageContent detalhe={detalhe} />;
}
