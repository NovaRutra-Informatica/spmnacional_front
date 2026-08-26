'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { alterarSenha, salvarContato, salvarInstitucional, salvarSite } from './actions';

/** Espelha `ActionState` do servidor — o módulo original é server-only. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

/** Espelha `SiteSettings` de lib/server/queries, que é server-only. */
export interface SiteSettingsView {
    siteName: string;
    tagline: string;
    description: string;
    address: string;
    city: string;
    zip: string;
    phone: string;
    email: string;
    hours: string;
    instagram: string;
    facebook: string;
    youtube: string;
    whatsapp: string;
    showStickyDonate: boolean;
    showNewsletter: boolean;
    showCookieNotice: boolean;
    maintenance: boolean;
}

interface AccountInfo {
    name: string;
    email: string;
    initials: string;
    roleName: string;
    regionalName: string | null;
    lastAccess: string | null;
    mfaRequired: boolean;
    hasPassword: boolean;
    sessoesAtivas: number;
}

interface PageContentProps {
    settings: SiteSettingsView;
    account: AccountInfo;
    googleOAuthEnabled: boolean;
}

const TABS = ['Institucional', 'Contato', 'Site', 'Conta'] as const;
type Tab = (typeof TABS)[number];

/** Id compartilhado pelo botão do cabeçalho e pelo formulário da aba ativa. */
const FORM_ID = 'settings-form';

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return (
        <span className="afield__hint" style={{ color: '#c2185b' }}>
            {message}
        </span>
    );
}

