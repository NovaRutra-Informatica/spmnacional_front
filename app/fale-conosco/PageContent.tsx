'use client';
import { TranslatedContent } from '@/components/TranslationProvider';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
    contactAttemptFingerprint,
    newContactSubmissionKey,
} from '@/lib/config/contact-submission';
import { useRouter } from 'next/navigation';
import { usePublicTranslation } from '@/components/TranslationProvider';
import { localizeHref } from '@/lib/i18n/links';
import {
    CONTACT_FAQS,
    CONTACT_RESPONSE_MESSAGE,
    directionsUrl,
    NATIONAL_OFFICE_ADDRESS,
} from '@/lib/content/contact';
import Link from '@/components/LocalizedLink';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import { enviarMensagem } from './actions';
import { CONTACT_LANGUAGES, CONTACT_SUBJECTS, DEFAULT_CONTACT_LANGUAGE } from './options';

/** O tipo do estado é redeclarado aqui porque `lib/server/actions` é `server-only`. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

interface SubmittedValues {
    name?: string;
    email?: string;
    phone?: string;
    city?: string;
    subject?: string;
    language?: string;
    message?: string;
}

const ERROR_STYLE = { color: '#c2185b' };

export default function PageContent() {
    const router = useRouter();
    const { locale } = usePublicTranslation();
    const [openFaq, setOpenFaq] = useState<number | null>(null);
    const [idempotencyKey, setIdempotencyKey] = useState('');
    const attemptedPayload = useRef<string | null>(null);
    const [state, formAction, pending] = useActionState<FormState, FormData>(enviarMensagem, {
        ok: false,
    });

    useEffect(() => {
        if (state.ok) router.replace(localizeHref('/fale-conosco/obrigado', locale));
    }, [state.ok, router, locale]);

    useEffect(() => {
        // Uma chave nova só nasce no navegador; gerar no SSR causaria divergência de hidratação.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIdempotencyKey(newContactSubmissionKey());
    }, []);

    const prepareNewSubmission = () => {
        attemptedPayload.current = null;
        setIdempotencyKey(newContactSubmissionKey());
    };

    const toggleFaq = (i: number) => {
        setOpenFaq(openFaq === i ? null : i);
    };

    // Quando a validação recusa o envio, a ação devolve o que foi digitado para
    // que ninguém precise reescrever a mensagem inteira.
    const values = (state.data?.values ?? {}) as SubmittedValues;
    const errors = state.fieldErrors ?? {};

    return (
        <TranslatedContent>
            {
                <>
                    <PageHero
                        eyebrow="Atendimento"
                        title="Fale conosco"
                        subtitle="Se você migrou e precisa de orientação, se quer ajudar ou se representa uma instituição: esta porta está aberta. O atendimento é gratuito e sigiloso."
                        crumbs={[{ label: 'Fale conosco' }]}
                    />

                    <section className="section">
                        <div className="container with-aside">
                            <Animate>
                                <div className="section-head">
                                    <span className="eyebrow">Envie sua mensagem</span>
                                    <h2>Como podemos ajudar?</h2>
                                    <p>
                                        {CONTACT_RESPONSE_MESSAGE} Para consultar atendimento na sua
                                        região, entre em contato com o secretariado nacional ou
                                        procure a equipe regional mais próxima.
                                    </p>
                                </div>

                                {state.ok ? (
                                    <div className="callout">
                                        <i className="fas fa-circle-check"></i>
                                        <p>
                                            <strong>Mensagem enviada.</strong> {state.message} Se a
                                            sua situação for urgente, veja em{' '}
                                            <Link href="/onde-estamos">Onde estamos</Link> qual
                                            equipe regional está mais perto de você.
                                        </p>
                                    </div>
                                ) : (
                                    <form
                                        id="formulario"
                                        className="form-card"
                                        action={formAction}
                                        aria-busy={pending}
                                        onSubmit={(event) => {
                                            attemptedPayload.current = contactAttemptFingerprint(
                                                new FormData(event.currentTarget),
                                            );
                                        }}
                                        onChange={(event) => {
                                            if (
                                                attemptedPayload.current !== null &&
                                                attemptedPayload.current !==
                                                    contactAttemptFingerprint(
                                                        new FormData(event.currentTarget),
                                                    )
                                            ) {
                                                prepareNewSubmission();
                                            }
                                        }}
                                    >
                                        <input
                                            type="hidden"
                                            name="idempotencyKey"
                                            value={idempotencyKey}
                                        />
                                        {state.message && (
                                            <div className="callout callout--action">
                                                <i className="fas fa-triangle-exclamation"></i>
                                                <p>{state.message}</p>
                                            </div>
                                        )}

                                        {errors.idempotencyKey && (
                                            <div className="callout" role="alert">
                                                <p>{errors.idempotencyKey}</p>
                                                <button
                                                    type="button"
                                                    className="btn btn--outline"
                                                    onClick={prepareNewSubmission}
                                                    disabled={pending}
                                                >
                                                    Preparar novo envio
                                                </button>
                                            </div>
                                        )}
                                        <fieldset
                                            className="form-grid contact-form-fields"
                                            disabled={pending}
                                        >
                                            <legend className="sr-only">
                                                Mensagem para o secretariado nacional
                                            </legend>
                                            <div className="form-field">
                                                <label htmlFor="nome">Nome</label>
                                                <input
                                                    id="nome"
                                                    aria-invalid={Boolean(errors.name)}
                                                    aria-describedby={
                                                        errors.name ? 'error-name' : undefined
                                                    }
                                                    name="name"
                                                    autoComplete="name"
                                                    type="text"
                                                    placeholder="Como podemos chamar você?"
                                                    defaultValue={values.name ?? ''}
                                                    required
                                                />
                                                {errors.name && (
                                                    <span
                                                        id="error-name"
                                                        className="form-field__hint"
                                                        style={ERROR_STYLE}
                                                    >
                                                        {errors.name}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="form-field">
                                                <label htmlFor="email">E-mail</label>
                                                <input
                                                    id="email"
                                                    aria-invalid={Boolean(errors.email)}
                                                    aria-describedby={
                                                        errors.email ? 'error-email' : undefined
                                                    }
                                                    name="email"
                                                    autoComplete="email"
                                                    type="email"
                                                    placeholder="voce@email.com"
                                                    defaultValue={values.email ?? ''}
                                                    required
                                                />
                                                {errors.email && (
                                                    <span
                                                        id="error-email"
                                                        className="form-field__hint"
                                                        style={ERROR_STYLE}
                                                    >
                                                        {errors.email}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="form-field">
                                                <label htmlFor="telefone">
                                                    Telefone ou WhatsApp
                                                </label>
                                                <input
                                                    id="telefone"
                                                    aria-invalid={Boolean(errors.phone)}
                                                    aria-describedby={
                                                        errors.phone ? 'error-phone' : undefined
                                                    }
                                                    name="phone"
                                                    autoComplete="tel"
                                                    type="tel"
                                                    placeholder="(00) 00000-0000"
                                                    defaultValue={values.phone ?? ''}
                                                />
                                                {errors.phone && (
                                                    <span
                                                        id="error-phone"
                                                        className="form-field__hint"
                                                        style={ERROR_STYLE}
                                                    >
                                                        {errors.phone}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="form-field">
                                                <label htmlFor="cidade">Cidade e estado</label>
                                                <input
                                                    id="cidade"
                                                    aria-invalid={Boolean(errors.city)}
                                                    aria-describedby={
                                                        errors.city ? 'error-city' : undefined
                                                    }
                                                    name="city"
                                                    autoComplete="address-level2"
                                                    type="text"
                                                    placeholder="Ex.: Boa Vista — RR"
                                                    defaultValue={values.city ?? ''}
                                                />
                                                {errors.city && (
                                                    <span
                                                        id="error-city"
                                                        className="form-field__hint"
                                                        style={ERROR_STYLE}
                                                    >
                                                        {errors.city}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="form-field is-full">
                                                <label htmlFor="assunto">Assunto</label>
                                                <select
                                                    id="assunto"
                                                    aria-invalid={Boolean(errors.subject)}
                                                    aria-describedby={
                                                        errors.subject ? 'error-subject' : undefined
                                                    }
                                                    name="subject"
                                                    defaultValue={values.subject ?? ''}
                                                    required
                                                >
                                                    <option value="">
                                                        Selecione o motivo do contato
                                                    </option>
                                                    {CONTACT_SUBJECTS.map((subject) => (
                                                        <option key={subject} value={subject}>
                                                            {subject}
                                                        </option>
                                                    ))}
                                                </select>
                                                {errors.subject && (
                                                    <span
                                                        id="error-subject"
                                                        className="form-field__hint"
                                                        style={ERROR_STYLE}
                                                    >
                                                        {errors.subject}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="form-field is-full">
                                                <label htmlFor="idioma">
                                                    Idioma preferido para resposta
                                                </label>
                                                <select
                                                    id="idioma"
                                                    aria-invalid={Boolean(errors.language)}
                                                    aria-describedby={
                                                        errors.language
                                                            ? 'error-language'
                                                            : undefined
                                                    }
                                                    name="language"
                                                    defaultValue={
                                                        values.language ?? DEFAULT_CONTACT_LANGUAGE
                                                    }
                                                >
                                                    {CONTACT_LANGUAGES.map((language) => (
                                                        <option key={language} value={language}>
                                                            {language}
                                                        </option>
                                                    ))}
                                                </select>
                                                {errors.language && (
                                                    <span
                                                        id="error-language"
                                                        className="form-field__hint"
                                                        style={ERROR_STYLE}
                                                    >
                                                        {errors.language}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="form-field is-full">
                                                <label htmlFor="mensagem">Mensagem</label>
                                                <textarea
                                                    id="mensagem"
                                                    aria-invalid={Boolean(errors.message)}
                                                    aria-describedby={
                                                        errors.message ? 'error-message' : undefined
                                                    }
                                                    name="message"
                                                    placeholder="Conte com suas palavras o que está acontecendo. Não precisa se preocupar com a escrita."
                                                    defaultValue={values.message ?? ''}
                                                    required
                                                ></textarea>
                                                {errors.message && (
                                                    <span
                                                        id="error-message"
                                                        className="form-field__hint"
                                                        style={ERROR_STYLE}
                                                    >
                                                        {errors.message}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Isca para robôs de spam: invisível e fora da ordem de tabulação. */}
                                            <input
                                                type="text"
                                                name="website"
                                                tabIndex={-1}
                                                autoComplete="off"
                                                aria-hidden="true"
                                                style={{ display: 'none' }}
                                            />

                                            <div className="form-field is-full">
                                                <button
                                                    type="submit"
                                                    className="btn btn--cta btn--block"
                                                    disabled={pending || !idempotencyKey}
                                                >
                                                    <i className="fas fa-paper-plane"></i>{' '}
                                                    {pending ? 'Enviando…' : 'Enviar mensagem'}
                                                </button>
                                                <span className="form-field__hint">
                                                    Sua mensagem vai direto para a equipe do
                                                    secretariado nacional. Ao enviar, você concorda
                                                    com nossa{' '}
                                                    <Link href="/politica-de-privacidade">
                                                        Política de Privacidade
                                                    </Link>
                                                    .
                                                </span>
                                            </div>
                                        </fieldset>
                                    </form>
                                )}
                            </Animate>

                            <aside className="aside-sticky">
                                <div className="aside-box">
                                    <h4>Secretariado nacional</h4>

                                    <div className="contact-item">
                                        <span className="contact-item__icon">
                                            <i className="fas fa-location-dot"></i>
                                        </span>
                                        <div>
                                            <strong>Endereço</strong>
                                            <p>
                                                Rua Caiambé, 126 — Ipiranga
                                                <br />
                                                São Paulo — SP · CEP 04264-060
                                            </p>
                                        </div>
                                    </div>

                                    <div className="contact-item">
                                        <span className="contact-item__icon">
                                            <i className="fas fa-phone"></i>
                                        </span>
                                        <div>
                                            <strong>Telefone</strong>
                                            <p>
                                                <a href="tel:+551120637064">(11) 2063-7064</a>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="contact-item">
                                        <span className="contact-item__icon">
                                            <i className="fas fa-envelope"></i>
                                        </span>
                                        <div>
                                            <strong>E-mail geral</strong>
                                            <p>
                                                <a href="mailto:contato@spmnacional.org.br">
                                                    contato@spmnacional.org.br
                                                </a>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="contact-item" style={{ marginBottom: '0' }}>
                                        <span className="contact-item__icon">
                                            <i className="fas fa-clock"></i>
                                        </span>
                                        <div>
                                            <strong>Atendimento</strong>
                                            <p>Segunda a sexta, das 9h às 17h</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="aside-box">
                                    <h4>E-mails por assunto</h4>
                                    <ul>
                                        <li>
                                            <strong>Secretaria:</strong>{' '}
                                            secretaria@spmnacional.org.br
                                        </li>
                                        <li>
                                            <strong>Editais:</strong> editais@spmnacional.org.br
                                        </li>
                                        <li>
                                            <strong>Imprensa:</strong>{' '}
                                            comunicacao@spmnacional.org.br
                                        </li>
                                        <li>
                                            <strong>Testemunhos:</strong>{' '}
                                            testemunhos@spmnacional.org.br
                                        </li>
                                        <li>
                                            <strong>Transparência:</strong>{' '}
                                            transparencia@spmnacional.org.br
                                        </li>
                                    </ul>
                                </div>
                            </aside>
                        </div>
                    </section>

                    <section className="section section--light">
                        <div className="container">
                            <Animate className="split">
                                <div className="map-placeholder">
                                    <i className="fas fa-map-location-dot"></i>
                                    <strong>Rua Caiambé, 126 — Ipiranga</strong>
                                    <span>São Paulo — SP · CEP 04264-060</span>
                                    <a
                                        href={directionsUrl(NATIONAL_OFFICE_ADDRESS)}
                                        className="btn btn--cta"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        Traçar rota no Google Maps{' '}
                                        <span className="sr-only">(abre em nova aba)</span>
                                    </a>
                                </div>
                                <div className="prose">
                                    <span className="eyebrow">Como chegar</span>
                                    <h2>Visite o secretariado nacional</h2>
                                    <p>
                                        O secretariado fica na região do Ipiranga, em São Paulo. Se
                                        você vem de outra cidade ou precisa de atendimento
                                        presencial, entre em contato antes pelo telefone ou e-mail
                                        para consultar a disponibilidade da equipe.
                                    </p>
                                    <p>
                                        Se o seu caso é urgente e você não está em São Paulo, veja
                                        em <Link href="/onde-estamos">Onde estamos</Link> qual
                                        equipe regional está mais perto de você.
                                    </p>
                                </div>
                            </Animate>
                        </div>
                    </section>

                    <section className="section">
                        <div className="container">
                            <Animate className="section-head section-head--center">
                                <span className="eyebrow">Dúvidas frequentes</span>
                                <h2>Antes de escrever, talvez isto ajude</h2>
                            </Animate>

                            <Animate className="accordion">
                                {CONTACT_FAQS.map((faq, i) => (
                                    <div className="accordion__item" key={faq.question}>
                                        <button
                                            className={`accordion__head${openFaq === i ? ' is-open' : ''}`}
                                            type="button"
                                            aria-expanded={openFaq === i}
                                            aria-controls={`faq-answer-${i}`}
                                            id={`faq-question-${i}`}
                                            onClick={() => toggleFaq(i)}
                                        >
                                            {faq.question}
                                            <i className="fas fa-chevron-down"></i>
                                        </button>
                                        <div
                                            className="accordion__body"
                                            id={`faq-answer-${i}`}
                                            role="region"
                                            aria-labelledby={`faq-question-${i}`}
                                            hidden={openFaq !== i}
                                        >
                                            <p>{faq.answer}</p>
                                        </div>
                                    </div>
                                ))}
                            </Animate>

                            <Animate className="callout callout--action">
                                <i className="fas fa-triangle-exclamation"></i>
                                <p>
                                    <strong>Situação de risco iminente?</strong> Ligue{' '}
                                    <strong>190</strong> (polícia), <strong>180</strong> (Central de
                                    Atendimento à Mulher) ou <strong>100</strong> (Direitos
                                    Humanos). O SPM não é um serviço de emergência — mas
                                    acompanhamos o caso depois, se você nos procurar.
                                </p>
                            </Animate>
                        </div>
                    </section>
                </>
            }
        </TranslatedContent>
    );
}
