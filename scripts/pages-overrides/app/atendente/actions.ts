/**
 * Versão estática de `app/atendente/actions.ts`.
 *
 * A tela de login continua no ar porque o cabeçalho e o rodapé apontam para
 * ela — tirá-la deixaria dois links quebrados em todas as páginas. O que não
 * existe é a autenticação: sessão, cookie e consulta ao banco precisam de um
 * servidor Node, que o GitHub Pages não tem.
 */

interface ActionState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const AVISO =
    'O painel administrativo não está disponível neste endereço. Ele roda em um ' +
    'servidor próprio — peça o endereço de acesso à coordenação.';

export async function entrar(_prev: ActionState, _formData: FormData): Promise<ActionState> {
    return { ok: false, message: AVISO };
}
