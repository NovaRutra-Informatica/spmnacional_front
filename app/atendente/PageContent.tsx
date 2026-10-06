'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import PageHero from '@/components/PageHero';
import { entrarLocal } from './actions';
import { INSTITUTIONAL_LOGO, INSTITUTIONAL_LOGO_ALT } from '@/lib/content/branding';

interface PageContentProps {
    googleEnabled: boolean;
    proximo: string;
    erroInicial?: string;
    localTestAccount?: { name: string; email: string } | null;
}

export default function PageContent({
    googleEnabled,
    erroInicial,
    proximo,
    localTestAccount,
}: PageContentProps) {
    const [state, formAction, pending] = useActionState(entrarLocal, { ok: false });
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
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={INSTITUTIONAL_LOGO}
                                    alt={INSTITUTIONAL_LOGO_ALT}
                                    width={108}
                                    height={108}
                                    style={{ display: 'block', margin: '0 auto 1.25rem', objectFit: 'contain' }}
                                />
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
                                    {localTestAccount
                                        ? 'O acesso de teste está habilitado somente neste ambiente local.'
                                        : 'Entre com seu e-mail institucional autorizado no Google Workspace.'}
                                </p>
                            </div>

                            {error && (
                                <div
                                    className="callout callout--action"
                                    role="alert"
                                    style={{ margin: '0 0 1.5rem', padding: '1rem 1.25rem' }}
                                >
                                    <i className="fas fa-triangle-exclamation"></i>
                                    <p>{error}</p>
                                </div>
                            )}

                            {localTestAccount ? (
                                <form action={formAction}>
                                    <input type="hidden" name="proximo" value={proximo} />
                                    <div className="callout local-test-access" role="status">
                                        <p>
                                            <strong>Acesso local de teste</strong>
                                            <br />
                                            Conta: {localTestAccount.name} ({localTestAccount.email}
                                            ). As alterações serão salvas no banco deste ambiente.
                                        </p>
                                    </div>
                                    <button
                                        className="btn btn--primary btn--block"
                                        type="submit"
                                        disabled={pending}
                                        aria-busy={pending}
                                    >
                                        {pending ? 'Entrando…' : 'Entrar no ambiente local'}
                                    </button>
                                </form>
                            ) : googleEnabled ? (
                                <a className="btn btn--primary btn--block" href="/api/auth/google">
                                    <i className="fab fa-google" aria-hidden="true"></i> Entrar com
                                    Google Workspace
                                </a>
                            ) : (
                                <div className="callout" role="status">
                                    <p>
                                        O acesso institucional ainda está sendo configurado. Fale
                                        com a coordenação.
                                    </p>
                                </div>
                            )}
                            <p
                                style={{
                                    marginTop: '1rem',
                                    color: 'var(--color-text-muted)',
                                    fontSize: '0.88rem',
                                }}
                            >
                                {localTestAccount
                                    ? 'Sessão de teste de até uma hora. Este acesso não funciona na nuvem; lá será exigida a conta Google Workspace.'
                                    : 'Não há senha local. A verificação em duas etapas é administrada pela organização no Google Workspace.'}
                            </p>

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
                                    Ainda não tem autorização de acesso?{' '}
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
