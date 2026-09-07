'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import PageHero from '@/components/PageHero';
import { definirSenha } from './actions';

/**
 * O tipo do estado é declarado aqui porque `lib/server/actions` é `server-only`
 * e não pode ser importado por um Client Component.
 */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

interface PageContentProps {
    token: string;
    nome: string;
    email: string;
    papel: string;
}

export default function PageContent({ token, nome, email, papel }: PageContentProps) {
    const [state, formAction, pending] = useActionState<FormState, FormData>(definirSenha, {
        ok: false,
    });

    const [showPassword, setShowPassword] = useState(false);

    const togglePassword = () => {
        setShowPassword(!showPassword);
    };

    return (
        <>
            <PageHero
                eyebrow="Área restrita"
                title="Ativar seu acesso"
                subtitle="Defina uma senha para começar a usar o painel do SPM."
                crumbs={[{ label: 'Ativar acesso' }]}
                center
                waveFill="#f8f9fa"
            />

            <section className="section section--light">
                <div className="container">
                    <div style={{ maxWidth: '480px', margin: '0 auto' }}>
                        <div className="form-card">
                            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                                <div
                                    className="card__icon card__icon--initials"
                                    style={{
                                        margin: '0 auto 1.25rem',
                                        width: '68px',
                                        height: '68px',
                                        fontSize: '1.4rem',
                                    }}
                                >
                                    <i className="fas fa-user-check"></i>
                                </div>
                                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                                    Olá, {nome}
                                </h2>
                                <p
                                    style={{
                                        color: 'var(--color-text-muted)',
                                        fontSize: '0.92rem',
                                        margin: '0',
                                    }}
                                >
                                    Seu acesso será criado para <strong>{email}</strong> com o
                                    perfil <strong>{papel}</strong>. Escolha uma senha de pelo menos
                                    12 caracteres.
                                </p>
                            </div>

                            {state.message && (
                                <div
                                    className="callout callout--action"
                                    style={{ margin: '0 0 1.5rem', padding: '1rem 1.25rem' }}
                                >
                                    <i className="fas fa-triangle-exclamation"></i>
                                    <p>{state.message}</p>
                                </div>
                            )}

                            <form action={formAction}>
                                <input type="hidden" name="token" value={token} />

                                <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                                    <div className="form-field">
                                        <label htmlFor="senha">Nova senha</label>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                id="senha"
                                                name="senha"
                                                autoComplete="new-password"
                                                type={showPassword ? 'text' : 'password'}
                                                defaultValue=""
                                                placeholder="••••••••••"
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle"
                                                onClick={togglePassword}
                                                aria-label={
                                                    showPassword ? 'Ocultar senha' : 'Mostrar senha'
                                                }
                                            >
                                                <i
                                                    className={`fas ${
                                                        showPassword ? 'fa-eye-slash' : 'fa-eye'
                                                    }`}
                                                ></i>
                                            </button>
                                        </div>
                                        {state.fieldErrors?.senha ? (
                                            <span
                                                className="form-field__hint"
                                                style={{ color: 'var(--color-action)' }}
                                            >
                                                {state.fieldErrors.senha}
                                            </span>
                                        ) : (
                                            <span className="form-field__hint">
                                                Use pelo menos 10 caracteres, misturando letras,
                                                números e símbolos.
                                            </span>
                                        )}
                                    </div>

                                    <div className="form-field">
                                        <label htmlFor="confirmacao">Repita a senha</label>
                                        <input
                                            id="confirmacao"
                                            name="confirmacao"
                                            autoComplete="new-password"
                                            type={showPassword ? 'text' : 'password'}
                                            defaultValue=""
                                            placeholder="••••••••••"
                                        />
                                        {state.fieldErrors?.confirmacao && (
                                            <span
                                                className="form-field__hint"
                                                style={{ color: 'var(--color-action)' }}
                                            >
                                                {state.fieldErrors.confirmacao}
                                            </span>
                                        )}
                                    </div>

                                    <div className="form-field">
                                        <button
                                            type="submit"
                                            className="btn btn--primary btn--block"
                                            disabled={pending}
                                        >
                                            {pending ? (
                                                <>
                                                    <i className="fas fa-circle-notch fa-spin"></i>{' '}
                                                    Ativando…
                                                </>
                                            ) : (
                                                <>
                                                    <i className="fas fa-right-to-bracket"></i>{' '}
                                                    Ativar acesso
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </form>

                            <div
                                style={{
                                    marginTop: '1.75rem',
                                    paddingTop: '1.5rem',
                                    borderTop: '1px solid #f0f0f0',
                                    textAlign: 'center',
                                }}
                            >
                                <p
                                    style={{
                                        fontSize: '0.88rem',
                                        color: 'var(--color-text-muted)',
                                        margin: '0',
                                    }}
                                >
                                    Não reconhece este convite?{' '}
                                    <Link
                                        href="/fale-conosco"
                                        style={{
                                            color: 'var(--color-action)',
                                            fontWeight: '600',
                                        }}
                                    >
                                        Fale com a coordenação
                                    </Link>
                                </p>
                            </div>
                        </div>

                        <div className="callout" style={{ marginTop: '2rem' }}>
                            <i className="fas fa-shield-halved"></i>
                            <p>
                                <strong>Sua senha é pessoal e intransferível.</strong> O acesso ao
                                painel é individual e registrado — nunca compartilhe suas
                                credenciais, nem mesmo com colegas da equipe.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
