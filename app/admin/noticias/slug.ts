/**
 * Endereço da página gerado a partir do título.
 *
 * Fica num arquivo próprio (sem `server-only` e sem `'use server'`) porque o
 * editor precisa do mesmo resultado nos dois lados: no cliente para mostrar a
 * pré-visualização enquanto a pessoa digita, e no servidor para normalizar o
 * valor que realmente vai para o banco — quem envia o formulário pode ter
 * mexido no HTML.
 */

const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g');

export function slugify(value: string): string {
    return value
        .normalize('NFD')
        .replace(DIACRITICOS, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 90)
        .replace(/-+$/g, '');
}
