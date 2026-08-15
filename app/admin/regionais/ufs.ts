/**
 * Unidades da federação aceitas no cadastro de regionais.
 *
 * Fica em módulo próprio porque a Server Action valida a lista e o formulário
 * monta o `<select>` com ela — e um arquivo `'use server'` só pode exportar
 * funções assíncronas.
 */
export const UFS = [
    'AC',
    'AL',
    'AP',
    'AM',
    'BA',
    'CE',
    'DF',
    'ES',
    'GO',
    'MA',
    'MT',
    'MS',
    'MG',
    'PA',
    'PB',
    'PR',
    'PE',
    'PI',
    'RJ',
    'RN',
    'RS',
    'RO',
    'RR',
    'SC',
    'SP',
    'SE',
    'TO',
] as const;

export type Uf = (typeof UFS)[number];
