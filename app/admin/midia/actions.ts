'use server';

import { revalidatePath } from 'next/cache';
import { recordAudit } from '@/lib/server/audit';
import { processMediaDeletion, queueMediaDeletion } from '@/lib/server/media-deletion';
import { logError } from '@/lib/server/logger';
import {
    actionError,
    actionOk,
    formString,
    runAction,
    type ActionState,
} from '@/lib/server/actions';

export async function excluirMidia(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction('midia', async (user) => {
        const id = formString(formData, 'id');
        if (!id) {
            return actionError('Arquivo não informado.');
        }

        const queued = await queueMediaDeletion(id);
        if (!queued.ok) {
            return actionError(
                queued.reason === 'missing'
                    ? 'Arquivo não encontrado. Ele pode já ter sido removido.'
                    : 'Este arquivo ainda está em uso. Troque-o nos conteúdos vinculados antes de excluir.',
            );
        }

        let removedFromStorage = false;
        try {
            removedFromStorage = (await processMediaDeletion(queued.jobId)) === 'deleted';
        } catch (error) {
            // A intenção já está persistida e será retomada pelo cron.
            logError('media.deletion_deferred', error);
        }

        await recordAudit({
            action: 'Arquivo removido da biblioteca',
            target: queued.originalName,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
            metadata: { id: queued.mediaId, removalPending: !removedFromStorage },
        });

        revalidatePath('/admin/midia');
        revalidatePath('/admin/noticias/nova');

        return actionOk(
            `“${queued.originalName}” foi removido da biblioteca.${removedFromStorage ? '' : ' A limpeza no armazenamento será concluída automaticamente.'}`,
        );
    });
}
