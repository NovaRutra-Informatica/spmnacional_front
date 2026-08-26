import 'server-only';

import type { Prisma } from '@/lib/generated/prisma/client';
import type { SessionUser } from '@/lib/server/auth';

/**
 * Política de acesso e de retenção do módulo de atendimentos.
 *
 * Fica em um arquivo só porque as quatro telas do módulo (listagem, nova ficha,
 * detalhe e ações) precisam aplicar exatamente as mesmas regras — regra
 * repetida é regra que um dia diverge, e aqui a divergência significa expor
 * dado pessoal de pessoa migrante à equipe errada.
 */

/** Chave do perfil de sistema com alcance nacional (ver prisma/seed.ts). */
const PERFIL_NACIONAL = 'admin';

/** Prazo padrão de guarda da ficha, contado da abertura. */
export const RETENCAO_PADRAO_ANOS = 5;

/** Teto de guarda: acima disso a retenção deixa de ser proporcional. */
export const RETENCAO_MAXIMA_ANOS = 10;

/**
 * O formulário envia a data em UTC (`<input type="date">`) e o servidor pode
 * estar em outro fuso; um dia de folga evita recusar "hoje" por causa disso.
 */
const TOLERANCIA_FUSO_MS = 24 * 60 * 60 * 1000;

export function isAdminGeral(user: SessionUser): boolean {
    return user.role.key === PERFIL_NACIONAL;
}

/**
 * Recorte aplicado a toda leitura e escrita de atendimento.
 *
 * Vai no `where` da consulta, e não na interface: o que a pessoa não pode ver
 * não deve sequer sair do banco. Quem não é administrador geral e não tem
 * regional vinculada não enxerga ficha nenhuma — `id: { in: [] }` nunca casa
 * com registro algum.
 */
export function escopoAtendimento(user: SessionUser): Prisma.AtendimentoWhereInput {
    if (isAdminGeral(user)) return {};
    if (!user.regionalId) return { id: { in: [] } };
    return { regionalId: user.regionalId };
}

/** Regionais que a pessoa pode escolher ao abrir uma ficha ou filtrar a lista. */
export function escopoRegional(user: SessionUser): Prisma.RegionalWhereInput {
    if (isAdminGeral(user)) return { active: true };
    // A própria regional continua disponível mesmo se for desativada, senão a
    // equipe local ficaria sem conseguir registrar nada até alguém reativá-la.
    if (!user.regionalId) return { id: { in: [] } };
    return { id: user.regionalId };
}

/** Data-limite padrão de guarda, usada como sugestão na abertura da ficha. */
export function retencaoPadrao(base: Date = new Date()): Date {
    const data = new Date(
        Date.UTC(
            base.getUTCFullYear() + RETENCAO_PADRAO_ANOS,
            base.getUTCMonth(),
            base.getUTCDate(),
        ),
    );
    return data;
}

/**
 * Valida a data de retenção; devolve a mensagem de erro ou null.
 *
 * `permitirPassado` existe porque uma ficha antiga pode ter o prazo encurtado
 * de propósito, para entrar na fila de anonimização.
 */
export function validarRetencao(
    valor: Date | null,
    opcoes: { permitirPassado: boolean },
): string | null {
    if (!valor) {
        return 'Informe até quando esta ficha pode ser mantida.';
    }

    const agora = new Date();
    const inicioDeHoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());

    if (!opcoes.permitirPassado && valor.getTime() < inicioDeHoje - TOLERANCIA_FUSO_MS) {
        return 'A data de retenção não pode estar no passado.';
    }

    const teto = Date.UTC(
        agora.getUTCFullYear() + RETENCAO_MAXIMA_ANOS,
        agora.getUTCMonth(),
        agora.getUTCDate(),
    );

    if (valor.getTime() > teto) {
        return `Guarde a ficha por no máximo ${RETENCAO_MAXIMA_ANOS} anos.`;
    }

    return null;
}

/** Retenção vencida — o registro deveria ter sido anonimizado ou expurgado. */
export function retencaoVencida(valor: Date, agora: Date = new Date()): boolean {
    return valor.getTime() < agora.getTime();
}
