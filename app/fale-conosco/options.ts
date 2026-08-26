/**
 * Listas dos selects do Fale Conosco.
 *
 * Ficam num módulo neutro (sem `server-only` e sem `'use server'`) porque o
 * formulário no cliente e a validação no servidor precisam concordar sobre os
 * valores aceitos — duplicar as opções seria o caminho mais curto para elas
 * divergirem.
 */

export const CONTACT_SUBJECTS = [
    'Preciso de orientação migratória',
    'Quero denunciar uma violação de direitos',
    'Quero ser voluntário',
    'Quero doar ou apoiar',
    'Minha comunidade quer iniciar um trabalho',
    'Imprensa',
    'Dúvida sobre edital',
    'Outro assunto',
] as const;

export const CONTACT_LANGUAGES = [
    'Português',
    'Español',
    'Français',
    'English',
    'Kreyòl ayisyen',
] as const;

export const DEFAULT_CONTACT_LANGUAGE = CONTACT_LANGUAGES[0];
