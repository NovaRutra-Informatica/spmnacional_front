'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import type { AgendaSource } from '@/lib/generated/prisma/enums';
import { alternarVisibilidade, excluirEvento, salvarEvento, sincronizarAgora } from './actions';

/** Espelha `ActionState` do servidor — o módulo original é server-only. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

export interface EventRow {
    id: string;
    title: string;
    description: string;
    location: string;
    url: string;
    startsAtInput: string;
    endsAtInput: string;
    startsAtLabel: string;
    endsAtLabel: string;
    allDay: boolean;
    source: AgendaSource;
    published: boolean;
}

interface PageContentProps {
    events: EventRow[];
    counts: {
        proximos: number;
        google: number;
        ocultos: number;
    };
    calendarConfigured: boolean;
}

const EMPTY_EVENT: EventRow = {
    id: '',
    title: '',
    description: '',
    location: '',
    url: '',
    startsAtInput: '',
    endsAtInput: '',
    startsAtLabel: '',
    endsAtLabel: '',
    allDay: false,
    source: 'MANUAL',
    published: true,
};

export default function PageContent({ events, counts, calendarConfigured }: PageContentProps) {
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [state, formAction, pending] = useActionState<FormState, FormData>(salvarEvento, {
        ok: false,
    });

    // Guardamos só o id: a linha vem sempre da lista recém-revalidada, senão o
    // formulário continuaria mostrando os valores anteriores depois de salvar.
    const editando = useMemo(
        () => events.find((item) => item.id === editandoId) ?? null,
        [events, editandoId],
    );

    // Salvou: volta para o formulário de novo evento, já limpo.
    useEffect(() => {
        if (state.ok) {
            setEditandoId(null);
        }
    }, [state]);

    const defaults = editando ?? EMPTY_EVENT;

    const syncHint = calendarConfigured
        ? 'A sincronização roda sozinha de seis em seis horas; use o botão para trazer as mudanças do calendário agora.'
        : 'Configure o calendário do Google no servidor para habilitar a sincronização.';

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> / Conteúdo
                    </div>
                    <h1>Agenda</h1>
                    <p>
                        Encontros, formações e celebrações da rede. Eventos criados aqui convivem
                        com os que vêm do Google Calendar.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/agenda">
                        <i className="fas fa-arrow-up-right-from-square"></i> Ver agenda pública
                    </Link>
                    <form action={sincronizarAgora}>
                        <button
                            className="abtn abtn--ghost"
                            disabled={!calendarConfigured}
                            title={syncHint}
                        >
                            <i className="fas fa-rotate"></i> Sincronizar agora
                        </button>
                    </form>
                </div>
            </div>

            <div className="anote">
                <i className="fas fa-circle-info"></i>
                <div>
                    <strong>Eventos do Google Calendar são somente leitura.</strong> Eles chegam
                    pela sincronização e seriam sobrescritos a cada execução, por isso não podem ser
                    editados nem excluídos por aqui — só ocultados do site. Para mudar título, data
                    ou local, altere o evento no próprio calendário. {syncHint}
                </div>
            </div>

            <div className="agrid agrid--3" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-tile is-success">
                    <span className="stat-tile__icon">
                        <i className="fas fa-calendar-check"></i>
                    </span>
                    <div>
                        <strong>{counts.proximos}</strong>
                        <span>Próximos e publicados</span>
                    </div>
                </div>
                <div className="stat-tile">
                    <span className="stat-tile__icon">
                        <i className="fab fa-google"></i>
                    </span>
                    <div>
                        <strong>{counts.google}</strong>
                        <span>Vindos do Google Calendar</span>
                    </div>
                </div>
                <div className="stat-tile is-warning">
                    <span className="stat-tile__icon">
                        <i className="fas fa-eye-slash"></i>
                    </span>
                    <div>
                        <strong>{counts.ocultos}</strong>
                        <span>Ocultos do site</span>
                    </div>
                </div>
            </div>

            <div className="acard">
                <div className="acard__head">
                    <div>
                        <h2>Eventos cadastrados</h2>
                        <p>Do mais recente para o mais antigo.</p>
                    </div>
                </div>

                {events.length ? (
                    <div className="atable-wrap">
                        <table className="atable">
                            <thead>
                                <tr>
                                    <th>Evento</th>
                                    <th>Início</th>
                                    <th>Término</th>
                                    <th>Origem</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.map((event) => (
                                    <tr key={event.id}>
                                        <td>
                                            <span className="atable__title">{event.title}</span>
                                            <span className="atable__sub">
                                                {event.location || 'Sem local informado'}
                                                {event.allDay ? ' · dia inteiro' : ''}
                                            </span>
                                        </td>
                                        <td>{event.startsAtLabel}</td>
                                        <td>{event.endsAtLabel}</td>
                                        <td>
                                            {event.source === 'GOOGLE_CALENDAR' ? (
                                                <span className="abadge abadge--info">
                                                    Google Calendar
                                                </span>
                                            ) : (
                                                <span className="abadge abadge--rascunho">
                                                    manual
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <span
                                                className={
                                                    event.published
                                                        ? 'abadge abadge--publicado'
                                                        : 'abadge abadge--inativo'
                                                }
                                            >
                                                {event.published ? 'publicado' : 'oculto'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="atable__actions">
                                                <form action={alternarVisibilidade}>
                                                    <input
                                                        type="hidden"
                                                        name="id"
                                                        value={event.id}
                                                    />
                                                    <button
                                                        className="abtn abtn--ghost abtn--sm"
                                                        title={
                                                            event.published
                                                                ? 'Ocultar do site'
                                                                : 'Publicar no site'
                                                        }
                                                    >
                                                        <i
                                                            className={`fas ${
                                                                event.published
                                                                    ? 'fa-eye-slash'
                                                                    : 'fa-eye'
                                                            }`}
                                                        ></i>
                                                    </button>
                                                </form>

                                                <button
                                                    type="button"
                                                    className="abtn abtn--ghost abtn--sm"
                                                    onClick={() => setEditandoId(event.id)}
                                                    disabled={event.source === 'GOOGLE_CALENDAR'}
                                                    title={
                                                        event.source === 'GOOGLE_CALENDAR'
                                                            ? 'Evento sincronizado: edite no Google Calendar'
                                                            : 'Editar evento'
                                                    }
                                                >
                                                    <i className="fas fa-pen"></i>
                                                </button>

                                                {event.source === 'MANUAL' && (
                                                    <form action={excluirEvento}>
                                                        <input
                                                            type="hidden"
                                                            name="id"
                                                            value={event.id}
                                                        />
                                                        <button
                                                            className="abtn abtn--danger abtn--sm"
                                                            title="Excluir evento"
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    </form>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="aempty">
                        <i className="fas fa-calendar-check"></i>
                        <strong>Nenhum evento cadastrado</strong>
                        <span>Use o formulário abaixo para publicar o primeiro.</span>
                    </div>
                )}
            </div>

            <form action={formAction} key={defaults.id || 'novo-evento'}>
                {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

                <div className="acard">
                    <div className="acard__head">
                        <div>
                            <h2>{editando ? 'Editar evento' : 'Novo evento'}</h2>
                            <p>Eventos manuais são os únicos editáveis no painel.</p>
                        </div>
                        {editando && (
                            <button
                                type="button"
                                className="abtn abtn--ghost abtn--sm"
                                onClick={() => setEditandoId(null)}
                            >
                                Cancelar edição
                            </button>
                        )}
                    </div>

                    {state.message && (
                        <div
                            className={state.ok ? 'anote anote--success' : 'anote anote--warning'}
                            style={{ marginTop: 0 }}
                        >
                            <i
                                className={`fas ${
                                    state.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'
                                }`}
                            ></i>
                            <div>{state.message}</div>
                        </div>
                    )}

                    <div className="afield">
                        <label htmlFor="evento-title">Título</label>
                        <input
                            id="evento-title"
                            name="title"
                            type="text"
                            defaultValue={defaults.title}
                            placeholder="Encontro nacional de formação"
                        />
                        {state.fieldErrors?.title && (
                            <span className="afield__hint" style={{ color: '#c2185b' }}>
                                {state.fieldErrors.title}
                            </span>
                        )}
                    </div>

                    <div className="afield-row">
                        <div className="afield">
                            <label htmlFor="evento-startsAt">Início</label>
                            <input
                                id="evento-startsAt"
                                name="startsAt"
                                type="datetime-local"
                                defaultValue={defaults.startsAtInput}
                            />
                            {state.fieldErrors?.startsAt && (
                                <span className="afield__hint" style={{ color: '#c2185b' }}>
                                    {state.fieldErrors.startsAt}
                                </span>
                            )}
                        </div>
                        <div className="afield">
                            <label htmlFor="evento-endsAt">Término</label>
                            <input
                                id="evento-endsAt"
                                name="endsAt"
                                type="datetime-local"
                                defaultValue={defaults.endsAtInput}
                            />
                            {state.fieldErrors?.endsAt && (
                                <span className="afield__hint" style={{ color: '#c2185b' }}>
                                    {state.fieldErrors.endsAt}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="afield-row">
                        <div className="afield">
                            <label htmlFor="evento-location">Local</label>
                            <input
                                id="evento-location"
                                name="location"
                                type="text"
                                defaultValue={defaults.location}
                                placeholder="Santuário Nacional de Aparecida"
                            />
                            {state.fieldErrors?.location && (
                                <span className="afield__hint" style={{ color: '#c2185b' }}>
                                    {state.fieldErrors.location}
                                </span>
                            )}
                        </div>
                        <div className="afield">
                            <label htmlFor="evento-url">Link com mais informações</label>
                            <input
                                id="evento-url"
                                name="url"
                                type="text"
                                defaultValue={defaults.url}
                                placeholder="https://…"
                            />
                            {state.fieldErrors?.url && (
                                <span className="afield__hint" style={{ color: '#c2185b' }}>
                                    {state.fieldErrors.url}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="afield">
                        <label htmlFor="evento-description">Descrição</label>
                        <textarea
                            id="evento-description"
                            name="description"
                            defaultValue={defaults.description}
                            style={{ minHeight: '130px' }}
                            placeholder="O que acontece, quem participa e como se inscrever."
                        ></textarea>
                        {state.fieldErrors?.description && (
                            <span className="afield__hint" style={{ color: '#c2185b' }}>
                                {state.fieldErrors.description}
                            </span>
                        )}
                    </div>

                    <label className="aswitch" style={{ marginBottom: '1.25rem' }}>
                        <input type="checkbox" name="allDay" defaultChecked={defaults.allDay} />
                        <span className="aswitch__track"></span>
                        <span className="aswitch__label">Evento de dia inteiro</span>
                    </label>

                    <label className="aswitch" style={{ marginBottom: '1.25rem' }}>
                        <input
                            type="checkbox"
                            name="published"
                            defaultChecked={defaults.published}
                        />
                        <span className="aswitch__track"></span>
                        <span className="aswitch__label">Exibir no site público</span>
                    </label>

                    <button className="abtn abtn--action" disabled={pending}>
                        <i className="fas fa-floppy-disk"></i>{' '}
                        {pending ? 'Salvando…' : editando ? 'Salvar evento' : 'Criar evento'}
                    </button>
                </div>
            </form>
        </>
    );
}
