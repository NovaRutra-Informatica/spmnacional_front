'use server';
import { actionError, type ActionState } from '@/lib/server/actions';
import { PASSWORD_DISABLED } from '@/lib/server/auth';

/** Old invitation tokens cannot activate an account or issue a non-Google session. */
export async function definirSenha(_prev: ActionState, _formData: FormData): Promise<ActionState> {
    void _prev;
    void _formData;
    return actionError(PASSWORD_DISABLED);
}
