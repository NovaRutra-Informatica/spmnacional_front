'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { actionError, formString, type ActionState } from '@/lib/server/actions';
import { loginWithPassword, type LoginResult } from '@/lib/server/auth';

/**
 * O login não passa por `runAction`: ali a primeira coisa que acontece é exigir
 * sessão e permissão, e quem está entrando ainda não tem nenhuma das duas.
 */

const schema = z.object({
    email: z.string().min(1, 'Informe seu usuário ou e-mail.').max(254),
    // O limite impede que entradas enormes monopolizem CPU no scrypt.
    senha: z.string().min(1, 'Informe sua senha.').max(128),
});

/**
 * O `proximo` nasce no middleware (a rota que o visitante tentou abrir) e volta
 * pelo formulário — ou seja, é dado do usuário. Só liberamos caminhos internos
 * do painel para que a tela de login não vire um redirecionador aberto.
 */
function destinoSeguro(proximo: string): string {
    if (!proximo.startsWith('/admin')) return '/admin';
    // Alguns navegadores leem a barra invertida como separador de host.
    if (proximo.includes('\\')) return '/admin';
    return proximo;
}

export async function entrar(_prev: ActionState, formData: FormData): Promise<ActionState> {
    // A senha não passa por `formString`: aparar espaços mudaria uma senha legítima.
    const senhaBruta = formData.get('senha');

    const parsed = schema.safeParse({
        email: formString(formData, 'email'),
        senha: typeof senhaBruta === 'string' ? senhaBruta : '',
    });

    if (!parsed.success) {
        // Mensagem única: nada aqui pode sugerir qual dos dois campos falhou.
        return actionError('Informe usuário e senha.');
    }

    let resultado: LoginResult;

    try {
        resultado = await loginWithPassword(parsed.data.email, parsed.data.senha);
    } catch (error) {
        console.error('[login] falha inesperada:', error);
        return actionError('Não foi possível entrar agora. Tente novamente em instantes.');
    }

    if (!resultado.ok) {
        return actionError(resultado.error);
    }

    // `redirect()` sinaliza por exceção — fica fora do try para não ser engolido.
    redirect(destinoSeguro(formString(formData, 'proximo')));
}
