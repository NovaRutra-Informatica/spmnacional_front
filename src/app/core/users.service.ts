import { computed, Injectable, signal } from '@angular/core';

export type UserStatus = 'ativo' | 'inativo' | 'pendente';

export interface AdminUser {
    id: number;
    name: string;
    email: string;
    role: string;
    regional: string;
    status: UserStatus;
    lastAccess: string;
    initials: string;
}

export interface UserDraft {
    name: string;
    email: string;
    role: string;
    regional: string;
    status: UserStatus;
}

export interface RoleDefinition {
    key: string;
    name: string;
    description: string;
    permissions: Record<string, boolean>;
}

export interface AccessLogEntry {
    user: string;
    action: string;
    target: string;
    ip: string;
    when: string;
    level: 'info' | 'alerta' | 'critico';
}

@Injectable({ providedIn: 'root' })
export class UsersService {
    readonly roleNames = [
        'Administrador geral',
        'Editor de conteúdo',
        'Atendente regional',
        'Coordenação regional',
        'Somente leitura',
    ];

    readonly regionais = [
        'Secretariado Nacional',
        'Norte — Roraima',
        'Norte — Amazonas',
        'Nordeste — Ceará',
        'Centro-Oeste — Distrito Federal',
        'Sudeste — São Paulo',
        'Sudeste — Rio de Janeiro',
        'Sul — Paraná',
        'Sul — Santa Catarina',
        'Sul — Rio Grande do Sul',
    ];

    readonly permissionLabels: { key: string; label: string; hint: string }[] = [
        { key: 'noticias', label: 'Publicar notícias', hint: 'Criar, editar e publicar no blog' },
        { key: 'midia', label: 'Biblioteca de mídia', hint: 'Enviar e remover arquivos' },
        { key: 'editais', label: 'Gerenciar editais', hint: 'Abrir e encerrar chamadas públicas' },
        { key: 'atendimentos', label: 'Registrar atendimentos', hint: 'Acessar fichas de casos' },
        { key: 'usuarios', label: 'Gerenciar usuários', hint: 'Convidar, editar e desativar' },
        { key: 'config', label: 'Configurações do site', hint: 'Alterar dados institucionais' },
    ];

    private nextId = 9;

    readonly users = signal<AdminUser[]>([
        {
            id: 1,
            name: 'Administrador do SPM',
            email: 'admin@spmnacional.org.br',
            role: 'Administrador geral',
            regional: 'Secretariado Nacional',
            status: 'ativo',
            lastAccess: '08/08/2026 · 09:12',
            initials: 'AD',
        },
        {
            id: 2,
            name: 'Maria Ozania da Silva',
            email: 'ozania@spmnacional.org.br',
            role: 'Coordenação regional',
            regional: 'Nordeste — Ceará',
            status: 'ativo',
            lastAccess: '07/08/2026 · 17:40',
            initials: 'MO',
        },
        {
            id: 3,
            name: 'Rosana Nascimento',
            email: 'rosana@spmnacional.org.br',
            role: 'Editor de conteúdo',
            regional: 'Secretariado Nacional',
            status: 'ativo',
            lastAccess: '08/08/2026 · 08:05',
            initials: 'RN',
        },
        {
            id: 4,
            name: 'Roberto Saraiva',
            email: 'roberto@spmnacional.org.br',
            role: 'Administrador geral',
            regional: 'Secretariado Nacional',
            status: 'ativo',
            lastAccess: '06/08/2026 · 14:22',
            initials: 'RS',
        },
        {
            id: 5,
            name: 'Pe. Valdecir Mayer Molinari',
            email: 'valdecir@spmnacional.org.br',
            role: 'Coordenação regional',
            regional: 'Sul — Paraná',
            status: 'ativo',
            lastAccess: '05/08/2026 · 11:30',
            initials: 'VM',
        },
        {
            id: 6,
            name: 'Equipe Boa Vista',
            email: 'boavista@spmnacional.org.br',
            role: 'Atendente regional',
            regional: 'Norte — Roraima',
            status: 'ativo',
            lastAccess: '08/08/2026 · 07:55',
            initials: 'BV',
        },
        {
            id: 7,
            name: 'Equipe Tabatinga',
            email: 'tabatinga@spmnacional.org.br',
            role: 'Atendente regional',
            regional: 'Norte — Amazonas',
            status: 'pendente',
            lastAccess: 'Convite enviado em 04/08/2026',
            initials: 'TB',
        },
        {
            id: 8,
            name: 'Voluntariado SC',
            email: 'voluntarios.sc@spmnacional.org.br',
            role: 'Somente leitura',
            regional: 'Sul — Santa Catarina',
            status: 'inativo',
            lastAccess: '12/02/2026 · 10:08',
            initials: 'VS',
        },
    ]);

