'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AtendimentoStatus, FaixaEtaria, Genero, Necessidade } from '@/lib/generated/prisma/enums';
import {
    actionError,
    actionOk,
    formBoolean,
    formDate,
    formList,
    formNumber,
    formString,
    runAction,
    zodErrors,
    type ActionState,
} from '@/lib/server/actions';
import type { SessionUser } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';
import { encryptSensitive } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/db';
import { escopoAtendimento, isAdminGeral, validarRetencao } from './politica';

/**
 * Ações do módulo de atendimentos.
 *
 * Três decisões atravessam o arquivo inteiro:
 * - nome e contato nunca entram no banco em claro (`encryptSensitive`);
 * - toda escrita passa pelo escopo regional, não só a leitura — sem isso
 *   bastaria conhecer o id de uma ficha de outra regional para alterá-la;
 * - auditoria em criação, alteração, encaminhamento e anonimização, sem jamais
 *   copiar dado pessoal para dentro do log.
 */

const PERMISSAO = 'atendimentos';

/** Tentativas de gerar um código livre quando duas fichas abrem ao mesmo tempo. */
const MAX_TENTATIVAS_CODIGO = 5;

// ---------------------------------------------------------
// Apoio
// ---------------------------------------------------------

/**
 * Erros do zod já no formato que o formulário consome.
 *
 * `zodErrors` usa o caminho completo do issue (`idiomas.0`, `necessidades.2`),
 * mas na tela o campo é o array inteiro: sem colapsar o índice, o erro de um
 * item ficaria invisível embaixo do input.
 */
function errosDeCampo(error: z.ZodError): Record<string, string> {
    const resultado: Record<string, string> = {};

    for (const [caminho, mensagem] of Object.entries(zodErrors(error))) {
        const campo = caminho.split('.')[0] || caminho;
        if (!resultado[campo]) {
            resultado[campo] = mensagem;
        }
    }

    return resultado;
}

/** Violação de unicidade do Postgres relatada pelo Prisma. */
function isCodigoDuplicado(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002'
    );
}

/**
 * Ficha dentro do escopo de quem está operando.
 * Devolve null tanto para "não existe" quanto para "existe em outra regional":
 * a diferença entre os dois casos já seria informação demais.
 */
async function buscarNoEscopo(user: SessionUser, id: string) {
    if (!id) return null;

    return prisma.atendimento.findFirst({
        where: { id, ...escopoAtendimento(user) },
        select: {
            id: true,
            codigo: true,
            status: true,
            retencaoAte: true,
            encerradoEm: true,
            regional: { select: { name: true } },
        },
    });
}

/**
 * Cifra nome e contato, ou devolve null se a chave não estiver no ambiente.
 *
 * Sem chave a ficha não é criada: guardar identificação em claro seria pior do
 * que não guardar identificação nenhuma.
 */
function cifrarIdentificacao(
    nome: string,
    contato: string,
): { nome: string | null; contato: string | null } | null {
    try {
        return {
            nome: encryptSensitive(nome || null),
            contato: encryptSensitive(contato || null),
        };
    } catch {
        return null;
    }
}

/** Revalida o painel: a ficha nunca aparece no site público. */
function revalidarFicha(id: string): void {
    revalidatePath('/admin/atendimentos');
    revalidatePath(`/admin/atendimentos/${id}`);
    // O total de atendimentos em aberto aparece no painel inicial e no contador
    // do menu lateral, que vive no layout — sem isto os dois ficam defasados.
    revalidatePath('/admin', 'layout');
}

// ---------------------------------------------------------
// Abertura da ficha
// ---------------------------------------------------------

