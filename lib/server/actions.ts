import 'server-only';

import { z } from 'zod';
import { getCurrentUser, hasPermission, type SessionUser } from './auth';
import { recordAudit } from './audit';
import { assertTrustedMutationOrigin, UntrustedOriginError } from './request-origin';
import { logError } from './logger';
import { withActorDatabaseScope } from './database-scope';

/**
 * Convenções das Server Actions do painel.
 *
 * Toda ação devolve o mesmo formato — assim os formulários usam `useActionState`
 * sem cada tela inventar o seu próprio contrato de erro.
 */

export interface ActionState {
    ok: boolean;
    /** Mensagem geral, exibida no topo do formulário. */
    message?: string;
    /** Erros por campo, para exibir junto do input. */
    fieldErrors?: Record<string, string>;
    /** Payload livre devolvido em caso de sucesso (id criado, por exemplo). */
    data?: Record<string, unknown>;
}

export const IDLE_STATE: ActionState = { ok: false };

export function actionOk(message?: string, data?: Record<string, unknown>): ActionState {
    return { ok: true, message, data };
}

export function actionError(message: string, fieldErrors?: Record<string, string>): ActionState {
    return { ok: false, message, fieldErrors };
}

/** Converte erros do zod no formato de `fieldErrors`. */
export function zodErrors(error: z.ZodError): Record<string, string> {
    const result: Record<string, string> = {};
    for (const issue of error.issues) {
        const key = issue.path.join('.') || 'form';
        if (!result[key]) {
            result[key] = issue.message;
        }
    }
    return result;
}

export class PermissionError extends Error {
    constructor(permission: string) {
        super(`Sem permissão para "${permission}".`);
        this.name = 'PermissionError';
    }
}

/** Erro de entrada seguro para exibir ao usuário sem revelar detalhes internos. */
export class ActionInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ActionInputError';
    }
}

/**
 * Garante que quem executa a ação está autenticado e tem a permissão.
 * Diferente de `requirePermission`, não redireciona: lança para que a ação
 * devolva um erro que o formulário sabe exibir.
 */
export async function authorize(permission: string): Promise<SessionUser> {
    await assertTrustedMutationOrigin();
    const user = await getCurrentUser();

    if (!user) {
        throw new PermissionError('sessão');
    }

    if (!hasPermission(user, permission)) {
        await recordAudit({
            action: 'Tentativa de ação sem permissão',
            target: permission,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
        });
        throw new PermissionError(permission);
    }

    return user;
}

/**
 * Envolve o corpo de uma Server Action: resolve permissão, captura exceções e
 * devolve sempre um `ActionState`.
 */
export async function runAction(
    permission: string,
    body: (user: SessionUser) => Promise<ActionState>,
): Promise<ActionState> {
    try {
        const user = await authorize(permission);
        return await withActorDatabaseScope(user, () => body(user));
    } catch (error) {
        if (error instanceof UntrustedOriginError) {
            return actionError(error.message);
        }
        if (error instanceof PermissionError) {
            return actionError(
                error.message === 'Sem permissão para "sessão".'
                    ? 'Sua sessão expirou. Entre novamente.'
                    : 'Você não tem permissão para esta operação.',
            );
        }

        if (error instanceof z.ZodError) {
            return actionError('Verifique os campos destacados.', zodErrors(error));
        }

        if (error instanceof ActionInputError) {
            return actionError(error.message);
        }

        // `redirect()` do Next sinaliza por exceção — deixa passar.
        if (
            error &&
            typeof error === 'object' &&
            'digest' in error &&
            typeof (error as { digest?: unknown }).digest === 'string' &&
            (error as { digest: string }).digest.startsWith('NEXT_')
        ) {
            throw error;
        }

        logError('action.failed', error);
        return actionError('Não foi possível concluir a operação. Tente novamente.');
    }
}

// ---------------------------------------------------------
// Utilidades de formulário
// ---------------------------------------------------------

export function formString(data: FormData, key: string): string {
    const value = data.get(key);
    return typeof value === 'string' ? value.trim() : '';
}

export function formBoolean(data: FormData, key: string): boolean {
    const value = data.get(key);
    return value === 'on' || value === 'true' || value === '1';
}

export function formNumber(data: FormData, key: string): number | null {
    const raw = formString(data, key);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

export function formDate(data: FormData, key: string): Date | null {
    const raw = formString(data, key);
    if (!raw) return null;
    // HTML date/datetime-local and explicit ISO timestamps only. Date.parse also
    // accepts ambiguous locale strings and silently rolls Feb 30 into March.
    const fields =
        /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(
            raw,
        );
    if (!fields) return null;
    const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] = fields;
    const [year, month, day] = [yearRaw, monthRaw, dayRaw].map(Number);
    const calendar = new Date(0);
    calendar.setUTCFullYear(year, month - 1, day);
    calendar.setUTCHours(0, 0, 0, 0);
    if (
        year < 1 ||
        calendar.getUTCFullYear() !== year ||
        calendar.getUTCMonth() !== month - 1 ||
        calendar.getUTCDate() !== day ||
        (hourRaw !== undefined && Number(hourRaw) > 23) ||
        (minuteRaw !== undefined && Number(minuteRaw) > 59) ||
        (secondRaw !== undefined && Number(secondRaw) > 59)
    )
        return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formList(data: FormData, key: string): string[] {
    return formString(data, key)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}
