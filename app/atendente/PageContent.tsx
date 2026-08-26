'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import PageHero from '@/components/PageHero';
import { entrar } from './actions';

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
    googleEnabled: boolean;
    proximo: string;
    erroInicial?: string;
}

export default function PageContent({ googleEnabled, proximo, erroInicial }: PageContentProps) {
    const [state, formAction, pending] = useActionState<FormState, FormData>(entrar, { ok: false });

    const [email, setEmail] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const togglePassword = () => {
        setShowPassword(!showPassword);
    };

    // O erro do fluxo OAuth chega pela URL; o do formulário, pelo estado da ação.
    const error = state.message ?? erroInicial ?? null;

    return (
        <>
            <PageHero
                eyebrow="Área restrita"
                title="Área do Atendente"
                subtitle="Espaço reservado às equipes do SPM para gestão de conteúdo, registro de atendimentos e acompanhamento de casos."
                crumbs={[{ label: 'Área do Atendente' }]}
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
                                    <i className="fas fa-lock"></i>
                                </div>
                                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                                    Acesso restrito
                                </h2>
                                <p
                                    style={{
                                        color: 'var(--color-text-muted)',
                                        fontSize: '0.92rem',
                                        margin: '0',
                                    }}
                                >
                                    Use as credenciais fornecidas pela coordenação da sua regional.
                                </p>
                            </div>

                            {error && (
                                <div
                                    className="callout callout--action"
                                    style={{ margin: '0 0 1.5rem', padding: '1rem 1.25rem' }}
                                >
                                    <i className="fas fa-triangle-exclamation"></i>
                                    <p>{error}</p>
                                </div>
                            )}

                            <form action={formAction}>
                                <input type="hidden" name="proximo" value={proximo} />

                                <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                                    <div className="form-field">
                                        <label htmlFor="email">Usuário ou e-mail</label>
                                        <input
                                            id="email"
                                            type="text"
                                            name="email"
                                            autoComplete="username"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="seu.usuario"
                                        />
                                    </div>

                                    <div className="form-field">
                                        <label htmlFor="senha">Senha</label>
                                        <div style={{ position: 'relative' }}>
                                            {/*
                                                A senha fica não controlada de propósito: o React
                                                limpa o campo ao concluir a ação, que é justamente
                                                o comportamento desejado depois de um erro.
                                            */}
                                            <input
                                                id="senha"
                                                name="senha"
                                                autoComplete="current-password"
                                                type={showPassword ? 'text' : 'password'}
                                                defaultValue=""
                                                placeholder="••••••••"
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
                                                    Entrando…
                                                </>
                                            ) : (
                                                <>
                                                    <i className="fas fa-right-to-bracket"></i>{' '}
                                                    Entrar
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {googleEnabled && (
                                        <div className="form-field">
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.85rem',
                                                    color: 'var(--color-text-muted)',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '700',
                                                    letterSpacing: '1px',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        flex: '1',
                                                        height: '1px',
                                                        background: '#f0f0f0',
                                                    }}
                                                ></span>
                                                ou
                                                <span
                                                    style={{
                                                        flex: '1',
                                                        height: '1px',
                                                        background: '#f0f0f0',
                                                    }}
                                                ></span>
                                            </div>

                                            <a
                                                className="btn btn--outline btn--block"
                                                href="/api/auth/google"
                                            >
                                                <i className="fab fa-google"></i> Entrar com Google
                                                Workspace
                                            </a>
                                        </div>
                                    )}
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
                                    Esqueceu a senha ou ainda não tem acesso?{' '}
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
                                <strong>Dados de pessoas atendidas são sigilosos.</strong> O acesso
                                a esta área é individual e registrado. Nunca compartilhe suas
                                credenciais nem informações de atendimento fora dos canais oficiais
                                do SPM.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <div className="section-head section-head--center">
                        <span className="eyebrow">Não é da equipe?</span>
                        <h2>Talvez você esteja procurando por aqui</h2>
                    </div>

                    <div className="grid grid--3">
                        <Link className="card" href="/fale-conosco">
                            <div className="card__icon">
                                <i className="fas fa-headset"></i>
                            </div>
                            <h3>Preciso de atendimento</h3>
                            <p>
                                Orientação migratória, denúncias e encaminhamentos. Gratuito e
                                sigiloso.
                            </p>
                            <span className="card__link">
                                Fale conosco <i className="fas fa-arrow-right"></i>
                            </span>
                        </Link>
                        <Link className="card" href="/onde-estamos">
                            <div className="card__icon">
                                <i className="fas fa-map-location-dot"></i>
                            </div>
                            <h3>Onde estamos</h3>
                            <p>Encontre a equipe do SPM mais próxima da sua cidade.</p>
                            <span className="card__link">
                                Ver mapa <i className="fas fa-arrow-right"></i>
                            </span>
                        </Link>
                        <Link className="card" href="/legislacao">
                            <div className="card__icon">
                                <i className="fas fa-scale-balanced"></i>
                            </div>
                            <h3>Meus direitos</h3>
                            <p>
                                O que a lei brasileira garante a quem migra — em linguagem
                                acessível.
                            </p>
                            <span className="card__link">
                                Ver legislação <i className="fas fa-arrow-right"></i>
                            </span>
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