function Feedback({ state }: { state: FormState }) {
    if (!state.message) return null;
    return (
        <div
            className={state.ok ? 'anote anote--success' : 'anote anote--warning'}
            style={{ marginTop: 0 }}
        >
            <i className={`fas ${state.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
            <div>{state.message}</div>
        </div>
    );
}

export default function PageContent({ settings, account, googleOAuthEnabled }: PageContentProps) {
    const [activeTab, setActiveTab] = useState<Tab>('Institucional');

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> / Sistema
                    </div>
                    <h1>Configurações</h1>
                    <p>
                        Dados institucionais, contatos exibidos no site, comportamento das páginas e
                        sua conta.
                    </p>
                </div>
                {activeTab !== 'Conta' && (
                    <div className="admin-page-head__actions">
                        <button className="abtn abtn--action" type="submit" form={FORM_ID}>
                            <i className="fas fa-floppy-disk"></i> Salvar alterações
                        </button>
                    </div>
                )}
            </div>

            <div className="atoolbar">
                {TABS.map((tab) => (
                    <button
                        className={`abtn${activeTab === tab ? ' abtn--primary' : ' abtn--ghost'}`}
                        onClick={() => setActiveTab(tab)}
                        key={tab}
                        type="button"
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === 'Institucional' && <InstitucionalTab settings={settings} />}
            {activeTab === 'Contato' && <ContatoTab settings={settings} />}
            {activeTab === 'Site' && <SiteTab settings={settings} />}
            {activeTab === 'Conta' && (
                <ContaTab account={account} googleOAuthEnabled={googleOAuthEnabled} />
            )}

            <div className="anote anote--warning" style={{ marginTop: '1.5rem' }}>
                <i className="fas fa-lock"></i>
                <div>
                    <strong>Sobre a autenticação deste painel.</strong> A autenticação agora é real:
                    a senha fica guardada como hash scrypt, a sessão é emitida e revogada pelo
                    servidor, e cada acesso passa pelo banco. O que ainda falta habilitar é a
                    verificação em duas etapas (MFA) e o login por Google Workspace — este último só
                    aparece na tela de entrada quando as credenciais OAuth estiverem configuradas
                    {googleOAuthEnabled
                        ? ', o que já está feito neste servidor.'
                        : ', o que ainda não foi feito neste servidor.'}
                </div>
            </div>
        </>
    );
}

// ---------------------------------------------------------
// Abas
// ---------------------------------------------------------

function InstitucionalTab({ settings }: { settings: SiteSettingsView }) {
    const [state, formAction] = useActionState<FormState, FormData>(salvarInstitucional, {
        ok: false,
    });
    const [description, setDescription] = useState(settings.description);

    return (
        <form action={formAction} id={FORM_ID}>
            <div className="acard">
                <div className="acard__head">
                    <div>
                        <h2>Identidade institucional</h2>
                        <p>
                            Aparece no título das páginas, nos metadados e no compartilhamento em
                            redes.
                        </p>
                    </div>
                </div>

                <Feedback state={state} />

                <div className="afield">
                    <label htmlFor="site-name">Nome do site</label>
                    <input
                        id="site-name"
                        name="siteName"
                        type="text"
                        defaultValue={settings.siteName}
                    />
                    <FieldError message={state.fieldErrors?.siteName} />
                </div>

                <div className="afield">
                    <label htmlFor="tagline">Assinatura / slogan</label>
                    <input
                        id="tagline"
                        name="tagline"
                        type="text"
                        defaultValue={settings.tagline}
                    />
                    <FieldError message={state.fieldErrors?.tagline} />
                </div>

                <div className="afield" style={{ marginBottom: '0' }}>
                    <label htmlFor="descricao">Descrição para buscadores</label>
                    <textarea
                        id="descricao"
                        name="description"
                        style={{ minHeight: '110px' }}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    ></textarea>
                    <span className="afield__hint">
                        {description.length} caracteres · ideal até 160
                    </span>
                    <FieldError message={state.fieldErrors?.description} />
                </div>
            </div>
        </form>
    );
}

function ContatoTab({ settings }: { settings: SiteSettingsView }) {
    const [state, formAction] = useActionState<FormState, FormData>(salvarContato, { ok: false });

    return (
        <form action={formAction} id={FORM_ID}>
            <Feedback state={state} />

            <div className="agrid agrid--2">
                <div className="acard" style={{ marginTop: '0' }}>
                    <div className="acard__head">
                        <div>
                            <h2>Endereço e atendimento</h2>
                            <p>
                                Dados do secretariado nacional exibidos no rodapé e em Fale Conosco.
                            </p>
                        </div>
                    </div>

                    <div className="afield">
                        <label htmlFor="endereco">Endereço</label>
                        <input
                            id="endereco"
                            name="address"
                            type="text"
                            defaultValue={settings.address}
                        />
                        <FieldError message={state.fieldErrors?.address} />
                    </div>
                    <div className="afield-row">
                        <div className="afield">
                            <label htmlFor="cidade">Cidade / UF</label>
                            <input
                                id="cidade"
                                name="city"
                                type="text"
                                defaultValue={settings.city}
                            />
                            <FieldError message={state.fieldErrors?.city} />
                        </div>
                        <div className="afield">
                            <label htmlFor="cep">CEP</label>
                            <input id="cep" name="zip" type="text" defaultValue={settings.zip} />
                            <FieldError message={state.fieldErrors?.zip} />
                        </div>
                    </div>
                    <div className="afield-row">
                        <div className="afield">
                            <label htmlFor="telefone">Telefone</label>
                            <input
                                id="telefone"
                                name="phone"
                                type="tel"
                                defaultValue={settings.phone}
                            />
                            <FieldError message={state.fieldErrors?.phone} />
                        </div>
                        <div className="afield">
                            <label htmlFor="email-contato">E-mail geral</label>
                            <input
                                id="email-contato"
                                name="email"
                                type="email"
                                defaultValue={settings.email}
                            />
                            <FieldError message={state.fieldErrors?.email} />
                        </div>
                    </div>
                    <div className="afield" style={{ marginBottom: '0' }}>
                        <label htmlFor="horario">Horário de atendimento</label>
                        <input
                            id="horario"
                            name="hours"
                            type="text"
                            defaultValue={settings.hours}
                        />
                        <FieldError message={state.fieldErrors?.hours} />
                    </div>
                </div>

                <div className="acard" style={{ marginTop: '0' }}>
                    <div className="acard__head">
                        <div>
                            <h2>Redes sociais</h2>
                            <p>Deixe em branco para ocultar o ícone no rodapé.</p>
                        </div>
                    </div>

                    <div className="afield">
                        <label htmlFor="instagram">Instagram</label>
                        <input
                            id="instagram"
                            name="instagram"
                            type="url"
                            defaultValue={settings.instagram}
                        />
                        <FieldError message={state.fieldErrors?.instagram} />
                    </div>
                    <div className="afield">
                        <label htmlFor="facebook">Facebook</label>
                        <input
                            id="facebook"
                            name="facebook"
                            type="url"
                            defaultValue={settings.facebook}
                        />
                        <FieldError message={state.fieldErrors?.facebook} />
                    </div>
                    <div className="afield">
                        <label htmlFor="youtube">YouTube</label>
                        <input
                            id="youtube"
                            name="youtube"
                            type="url"
                            defaultValue={settings.youtube}
                        />
                        <FieldError message={state.fieldErrors?.youtube} />
                    </div>
                    <div className="afield" style={{ marginBottom: '0' }}>
                        <label htmlFor="whatsapp">WhatsApp</label>
                        <input
                            id="whatsapp"
                            name="whatsapp"
                            type="url"
                            defaultValue={settings.whatsapp}
                            placeholder="https://wa.me/5511..."
                        />
                        <FieldError message={state.fieldErrors?.whatsapp} />
                    </div>
                </div>
            </div>
        </form>
    );
}

function SiteTab({ settings }: { settings: SiteSettingsView }) {
    const [state, formAction] = useActionState<FormState, FormData>(salvarSite, { ok: false });
    const [maintenance, setMaintenance] = useState(settings.maintenance);

    return (
        <form action={formAction} id={FORM_ID}>
            <div className="acard">
                <div className="acard__head">
                    <div>
                        <h2>Comportamento do site público</h2>
                        <p>Elementos que podem ser ligados e desligados sem alterar o código.</p>
                    </div>
                </div>

                <Feedback state={state} />

                <label className="aswitch" style={{ marginBottom: '1.25rem' }}>
                    <input
                        type="checkbox"
                        name="showStickyDonate"
                        defaultChecked={settings.showStickyDonate}
                    />
                    <span className="aswitch__track"></span>
                    <span className="aswitch__label">Exibir barra fixa de doação no celular</span>
                </label>

                <label className="aswitch" style={{ marginBottom: '1.25rem' }}>
                    <input
                        type="checkbox"
                        name="showNewsletter"
                        defaultChecked={settings.showNewsletter}
                    />
                    <span className="aswitch__track"></span>
                    <span className="aswitch__label">Exibir bloco de inscrição no boletim</span>
                </label>

                <label className="aswitch" style={{ marginBottom: '1.25rem' }}>
                    <input
                        type="checkbox"
                        name="showCookieNotice"
                        defaultChecked={settings.showCookieNotice}
                    />
                    <span className="aswitch__track"></span>
                    <span className="aswitch__label">Exibir aviso de cookies</span>
                </label>

                <label className="aswitch">
                    <input
                        type="checkbox"
                        name="maintenance"
                        checked={maintenance}
                        onChange={(e) => setMaintenance(e.target.checked)}
                    />
                    <span className="aswitch__track"></span>
                    <span className="aswitch__label">
                        Modo manutenção (site público fica indisponível temporariamente)
                    </span>
                </label>

                {maintenance && (
                    <div className="anote anote--warning" style={{ margin: '1.5rem 0 0' }}>
                        <i className="fas fa-triangle-exclamation"></i>
                        <div>
                            <strong>Atenção.</strong> Com o modo manutenção ativo, visitantes verão
                            apenas uma página de aviso. O painel administrativo continua acessível.
                        </div>
                    </div>
                )}
            </div>
        </form>
    );
}

function ContaTab({
    account,
    googleOAuthEnabled,
}: {
    account: AccountInfo;
    googleOAuthEnabled: boolean;
}) {
    const [state, formAction, pending] = useActionState<FormState, FormData>(alterarSenha, {
        ok: false,
    });

    return (
        <div className="agrid agrid--2">
            <div className="acard" style={{ marginTop: '0' }}>
                <div className="acard__head">
                    <div>
                        <h2>Minha conta</h2>
                        <p>Dados da sessão atual.</p>
                    </div>
                </div>

                <div className="atable__cell-media" style={{ marginBottom: '1.5rem' }}>
                    <span className="aavatar">{account.initials}</span>
                    <span>
                        <span className="atable__title">{account.name}</span>
                        <span className="atable__sub">{account.email}</span>
                    </span>
                </div>

                <div className="afield">
                    <label htmlFor="conta-email">E-mail de acesso</label>
                    <input id="conta-email" type="text" value={account.email} disabled readOnly />
                </div>
                <div className="afield">
                    <label htmlFor="conta-perfil">Perfil</label>
                    <input
                        id="conta-perfil"
                        type="text"
                        value={account.roleName}
                        disabled
                        readOnly
                    />
                </div>
                <div className="afield" style={{ marginBottom: '0' }}>
                    <label htmlFor="conta-regional">Regional</label>
                    <input
                        id="conta-regional"
                        type="text"
                        value={account.regionalName ?? 'Sem regional vinculada'}
                        disabled
                        readOnly
                    />
                </div>

                <ul className="activity-list" style={{ marginTop: '1.5rem' }}>
                    <li>
                        <span className="activity-list__icon">
                            <i className="fas fa-clock-rotate-left"></i>
                        </span>
                        <div>
                            <strong>{account.lastAccess ?? 'Sem registro'}</strong>
                            <span>Último acesso</span>
                        </div>
                    </li>
                    <li>
                        <span className="activity-list__icon">
                            <i className="fas fa-desktop"></i>
                        </span>
                        <div>
                            <strong>{account.sessoesAtivas}</strong>
                            <span>Sessões abertas neste momento</span>
                        </div>
                    </li>
                    <li>
                        <span className="activity-list__icon">
                            <i className="fas fa-shield-halved"></i>
                        </span>
                        <div>
                            <strong>
                                {account.mfaRequired
                                    ? 'Exigida pelo perfil'
                                    : 'Não exigida neste perfil'}
                            </strong>
                            <span>Verificação em duas etapas</span>
                        </div>
                    </li>
                    <li>
                        <span className="activity-list__icon">
                            <i className="fab fa-google"></i>
                        </span>
                        <div>
                            <strong>
                                {googleOAuthEnabled ? 'Configurado' : 'Não configurado'}
                            </strong>
                            <span>Login por Google Workspace</span>
                        </div>
                    </li>
                </ul>
            </div>

            <div className="acard" style={{ marginTop: '0' }}>
                <div className="acard__head">
                    <div>
                        <h2>Alterar senha</h2>
                        <p>Recomendamos trocar a senha a cada 90 dias.</p>
                    </div>
                </div>

                {account.hasPassword ? (
                    <form action={formAction}>
                        <Feedback state={state} />

                        <div className="afield">
                            <label htmlFor="senha-atual">Senha atual</label>
                            <input
                                id="senha-atual"
                                name="currentPassword"
                                type="password"
                                autoComplete="current-password"
                            />
                            <FieldError message={state.fieldErrors?.currentPassword} />
                        </div>
                        <div className="afield">
                            <label htmlFor="senha-nova">Nova senha</label>
                            <input
                                id="senha-nova"
                                name="newPassword"
                                type="password"
                                autoComplete="new-password"
                            />
                            <span className="afield__hint">Mínimo de 10 caracteres.</span>
                            <FieldError message={state.fieldErrors?.newPassword} />
                        </div>
                        <div className="afield">
                            <label htmlFor="senha-confirma">Confirmar nova senha</label>
                            <input
                                id="senha-confirma"
                                name="confirmPassword"
                                type="password"
                                autoComplete="new-password"
                            />
                            <FieldError message={state.fieldErrors?.confirmPassword} />
                        </div>

                        <button className="abtn abtn--primary abtn--block" disabled={pending}>
                            <i className="fas fa-key"></i>{' '}
                            {pending ? 'Atualizando…' : 'Atualizar senha'}
                        </button>

                        <span
                            className="afield__hint"
                            style={{ display: 'block', marginTop: '0.75rem' }}
                        >
                            Ao trocar a senha, as demais sessões abertas são encerradas.
                        </span>
                    </form>
                ) : (
                    <div className="aempty">
                        <i className="fab fa-google"></i>
                        <strong>Conta sem senha local</strong>
                        <span>
                            Este acesso entra apenas por Google Workspace, então não há senha para
                            trocar aqui.
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
