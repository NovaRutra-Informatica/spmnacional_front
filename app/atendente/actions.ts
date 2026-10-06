'use server';
import { redirect } from 'next/navigation';
import { actionError, formString, type ActionState } from '@/lib/server/actions';
import { loginWithLocalTestAccount, PASSWORD_DISABLED } from '@/lib/server/auth';
import { safeAdminDestination } from '@/lib/server/auth-security';
import { UntrustedOriginError } from '@/lib/server/request-origin';
import { logError } from '@/lib/server/logger';

/** Retained to reject stale forms/server-action submissions after Workspace-only rollout. */
export async function entrar(_prev: ActionState, _formData: FormData): Promise<ActionState> {
    void _prev;
    void _formData;
    return actionError(PASSWORD_DISABLED);
}

/** The account is selected in server configuration, never by a submitted user/profile ID. */
export async function entrarLocal(_prev: ActionState, formData: FormData): Promise<ActionState> {
    try {
        const result = await loginWithLocalTestAccount();
        if (!result.ok) return actionError(result.error);
    } catch (error) {
        if (error instanceof UntrustedOriginError) return actionError(error.message);
        logError('auth.local_test_failed', error);
        return actionError('Não foi possível entrar no ambiente local. Confira a configuração.');
    }
    redirect(safeAdminDestination(formString(formData, 'proximo')));
}
