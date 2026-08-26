/**
 * Rótulos exibidos na interface para os enums do banco.
 *
 * Fica fora de `lib/server` de propósito: Client Components também precisam
 * traduzir esses valores.
 */

import type {
    AtendimentoStatus,
    AuditLevel,
    ContactStatus,
    DocumentoCategoria,
    EditalStatus,
    FaixaEtaria,
    Genero,
    MediaKind,
    Necessidade,
    PostStatus,
    Regiao,
    UserStatus,
} from '@/lib/generated/prisma/enums';

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
    RASCUNHO: 'rascunho',
    REVISAO: 'revisão',
    AGENDADO: 'agendado',
    PUBLICADO: 'publicado',
};

/** Classe do selo de status reaproveitando o CSS já existente do painel. */
export const POST_STATUS_CLASS: Record<PostStatus, string> = {
    RASCUNHO: 'abadge abadge--rascunho',
    REVISAO: 'abadge abadge--revisao',
    AGENDADO: 'abadge abadge--agendado',
    PUBLICADO: 'abadge abadge--publicado',
};

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
    ATIVO: 'ativo',
    INATIVO: 'inativo',
    PENDENTE: 'pendente',
};

export const USER_STATUS_CLASS: Record<UserStatus, string> = {
    ATIVO: 'abadge abadge--ativo',
    INATIVO: 'abadge abadge--inativo',
    PENDENTE: 'abadge abadge--pendente',
};

export const EDITAL_STATUS_LABEL: Record<EditalStatus, string> = {
    ABERTO: 'Aberto',
    EM_ANALISE: 'Em análise',
    ENCERRADO: 'Encerrado',
};

export const EDITAL_STATUS_CLASS: Record<EditalStatus, string> = {
    ABERTO: 'status-tag status-tag--open',
    EM_ANALISE: 'status-tag status-tag--review',
    ENCERRADO: 'status-tag status-tag--closed',
};

export const DOCUMENTO_CATEGORIA_LABEL: Record<DocumentoCategoria, string> = {
    INSTITUCIONAL: 'Institucional',
    ASSEMBLEIAS: 'Assembleias',
    NOTAS_PUBLICAS: 'Notas públicas',
    FORMACAO: 'Formação',
    RELATORIOS: 'Relatórios',
};

export const REGIAO_LABEL: Record<Regiao, string> = {
    NORTE: 'Norte',
    NORDESTE: 'Nordeste',
    CENTRO_OESTE: 'Centro-Oeste',
    SUDESTE: 'Sudeste',
    SUL: 'Sul',
};

export const AUDIT_LEVEL_LABEL: Record<AuditLevel, string> = {
    INFO: 'info',
    ALERTA: 'alerta',
    CRITICO: 'crítico',
};

export const AUDIT_LEVEL_CLASS: Record<AuditLevel, string> = {
    INFO: 'abadge abadge--info',
    ALERTA: 'abadge abadge--alerta',
    CRITICO: 'abadge abadge--critico',
};

export const AUDIT_LEVEL_ICON: Record<AuditLevel, string> = {
    INFO: 'fa-circle-check',
    ALERTA: 'fa-circle-exclamation',
    CRITICO: 'fa-triangle-exclamation',
};

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
    NOVA: 'nova',
    EM_ATENDIMENTO: 'em atendimento',
    RESPONDIDA: 'respondida',
    ARQUIVADA: 'arquivada',
};

export const CONTACT_STATUS_CLASS: Record<ContactStatus, string> = {
    NOVA: 'abadge abadge--agendado',
    EM_ATENDIMENTO: 'abadge abadge--pendente',
    RESPONDIDA: 'abadge abadge--publicado',
    ARQUIVADA: 'abadge abadge--inativo',
};

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
    IMAGEM: 'imagem',
    DOCUMENTO: 'documento',
    OUTRO: 'outro',
};

export const ATENDIMENTO_STATUS_LABEL: Record<AtendimentoStatus, string> = {
    ABERTO: 'aberto',
    EM_ACOMPANHAMENTO: 'em acompanhamento',
    ENCAMINHADO: 'encaminhado',
    ENCERRADO: 'encerrado',
};

export const ATENDIMENTO_STATUS_CLASS: Record<AtendimentoStatus, string> = {
    ABERTO: 'abadge abadge--agendado',
    EM_ACOMPANHAMENTO: 'abadge abadge--pendente',
    ENCAMINHADO: 'abadge abadge--info',
    ENCERRADO: 'abadge abadge--publicado',
};

export const FAIXA_ETARIA_LABEL: Record<FaixaEtaria, string> = {
    CRIANCA: 'Criança (0–11)',
    ADOLESCENTE: 'Adolescente (12–17)',
    JOVEM: 'Jovem (18–29)',
    ADULTO: 'Adulto (30–59)',
    IDOSO: 'Pessoa idosa (60+)',
    NAO_INFORMADO: 'Não informado',
};

export const GENERO_LABEL: Record<Genero, string> = {
    FEMININO: 'Feminino',
    MASCULINO: 'Masculino',
    OUTRO: 'Outro',
    NAO_INFORMADO: 'Não informado',
};

export const NECESSIDADE_LABEL: Record<Necessidade, string> = {
    ACOLHIDA: 'Acolhida e abrigo',
    DOCUMENTACAO: 'Documentação e regularização',
    TRABALHO: 'Trabalho e renda',
    MORADIA: 'Moradia',
    SAUDE: 'Saúde',
    EDUCACAO: 'Educação',
    JURIDICO: 'Orientação jurídica',
    ALIMENTACAO: 'Alimentação',
    LINGUA_PORTUGUESA: 'Português como língua de acolhimento',
    REUNIAO_FAMILIAR: 'Reunião familiar',
    VIOLENCIA: 'Situação de violência',
    TRAFICO_DE_PESSOAS: 'Indício de tráfico de pessoas',
    OUTRO: 'Outro',
};

/** Nomes das permissões usados na matriz de perfis. */
export const PERMISSION_ORDER = [
    'noticias',
    'midia',
    'editais',
    'atendimentos',
    'usuarios',
    'config',
] as const;

export type PermissionKey = (typeof PERMISSION_ORDER)[number];

const MESES = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
];

/** "22 de junho de 2026" — formato usado no site público. */
export function formatDateLong(value: Date | string | null | undefined): string {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.getUTCDate()} de ${MESES[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

/** "22/06/2026 · 09:12" — formato usado no painel. */
export function formatDateTimeShort(value: Date | string | null | undefined): string {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '—';

    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${date.getFullYear()} · ${hh}:${mi}`;
}

/** "2026-08-15" — valor de <input type="date">. */
export function toDateInputValue(value: Date | string | null | undefined): string {
    if (!value) return '';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