    readonly roles = signal<RoleDefinition[]>([
        {
            key: 'admin',
            name: 'Administrador geral',
            description: 'Acesso irrestrito, incluindo gestão de usuários e configurações.',
            permissions: {
                noticias: true,
                midia: true,
                editais: true,
                atendimentos: true,
                usuarios: true,
                config: true,
            },
        },
        {
            key: 'editor',
            name: 'Editor de conteúdo',
            description: 'Produz e publica conteúdo no site, sem acesso a dados de atendimento.',
            permissions: {
                noticias: true,
                midia: true,
                editais: true,
                atendimentos: false,
                usuarios: false,
                config: false,
            },
        },
        {
            key: 'atendente',
            name: 'Atendente regional',
            description: 'Registra atendimentos da sua regional e envia arquivos de apoio.',
            permissions: {
                noticias: false,
                midia: true,
                editais: false,
                atendimentos: true,
                usuarios: false,
                config: false,
            },
        },
        {
            key: 'coordenacao',
            name: 'Coordenação regional',
            description: 'Acompanha a regional, publica conteúdo e gerencia a equipe local.',
            permissions: {
                noticias: true,
                midia: true,
                editais: true,
                atendimentos: true,
                usuarios: true,
                config: false,
            },
        },
        {
            key: 'leitura',
            name: 'Somente leitura',
            description: 'Visualiza relatórios e conteúdo, sem permissão de alteração.',
            permissions: {
                noticias: false,
                midia: false,
                editais: false,
                atendimentos: false,
                usuarios: false,
                config: false,
            },
        },
    ]);

    readonly accessLog = signal<AccessLogEntry[]>([
        {
            user: 'admin@spmnacional.org.br',
            action: 'Login realizado',
            target: 'Painel administrativo',
            ip: '187.45.10.22',
            when: '08/08/2026 · 09:12',
            level: 'info',
        },
        {
            user: 'boavista@spmnacional.org.br',
            action: 'Registro de atendimento',
            target: 'Ficha #4821',
            ip: '200.31.7.114',
            when: '08/08/2026 · 07:55',
            level: 'info',
        },
        {
            user: 'rosana@spmnacional.org.br',
            action: 'Publicação de notícia',
            target: '41ª Semana do Migrante reforça apelo por moradia digna',
            ip: '177.92.44.8',
            when: '08/08/2026 · 08:05',
            level: 'info',
        },
        {
            user: 'desconhecido',
            action: 'Tentativa de login malsucedida (3x)',
            target: '/atendente',
            ip: '45.190.201.77',
            when: '07/08/2026 · 23:41',
            level: 'critico',
        },
        {
            user: 'roberto@spmnacional.org.br',
            action: 'Alteração de permissões',
            target: 'Perfil “Editor de conteúdo”',
            ip: '187.45.10.30',
            when: '06/08/2026 · 14:25',
            level: 'alerta',
        },
        {
            user: 'valdecir@spmnacional.org.br',
            action: 'Convite de usuário enviado',
            target: 'tabatinga@spmnacional.org.br',
            ip: '189.12.66.4',
            when: '04/08/2026 · 16:02',
            level: 'info',
        },
    ]);

    readonly total = computed(() => this.users().length);
    readonly active = computed(() => this.users().filter((u) => u.status === 'ativo').length);
    readonly pending = computed(() => this.users().filter((u) => u.status === 'pendente').length);
    readonly inactive = computed(() => this.users().filter((u) => u.status === 'inativo').length);

    create(draft: UserDraft): AdminUser {
        const user: AdminUser = {
            ...draft,
            id: this.nextId++,
            initials: this.initialsFrom(draft.name),
            lastAccess: draft.status === 'pendente' ? 'Convite enviado agora' : 'Nunca acessou',
        };
        this.users.update((list) => [user, ...list]);
        return user;
    }

    remove(id: number): void {
        this.users.update((list) => list.filter((u) => u.id !== id));
    }

    setStatus(id: number, status: UserStatus): void {
        this.users.update((list) => list.map((u) => (u.id === id ? { ...u, status } : u)));
    }

    togglePermission(roleKey: string, permission: string): void {
        this.roles.update((list) =>
            list.map((r) =>
                r.key === roleKey
                    ? {
                          ...r,
                          permissions: {
                              ...r.permissions,
                              [permission]: !r.permissions[permission],
                          },
                      }
                    : r,
            ),
        );
    }

    initialsFrom(name: string): string {
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (!parts.length) {
            return '??';
        }
        const first = parts[0][0] ?? '';
        const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
        return (first + last).toUpperCase();
    }
}