const criarSchema = z.object({
    regionalId: z.string().min(1, 'Selecione a regional responsável pelo atendimento.'),
    nome: z.string().max(160, 'Use no máximo 160 caracteres.'),
    contato: z.string().max(160, 'Use no máximo 160 caracteres.'),
    faixaEtaria: z.enum(FaixaEtaria, 'Selecione uma faixa etária válida.'),
    genero: z.enum(Genero, 'Selecione uma opção válida.'),
    paisOrigem: z.string().max(80, 'Use no máximo 80 caracteres.'),
    idiomas: z
        .array(z.string().max(40, 'Cada idioma deve ter no máximo 40 caracteres.'))
        .max(8, 'Registre no máximo 8 idiomas.'),
    chegadaAno: z
        .number()
        .int('Informe o ano com quatro dígitos.')
        .min(1900, 'Informe um ano a partir de 1900.')
        .refine(
            (ano) => ano <= new Date().getFullYear(),
            'O ano de chegada não pode estar no futuro.',
        )
        .nullable(),
    necessidades: z
        .array(z.enum(Necessidade, 'Necessidade inválida.'))
        .min(1, 'Marque ao menos uma necessidade — é ela que orienta o encaminhamento.'),
    observacoes: z
        .string()
        .max(4000, 'A observação está longa demais (máximo de 4000 caracteres).'),
});

/**
 * Abre uma ficha e devolve o código pseudônimo gerado.
 *
 * O código é `ATD-<ano>-<sequencial>`, contado sobre todas as regionais: ele
 * precisa ser único no país inteiro, já que é ele — e não o nome — que circula
 * entre as equipes.
 */
export async function criarAtendimento(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const parsed = criarSchema.safeParse({
            regionalId: formString(formData, 'regionalId'),
            nome: formString(formData, 'nome'),
            contato: formString(formData, 'contato'),
            faixaEtaria: formString(formData, 'faixaEtaria'),
            genero: formString(formData, 'genero'),
            paisOrigem: formString(formData, 'paisOrigem'),
            idiomas: formList(formData, 'idiomas'),
            chegadaAno: formNumber(formData, 'chegadaAno'),
            necessidades: formData
                .getAll('necessidades')
                .filter((valor): valor is string => typeof valor === 'string'),
            observacoes: formString(formData, 'observacoes'),
        });

        const retencaoAte = formDate(formData, 'retencaoAte');
        const erroRetencao = validarRetencao(retencaoAte, { permitirPassado: false });

        if (!parsed.success || !retencaoAte || erroRetencao) {
            const fieldErrors: Record<string, string> = parsed.success
                ? {}
                : errosDeCampo(parsed.error);
            if (erroRetencao) {
                fieldErrors.retencaoAte = erroRetencao;
            }
            return actionError('Verifique os campos destacados.', fieldErrors);
        }

        const dados = parsed.data;

        if (!isAdminGeral(user)) {
            if (!user.regionalId) {
                return actionError(
                    'Sua conta não está vinculada a uma regional, por isso não é possível abrir fichas. Fale com a coordenação.',
                );
            }
            if (dados.regionalId !== user.regionalId) {
                return actionError('Você só pode registrar atendimentos da sua regional.', {
                    regionalId: 'Selecione a sua regional.',
                });
            }
        }

        const regional = await prisma.regional.findUnique({
            where: { id: dados.regionalId },
            select: { id: true, name: true },
        });

        if (!regional) {
            return actionError('Regional não encontrada.', {
                regionalId: 'Selecione uma regional válida.',
            });
        }

        const cifrado = cifrarIdentificacao(dados.nome, dados.contato);
        if (!cifrado) {
            return actionError(
                'A chave de cifragem não está configurada no servidor. Sem ela a ficha não pode guardar nome nem contato — avise a coordenação técnica antes de continuar.',
            );
        }

        const ano = new Date().getFullYear();
        const registrosNoAno = await prisma.atendimento.count({
            where: {
                abertoEm: {
                    gte: new Date(Date.UTC(ano, 0, 1)),
                    lt: new Date(Date.UTC(ano + 1, 0, 1)),
                },
            },
        });

        const idiomas = dados.idiomas.filter(Boolean);

        let criado: { id: string; codigo: string } | null = null;
        for (let tentativa = 0; tentativa < MAX_TENTATIVAS_CODIGO && !criado; tentativa += 1) {
            const sequencial = String(registrosNoAno + 1 + tentativa).padStart(4, '0');

            try {
                criado = await prisma.atendimento.create({
                    data: {
                        codigo: `ATD-${ano}-${sequencial}`,
                        regionalId: regional.id,
                        nomeEncrypted: cifrado.nome,
                        contatoEncrypted: cifrado.contato,
                        faixaEtaria: dados.faixaEtaria,
                        genero: dados.genero,
                        paisOrigem: dados.paisOrigem || null,
                        idiomas,
                        chegadaAno: dados.chegadaAno,
                        necessidades: dados.necessidades,
                        observacoes: dados.observacoes || null,
                        abertoPorId: user.id,
                        retencaoAte,
                    },
                    select: { id: true, codigo: true },
                });
            } catch (error) {
                // Duas fichas abertas no mesmo instante chegam ao mesmo número:
                // a próxima volta do laço tenta o sequencial seguinte.
                if (!isCodigoDuplicado(error)) throw error;
            }
        }

        if (!criado) {
            return actionError(
                'Não foi possível gerar um código único para esta ficha. Tente novamente em instantes.',
            );
        }

        await recordAudit({
            action: 'Atendimento registrado',
            target: criado.codigo,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
            // Só metadado estatístico: nem o nome nem quais necessidades foram
            // marcadas entram no log de auditoria.
            metadata: {
                regional: regional.name,
                necessidades: dados.necessidades.length,
                identificacaoGuardada: Boolean(cifrado.nome || cifrado.contato),
            },
        });

        revalidarFicha(criado.id);

        return actionOk(`Ficha aberta com o código ${criado.codigo}.`, {
            id: criado.id,
            codigo: criado.codigo,
        });
    });
}

