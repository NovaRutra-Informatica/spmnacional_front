/**
 * Iniciais exibidas no avatar do painel.
 *
 * Fica fora de `actions.ts` porque o arquivo de ações é `'use server'` e só
 * pode exportar funções assíncronas — aqui a mesma regra é usada pelo servidor
 * (ao gravar) e pelo cliente (na pré-visualização do convite), evitando que o
 * avatar mostrado antes de salvar seja diferente do que fica no banco.
 */
export function initialsFrom(name: string): string {
    const parts = name
        .trim()
        .split(/\s+/)
        .filter((part) => part.length > 0);

    if (parts.length === 0) return '??';
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();

    return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}
