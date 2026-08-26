'use client';

/**
 * Criar e editar usam exatamente o mesmo editor — a diferença é só o `post`
 * recebido por props. Reexportar mantém as duas rotas com o arquivo esperado
 * sem duplicar uma linha de formulário.
 */
export { default } from '../nova/PageContent';
export type { CategoriaEditor, ImagemEditor, NoticiaEditor } from '../nova/PageContent';