// ---------------------------------------------------------
// Acompanhamento
// ---------------------------------------------------------

const gestaoSchema = z.object({
    id: z.string().min(1, 'Ficha não identificada.'),
    status: z.enum(AtendimentoStatus, 'Selecione um status válido.'),
});

/** Altera status e prazo de retenção da ficha. */
export async function atualizarAtendimento(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const parsed = gestaoSchema.safeParse({
            id: formString(formData, 'id'),
            status: formString(formData, 'status'),
        });

        const retencaoAte = formDate(formData, 'retencaoAte');
        // Na edição o passado é permitido: encurtar o prazo é a forma de colocar
        // a ficha na fila de anonimização.
        const erroRetencao = validarRetencao(retencaoAte, { permitirPassado: true });

        if (!parsed.success || !retencaoAte || erroRetencao) {
            const fieldErrors: Record<string, string> = parsed.success
                ? {}
                : errosDeCampo(parsed.error);
            if (erroRetencao) {
                fieldErrors.retencaoAte = erroRetencao;
            }
            return actionError('Verifique os campos destacados.', fieldErrors);
        }

        const atual = await buscarNoEscopo(user, parsed.data.id);
        if (!atual) {
            return actionError('Ficha não encontrada ou fora do seu escopo de acesso.');
        }

        const mudouStatus = atual.status !== parsed.data.status;
        const mudouRetencao = atual.retencaoAte.getTime() !== retencaoAte.getTime();

        if (!mudouStatus && !mudouRetencao) {
            return actionOk('Nenhuma alteração a registrar.');
        }

        const encerrando = parsed.data.status === 'ENCERRADO';

        await prisma.atendimento.update({
            where: { id: atual.id },
            data: {
                status: parsed.data.status,
                retencaoAte,
                // A data de encerramento acompanha o status para não sobrar
                // registro "encerrado" sem quando.
                encerradoEm: encerrando ? (atual.encerradoEm ?? new Date()) : null,
            },
        });

        if (mudouStatus) {
            await recordAudit({
                action: 'Status de atendimento alterado',
                target: atual.codigo,
                userId: user.id,
                actorLabel: user.email,
                metadata: { de: atual.status, para: parsed.data.status },
            });
        }

        if (mudouRetencao) {
            await recordAudit({
                action: 'Prazo de retenção de atendimento alterado',
                target: atual.codigo,
                level: 'ALERTA',
                userId: user.id,
                actorLabel: user.email,
                metadata: {
                    de: atual.retencaoAte.toISOString().slice(0, 10),
                    para: retencaoAte.toISOString().slice(0, 10),
                },
            });
        }

        revalidarFicha(atual.id);

        return actionOk('Ficha atualizada.');
    });
}

