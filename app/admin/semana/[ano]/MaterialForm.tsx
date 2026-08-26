'use client';

import { useActionState, useEffect } from 'react';
import { salvarMaterial } from '../actions';

/** Espelha `ActionState` do servidor — o módulo original é server-only. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

export interface MaterialDefaults {
    id: string;
    icon: string;
    title: string;
    meta: string;
    fileUrl: string;
    mediaId: string;
    order: number;
}

interface MaterialFormProps {
    edicaoId: string;
    defaults: MaterialDefaults;
    mediaOptions: { id: string; label: string }[];
    onDone: () => void;
}

export default function MaterialForm({
    edicaoId,
    defaults,
    mediaOptions,
    onDone,
}: MaterialFormProps) {
    const [state, formAction, pending] = useActionState<FormState, FormData>(salvarMaterial, {
        ok: false,
    });

    // Terminada a edição, o formulário volta a ser o de novo material — assim
    // ninguém salva duas vezes por cima do mesmo registro sem perceber.
    useEffect(() => {
        if (state.ok && defaults.id) {
            onDone();
        }
    }, [state, defaults.id, onDone]);

    // Depois de adicionar, o id devolvido muda e o formulário remonta já limpo.
    return (
        <form action={formAction} key={`${defaults.id}-${String(state.data?.id ?? '')}`}>
            <input type="hidden" name="edicaoId" value={edicaoId} />
            {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

            {state.message && (
                <div className={state.ok ? 'anote anote--success' : 'anote anote--warning'}>
                    <i
                        className={`fas ${state.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}
                    ></i>
                    <div>{state.message}</div>
                </div>
            )}

            <div className="afield-row">
                <div className="afield">
                    <label htmlFor="material-title">Título</label>
                    <input
                        id="material-title"
                        name="title"
                        type="text"
                        defaultValue={defaults.title}
                        placeholder="Texto-base"
                    />
                    {state.fieldErrors?.title && (
                        <span className="afield__hint" style={{ color: '#c2185b' }}>
                            {state.fieldErrors.title}
                        </span>
                    )}
                </div>

                <div className="afield">
                    <label htmlFor="material-meta">Formato</label>
                    <input
                        id="material-meta"
                        name="meta"
                        type="text"
                        defaultValue={defaults.meta}
                        placeholder="PDF · 1,2 MB"
                    />
                    {state.fieldErrors?.meta && (
                        <span className="afield__hint" style={{ color: '#c2185b' }}>
                            {state.fieldErrors.meta}
                        </span>
                    )}
                </div>
            </div>

            <div className="afield-row">
                <div className="afield">
                    <label htmlFor="material-icon">Ícone</label>
                    <input
                        id="material-icon"
                        name="icon"
                        type="text"
                        defaultValue={defaults.icon}
                        placeholder="fa-book-open"
                    />
                    <span className="afield__hint">Nome do ícone Font Awesome.</span>
                    {state.fieldErrors?.icon && (
                        <span className="afield__hint" style={{ color: '#c2185b' }}>
                            {state.fieldErrors.icon}
                        </span>
                    )}
                </div>

                <div className="afield">
                    <label htmlFor="material-order">Ordem</label>
                    <input
                        id="material-order"
                        name="order"
                        type="number"
                        defaultValue={defaults.order}
                    />
                    <span className="afield__hint">Menor número aparece primeiro.</span>
                </div>
            </div>

            <div className="afield">
                <label htmlFor="material-media">Arquivo da biblioteca</label>
                <select id="material-media" name="mediaId" defaultValue={defaults.mediaId}>
                    <option value="">Nenhum arquivo vinculado</option>
                    {mediaOptions.map((option) => (
                        <option value={option.id} key={option.id}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="afield">
                <label htmlFor="material-url">Ou endereço do arquivo</label>
                <input
                    id="material-url"
                    name="fileUrl"
                    type="text"
                    defaultValue={defaults.fileUrl}
                    placeholder="/assets/subsidios/texto-base.pdf"
                />
                {state.fieldErrors?.fileUrl && (
                    <span className="afield__hint" style={{ color: '#c2185b' }}>
                        {state.fieldErrors.fileUrl}
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="abtn abtn--action" disabled={pending}>
                    <i className="fas fa-floppy-disk"></i>{' '}
                    {pending ? 'Salvando…' : defaults.id ? 'Salvar material' : 'Adicionar material'}
                </button>
                {defaults.id && (
                    <button type="button" className="abtn abtn--ghost" onClick={onDone}>
                        Cancelar edição
                    </button>
                )}
            </div>
        </form>
    );
}
