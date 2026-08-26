'use client';

import { useActionState } from 'react';
import { inscrever } from '@/app/newsletter/actions';

/** O tipo do estado é redeclarado aqui porque `lib/server/actions` é `server-only`. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const DEFAULT_NOTE = 'Respeitamos sua privacidade. Cancele a qualquer momento.';

export default function NewsletterForm() {
    const [state, formAction, pending] = useActionState<FormState, FormData>(inscrever, {
        ok: false,
    });

    return (
        <form className="news-form" action={formAction}>
            <div className="input-group-modern">
                <input
                    type="email"
                    name="email"
                    placeholder="Digite seu melhor e-mail"
                    aria-label="Seu e-mail"
                    required
                />

                {/* Isca para robôs de spam: invisível e fora da ordem de tabulação. */}
                <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    style={{ display: 'none' }}
                />

                <button type="submit" className="btn-submit" disabled={pending}>
                    {pending ? 'Enviando…' : 'Inscrever-se'} <i className="fas fa-paper-plane"></i>
                </button>
            </div>

            {/* A resposta ocupa o lugar da nota de privacidade para não deslocar o layout. */}
            <p className="privacy-note" aria-live="polite">
                {state.message ?? DEFAULT_NOTE}
            </p>
        </form>
    );
}