const encaminhamentoSchema = z.object({
    atendimentoId: z.string().min(1, 'Ficha não identificada.'),
    orgao: z
        .string()
        .min(2, 'Informe o órgão ou serviço para onde a pessoa foi encaminhada.')
        .max(160, 'Use no máximo 160 caracteres.'),
    descricao: z
        .string()
        .min(5, 'Descreva em uma linha o que foi encaminhado.')
        .max(1000, 'Use no máximo 1000 caracteres.'),
});

/** Acrescenta um encaminhamento ao histórico da ficha. */
export async function registrarEncaminhamento(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const parsed = encaminhamentoSchema.safeParse({
            atendimentoId: formString(formData, 'atendimentoId'),
            orgao: formString(formData, 'orgao'),
            descricao: formString(formData, 'descricao'),
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', errosDeCampo(parsed.error));
        }

        const ficha = await buscarNoEscopo(user, parsed.data.atendimentoId);
        if (!ficha) {
            return actionError('Ficha não encontrada ou fora do seu escopo de acesso.');
        }

        await prisma.atendimentoEncaminhamento.create({
            data: {
                atendimentoId: ficha.id,
                orgao: parsed.data.orgao,
                descricao: parsed.data.descricao,
                registradoPor: user.name,
            },
        });

        await recordAudit({
            action: 'Encaminhamento registrado',
            target: ficha.codigo,
            userId: user.id,
            actorLabel: user.email,
            metadata: { orgao: parsed.data.orgao },
        });

        revalidarFicha(ficha.id);

        return actionOk('Encaminhamento registrado no histórico.');
    });
}

// ---------------------------------------------------------
// Anonimização (art. 16, IV da LGPD)
// ---------------------------------------------------------

const anonimizarSchema = z.object({
    id: z.string().min(1, 'Ficha não identificada.'),
});

/**
 * Apaga nome, contato e observações e mantém os campos estatísticos.
 *
 * É irreversível de propósito: o dado cifrado é destruído, não arquivado. O
 * que sobra (faixa etária, gênero, país, necessidades) segue alimentando o
 * relatório da rede sem identificar ninguém.
 */
export async function anonimizarAtendimento(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const parsed = anonimizarSchema.safeParse({ id: formString(formData, 'id') });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', errosDeCampo(parsed.error));
        }

        if (!formBoolean(formData, 'confirmar')) {
            return actionError('Confirme que entende que a operação não tem volta.', {
                confirmar: 'Marque a confirmação para prosseguir.',
            });
        }

        const ficha = await buscarNoEscopo(user, parsed.data.id);
        if (!ficha) {
            return actionError('Ficha não encontrada ou fora do seu escopo de acesso.');
        }

        // Um `count` responde "ainda sobrou algo?" sem trazer o texto cifrado
        // para a memória do servidor. Sem esta parada, reanonimizar uma ficha já
        // limpa gravaria mais um evento CRÍTICO no log, poluindo justamente a
        // trilha que serve para provar quando o apagamento aconteceu.
        const aindaTemDadoPessoal = await prisma.atendimento.count({
            where: {
                id: ficha.id,
                OR: [
                    { nomeEncrypted: { not: null } },
                    { contatoEncrypted: { not: null } },
                    { observacoes: { not: null } },
                ],
            },
        });

        if (aindaTemDadoPessoal === 0) {
            return actionOk('Esta ficha já não guarda nome, contato nem observações.');
        }

        await prisma.atendimento.update({
            where: { id: ficha.id },
            data: { nomeEncrypted: null, contatoEncrypted: null, observacoes: null },
        });

        await recordAudit({
            action: 'Ficha de atendimento anonimizada',
            target: ficha.codigo,
            level: 'CRITICO',
            userId: user.id,
            actorLabel: user.email,
            metadata: { fundamento: 'LGPD, art. 16, IV', regional: ficha.regional.name },
        });

        revalidarFicha(ficha.id);

        return actionOk('Nome, contato e observações foram apagados desta ficha.');
    });
}
