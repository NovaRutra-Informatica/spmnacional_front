/**
 * Versão estática de `app/fale-conosco/actions.ts`, usada só pelo build do
 * GitHub Pages (`scripts/build-pages.mjs` copia este arquivo por cima do
 * original antes de rodar o `next build`).
 *
 * O site publicado no Pages é um punhado de arquivos servidos por um CDN: não
 * há processo Node, não há banco e não há SMTP, então não existe para onde
 * mandar a mensagem. Em vez de deixar o formulário falhar em silêncio, a ação
 * devolve o endereço de e-mail no mesmo contrato (`{ ok, message }`) que o
 * `useActionState` do PageContent já espera — a página inteira continua
 * renderizando com todo o seu conteúdo, FAQ e dados de contato.
 *
 * Sem `'use server'` de propósito: aqui é uma função comum, que entra no bundle
 * do cliente junto do PageContent e roda no navegador.
 */

interface ContactFormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const EMAIL = 'contato@spmnacional.org.br';

const AVISO =
    `O envio pelo site está indisponível nesta versão. Escreva para ${EMAIL} ` +
    'com o seu nome, cidade e o motivo do contato — respondemos em até 5 dias úteis.';

export async function enviarMensagem(
    _prev: ContactFormState,
    _formData: FormData,
): Promise<ContactFormState> {
    return { ok: false, message: AVISO };
}
