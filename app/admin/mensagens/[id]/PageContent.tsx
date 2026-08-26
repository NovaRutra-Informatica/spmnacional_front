'use client';

import Link from 'next/link';
import { useActionState, useMemo } from 'react';
import type { ContactStatus } from '@/lib/generated/prisma/enums';
import { CONTACT_STATUS_CLASS, CONTACT_STATUS_LABEL } from '@/lib/labels';
import { salvarMensagem } from '../actions';

/** Espelha `ActionState` do servidor — o módulo original é server-only. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

interface MessageDetail {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    city: string | null;
    subject: string;
    language: string;
    body: string;
    status: ContactStatus;
    internalNote: string;
    assignedToId: string;
    assignedToName: string | null;
    respondedAt: string | null;
    createdAt: string;
    updatedAt: string;
    ip: string | null;
    userAgent: string | null;
}

interface UserOption {
    id: string;
    name: string;
    email: string;
    /** Conta desativada que continua na lista por já ser a responsável. */
    inactive: boolean;
}

interface PageContentProps {
    message: MessageDetail;
    users: UserOption[];
}

const STATUS_OPTIONS: ContactStatus[] = ['NOVA', 'EM_ATENDIMENTO', 'RESPONDIDA', 'ARQUIVADA'];

export default function PageContent({ message, users }: PageContentProps) {
    const [state, formAction, pending] = useActionState<FormState, FormData>(salvarMensagem, {
        ok: false,
    });

    // Resposta sai pelo cliente de e-mail da pessoa: o painel não envia por ela.
    const mailtoHref = useMemo(() => {
        const subject = `Re: ${message.subject}`;
        const body = [
            `Olá, ${message.name}.`,
            '',
            'Recebemos a sua mensagem enviada pelo site do Serviço Pastoral dos Migrantes.',
            '',
            '---',
            message.body,
            '---',
            '',
            'Atenciosamente,',
            'Serviço Pastoral dos Migrantes',
        ].join('\n');

        return `mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(
            subject,
        )}&body=${encodeURIComponent(body)}`;
    }, [message.body, message.email, message.name, message.subject]);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> /{' '}
                        <Link href="/admin/mensagens">Mensagens</Link>
                    </div>
                    <h1>{message.subject}</h1>
                    <p>
                        Recebida em {message.createdAt} · idioma informado: {message.language}
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/admin/mensagens">
                        <i className="fas fa-arrow-left"></i> Voltar
                    </Link>
                    <a className="abtn abtn--action" href={mailtoHref}>
                        <i className="fas fa-reply"></i> Responder por e-mail
                    </a>
                </div>
            </div>

            {state.message && (
                <div className={state.ok ? 'anote anote--success' : 'anote anote--warning'}>
                    <i
                        className={`fas ${state.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}
                    ></i>
                    <div>{state.message}</div>
                </div>
            )}

            <div className="agrid agrid--sidebar">
                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>Mensagem</h2>
                                <p>Texto exatamente como foi enviado pelo formulário.</p>
                            </div>
                            <span className={CONTACT_STATUS_CLASS[message.status]}>
                                {CONTACT_STATUS_LABEL[message.status]}
                            </span>
                        </div>

                        <ul className="activity-list">
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-user"></i>
                                </span>
                                <div>
                                    <strong>{message.name}</strong>
                                    <span>Nome informado</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-envelope"></i>
                                </span>
                                <div>
                                    <strong>
                                        <a href={`mailto:${message.email}`}>{message.email}</a>
                                    </strong>
                                    <span>E-mail para resposta</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-phone"></i>
                                </span>
                                <div>
                                    <strong>{message.phone || 'Não informado'}</strong>
                                    <span>Telefone</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-location-dot"></i>
                                </span>
                                <div>
                                    <strong>{message.city || 'Não informada'}</strong>
                                    <span>Cidade</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-language"></i>
                                </span>
                                <div>
                                    <strong>{message.language}</strong>
                                    <span>Idioma preferido</span>
                                </div>
                            </li>
                        </ul>

                        <p
                            style={{
                                whiteSpace: 'pre-wrap',
                                marginTop: '1.25rem',
                                marginBottom: 0,
                                fontSize: '0.92rem',
                                lineHeight: 1.8,
                                color: '#46586a',
                            }}
                        >
                            {message.body}
                        </p>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Origem do envio</h3>
                                <p>Guardado apenas para identificar abuso do formulário.</p>
                            </div>
                        </div>

                        <ul className="activity-list">
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-network-wired"></i>
                                </span>
                                <div>
                                    <strong>{message.ip ?? 'IP não registrado'}</strong>
                                    <span>Endereço de origem</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-desktop"></i>
                                </span>
                                <div>
                                    <strong>
                                        {message.userAgent ?? 'Navegador não registrado'}
                                    </strong>
                                    <span>Navegador informado</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-clock-rotate-left"></i>
                                </span>
                                <div>
                                    <strong>{message.updatedAt}</strong>
                                    <span>Última alteração no registro</span>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>

                <div>
                    <form action={formAction}>
                        <input type="hidden" name="id" value={message.id} />

                        <div className="acard">
                            <div className="acard__head">
                                <div>
                                    <h3>Atendimento</h3>
                                    <p>Responsável, status e registro interno.</p>
                                </div>
                            </div>

                            <div className="afield">
                                <label htmlFor="assignedToId">Responsável</label>
                                <select
                                    id="assignedToId"
                                    name="assignedToId"
                                    defaultValue={message.assignedToId}
                                >
                                    <option value="">Sem responsável definido</option>
                                    {users.map((option) => (
                                        <option value={option.id} key={option.id}>
                                            {option.name} ({option.email})
                                            {option.inactive ? ' — conta inativa' : ''}
                                        </option>
                                    ))}
                                </select>
                                {state.fieldErrors?.assignedToId && (
                                    <span className="afield__hint" style={{ color: '#c2185b' }}>
                                        {state.fieldErrors.assignedToId}
                                    </span>
                                )}
                            </div>

                            <div className="afield">
                                <label htmlFor="status">Status</label>
                                <select id="status" name="status" defaultValue={message.status}>
                                    {STATUS_OPTIONS.map((option) => (
                                        <option value={option} key={option}>
                                            {CONTACT_STATUS_LABEL[option]}
                                        </option>
                                    ))}
                                </select>
                                {state.fieldErrors?.status && (
                                    <span className="afield__hint" style={{ color: '#c2185b' }}>
                                        {state.fieldErrors.status}
                                    </span>
                                )}
                            </div>

                            <div className="afield">
                                <label htmlFor="internalNote">Nota interna</label>
                                <textarea
                                    id="internalNote"
                                    name="internalNote"
                                    defaultValue={message.internalNote}
                                    placeholder="O que foi verificado, para quem foi encaminhado, o que ficou combinado…"
                                ></textarea>
                                <span className="afield__hint">
                                    Visível apenas para a equipe do painel.
                                </span>
                                {state.fieldErrors?.internalNote && (
                                    <span className="afield__hint" style={{ color: '#c2185b' }}>
                                        {state.fieldErrors.internalNote}
                                    </span>
                                )}
                            </div>

                            <label className="aswitch" style={{ marginBottom: '1.25rem' }}>
                                <input
                                    type="checkbox"
                                    name="marcarRespondida"
                                    defaultChecked={Boolean(message.respondedAt)}
                                />
                                <span className="aswitch__track"></span>
                                <span className="aswitch__label">
                                    Marcar como respondida
                                    {message.respondedAt ? ` (em ${message.respondedAt})` : ''}
                                </span>
                            </label>

                            <button className="abtn abtn--action abtn--block" disabled={pending}>
                                <i className="fas fa-floppy-disk"></i>{' '}
                                {pending ? 'Salvando…' : 'Salvar atendimento'}
                            </button>
                        </div>
                    </form>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Situação atual</h3>
                            </div>
                        </div>

                        <ul className="activity-list">
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-user-check"></i>
                                </span>
                                <div>
                                    <strong>{message.assignedToName ?? 'Sem responsável'}</strong>
                                    <span>Responsável atual</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-reply"></i>
                                </span>
                                <div>
                                    <strong>{message.respondedAt ?? 'Ainda sem resposta'}</strong>
                                    <span>Marcada como respondida em</span>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </>
    );
}
