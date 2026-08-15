'use client';

import { useActionState, useEffect } from 'react';
import { salvarPrograma } from '../actions';

/** Espelha `ActionState` do servidor — o módulo original é server-only. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

export interface ProgramaDefaults {
    id: string;
    dia: string;
    title: string;
    text: string;
    order: number;
}

interface ProgramaFormProps {
    edicaoId: string;
    defaults: ProgramaDefaults;
    onDone: () => void;
}

export default function ProgramaForm({ edicaoId, defaults, onDone }: ProgramaFormProps) {
    const [state, formAction, pending] = useActionState<FormState, FormData>(salvarPrograma, {
        ok: false,
    });

    // Terminada a edição, o formulário volta a ser o de nova atividade — assim
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
                    <label htmlFor="programa-dia">Dia</label>
                    <input
                        id="programa-dia"
                        name="dia"
                        type="text"
                        defaultValue={defaults.dia}
                        placeholder="Domingo, 14/06"
                    />
                    {state.fieldErrors?.dia && (
                        <span className="afield__hint" style={{ color: '#c2185b' }}>
                            {state.fieldErrors.dia}
                        </span>
                    )}
                </div>

                <div className="afield">
                    <label htmlFor="programa-order">Ordem</label>
                    <input
                        id="programa-order"
                        name="order"
                        type="number"
                        defaultValue={defaults.order}
                    />
                    <span className="afield__hint">Menor número aparece primeiro.</span>
                </div>
            </div>

            <div className="afield">
                <label htmlFor="programa-title">Atividade</label>
                <input
                    id="programa-title"
                    name="title"
                    type="text"
                    defaultValue={defaults.title}
                    placeholder="Abertura"
                />
                {state.fieldErrors?.title && (
                    <span className="afield__hint" style={{ color: '#c2185b' }}>
                        {state.fieldErrors.title}
                    </span>
                )}
            </div>

            <div className="afield">
                <label htmlFor="programa-text">Descrição</label>
                <textarea
                    id="programa-text"
                    name="text"
                    defaultValue={defaults.text}
                    style={{ minHeight: '110px' }}
                    placeholder="Missa de abertura no Santuário Nacional de Aparecida."
                ></textarea>
                {state.fieldErrors?.text && (
                    <span className="afield__hint" style={{ color: '#c2185b' }}>
                        {state.fieldErrors.text}
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="abtn abtn--action" disabled={pending}>
                    <i className="fas fa-floppy-disk"></i>{' '}
                    {pending
                        ? 'Salvando…'
                        : defaults.id
                          ? 'Salvar atividade'
                          : 'Adicionar atividade'}
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
