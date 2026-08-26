/**
 * Versão estática de `app/newsletter/actions.ts` — ver o cabeçalho de
 * `scripts/pages-overrides/app/fale-conosco/actions.ts` para o porquê.
 *
 * A inscrição de verdade depende de banco (para guardar o e-mail) e de SMTP
 * (para a dupla confirmação por link). Nenhum dos dois existe no GitHub Pages,
 * e aceitar o e-mail sem ter onde gravá-lo seria pior do que dizer a verdade.
 */

interface NewsletterFormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const AVISO =
    'A inscrição pelo site está indisponível nesta versão. Escreva para ' +
    'contato@spmnacional.org.br pedindo para entrar na lista de e-mails.';

export async function inscrever(
    _prev: NewsletterFormState,
    _formData: FormData,
): Promise<NewsletterFormState> {
    return { ok: false, message: AVISO };
}
