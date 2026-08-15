'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import { enviarMensagem } from './actions';
import { CONTACT_LANGUAGES, CONTACT_SUBJECTS, DEFAULT_CONTACT_LANGUAGE } from './options';

interface Faq {
    q: string;
    a: string;
}

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

const faqs: Faq[] = [
    {
        q: 'Sou migrante e preciso de ajuda. O SPM atende?',
        a: 'Sim, e o atendimento é gratuito. Orientamos sobre regularização migratória, refúgio, reunião familiar, acesso a serviços públicos e denúncias de violação de direitos. Escreva para nós ou procure a equipe mais próxima na página “Onde estamos”.',
    },
    {
        q: 'O SPM oferece abrigo?',
        a: 'A rede do SPM apoia e articula casas de acolhida em várias cidades, mas a disponibilidade de vagas varia muito conforme o município e o momento. Entre em contato para que possamos indicar o serviço adequado na sua região.',
    },
    {
        q: 'Preciso de advogado. Vocês fornecem?',
        a: 'Oferecemos orientação jurídica inicial e encaminhamos para a Defensoria Pública da União, para núcleos de prática jurídica de universidades e para a rede de advogados parceiros. Não cobramos por nenhuma dessas orientações.',
    },
    {
        q: 'Quero ser voluntário. Como começo?',
        a: 'Escreva contando onde você mora, o que sabe fazer e quanto tempo pode dedicar. Encaminhamos seu contato para a equipe regional mais próxima, que fará a conversa inicial.',
    },
    {
        q: 'Minha paróquia quer iniciar um trabalho com migrantes.',
        a: 'Ótimo. Enviamos material de formação, ajudamos a mapear a presença migrante no território e conectamos sua comunidade à equipe regional do SPM. Comece pelo formulário desta página.',
    },
    {
        q: 'Como solicito uma entrevista ou dados para a imprensa?',
        a: 'Escreva para comunicacao@spmnacional.org.br informando o veículo, a pauta e o prazo. Sempre que possível indicamos porta-vozes das próprias comunidades migrantes.',
    },
];

export default function PageContent() {
    const [openFaq, setOpenFaq] = useState<number | null>(null);
    const [state, formAction, pending] = useActionState<FormState, FormData>(enviarMensagem, {
        ok: false,
    });

    const toggleFaq = (i: number) => {
        setOpenFaq(openFaq === i ? null : i);
    };

    // Quando a validação recusa o envio, a ação devolve o que foi digitado para
    // que ninguém precise reescrever a mensagem inteira.
    const values = (state.data?.values ?? {}) as SubmittedValues;
    const errors = state.fieldErrors ?? {};

    return (
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
                                Respondemos em até 5 dias úteis. Em situações de urgência, ligue
                                diretamente para o secretariado nacional ou procure a equipe
                                regional mais próxima.
                            </p>
                        </div>

                        {state.ok ? (
                            <div className="callout">
                                <i className="fas fa-circle-check"></i>
                                <p>
                                    <strong>Mensagem enviada.</strong> {state.message} Se a sua
                                    situação for urgente, veja em{' '}
                                    <Link href="/onde-estamos">Onde estamos</Link> qual equipe
                                    regional está mais perto de você.
                                </p>
                            </div>
                        ) : (
                            <form className="form-card" action={formAction}>
                                {state.message && (
                                    <div className="callout callout--action">
                                        <i className="fas fa-triangle-exclamation"></i>
                                        <p>{state.message}</p>
                                    </div>
                                )}

                                <div className="form-grid">
                                    <div className="form-field">
                                        <label htmlFor="nome">Nome</label>
                                        <input
                                            id="nome"
                                            name="name"
                                            type="text"
                                            placeholder="Como podemos chamar você?"
                                            defaultValue={values.name ?? ''}
                                            required
                                        />
                                        {errors.name && (
                                            <span className="form-field__hint" style={ERROR_STYLE}>
                                                {errors.name}
                                            </span>
                                        )}
                                    </div>

                                    <div className="form-field">
                                        <label htmlFor="email">E-mail</label>
                                        <input
                                            id="email"
                                            name="email"
                                            type="email"
                                            placeholder="voce@email.com"
                                            defaultValue={values.email ?? ''}
                                            required
                                        />
                                        {errors.email && (
                                            <span className="form-field__hint" style={ERROR_STYLE}>
                                                {errors.email}
                                            </span>
                                        )}
                                    </div>

                                    <div className="form-field">
                                        <label htmlFor="telefone">Telefone ou WhatsApp</label>
                                        <input
                                            id="telefone"
                                            name="phone"
                                            type="tel"
                                            placeholder="(00) 00000-0000"
                                            defaultValue={values.phone ?? ''}
                                        />
                                        {errors.phone && (
                                            <span className="form-field__hint" style={ERROR_STYLE}>
                                                {errors.phone}
                                            </span>
                                        )}
                                    </div>

                                    <div className="form-field">
                                        <label htmlFor="cidade">Cidade e estado</label>
                                        <input
                                            id="cidade"
                                            name="city"
                                            type="text"
                                            placeholder="Ex.: Boa Vista — RR"
                                            defaultValue={values.city ?? ''}
                                        />
                                        {errors.city && (
                                            <span className="form-field__hint" style={ERROR_STYLE}>
                                                {errors.city}
                                            </span>
                                        )}
                                    </div>

                                    <div className="form-field is-full">
                                        <label htmlFor="assunto">Assunto</label>
                                        <select
                                            id="assunto"
                                            name="subject"
                                            defaultValue={values.subject ?? ''}
                                            required
                                        >
                                            <option value="">Selecione o motivo do contato</option>
                                            {CONTACT_SUBJECTS.map((subject) => (
                                                <option key={subject} value={subject}>
                                                    {subject}
                                                </option>
                                            ))}
                                        </select>
                                        {errors.subject && (
                                            <span className="form-field__hint" style={ERROR_STYLE}>
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
                                            <span className="form-field__hint" style={ERROR_STYLE}>
                                                {errors.language}
                                            </span>
                                        )}
                                    </div>

                                    <div className="form-field is-full">
                                        <label htmlFor="mensagem">Mensagem</label>
                                        <textarea
                                            id="mensagem"
                                            name="message"
                                            placeholder="Conte com suas palavras o que está acontecendo. Não precisa se preocupar com a escrita."
                                            defaultValue={values.message ?? ''}
                                            required
                                        ></textarea>
                                        {errors.message && (
                                            <span className="form-field__hint" style={ERROR_STYLE}>
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
                                            disabled={pending}
                                        >
                                            <i className="fas fa-paper-plane"></i>{' '}
                                            {pending ? 'Enviando…' : 'Enviar mensagem'}
                                        </button>
                                        <span className="form-field__hint">
                                            Sua mensagem vai direto para a equipe do secretariado
                                            nacional. Ao enviar, você concorda com nossa{' '}
                                            <Link href="/politica-de-privacidade">
                                                Política de Privacidade
                                            </Link>
                                            .
                                        </span>
                                    </div>
                                </div>
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
                                    <p>(11) 2063-7064</p>
                                </div>
                            </div>

                            <div className="contact-item">
                                <span className="contact-item__icon">
                                    <i className="fas fa-envelope"></i>
                                </span>
                                <div>
                                    <strong>E-mail geral</strong>
                                    <p>contato@spmnacional.org.br</p>
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
                                    <strong>Secretaria:</strong> secretaria@spmnacional.org.br
                                </li>
                                <li>
                                    <strong>Editais:</strong> editais@spmnacional.org.br
                                </li>
                                <li>
                                    <strong>Imprensa:</strong> comunicacao@spmnacional.org.br
                                </li>
                                <li>
                                    <strong>Testemunhos:</strong> testemunhos@spmnacional.org.br
                                </li>
                                <li>
                                    <strong>Transparência:</strong> transparencia@spmnacional.org.br
                                </li>
                            </ul>
                        </div>

                        <div className="aside-box">
                            <h4>Redes sociais</h4>
                            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                <a
                                    className="btn btn--outline btn--sm"
                                    href="#"
                                    onClick={(e) => e.preventDefault()}
                                >
                                    <i className="fab fa-instagram"></i>
                                </a>
                                <a
                                    className="btn btn--outline btn--sm"
                                    href="#"
                                    onClick={(e) => e.preventDefault()}
                                >
                                    <i className="fab fa-facebook-f"></i>
                                </a>
                                <a
                                    className="btn btn--outline btn--sm"
                                    href="#"
                                    onClick={(e) => e.preventDefault()}
                                >
                                    <i className="fab fa-youtube"></i>
                                </a>
                                <a
                                    className="btn btn--outline btn--sm"
                                    href="#"
                                    onClick={(e) => e.preventDefault()}
                                >
                                    <i className="fab fa-whatsapp"></i>
                                </a>
                            </div>
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
                        </div>
                        <div className="prose">
                            <span className="eyebrow">Como chegar</span>
                            <h2>Visite o secretariado nacional</h2>
                            <p>
                                O secretariado fica na região do Ipiranga, em São Paulo. Se você vem
                                de outra cidade ou precisa de atendimento presencial, agende antes
                                pelo telefone ou e-mail — assim garantimos que haja alguém da equipe
                                disponível para receber você.
                            </p>
                            <p>
                                Se o seu caso é urgente e você não está em São Paulo, veja em{' '}
                                <Link href="/onde-estamos">Onde estamos</Link> qual equipe regional
                                está mais perto — o atendimento local costuma ser bem mais rápido.
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
                        {faqs.map((faq, i) => (
                            <div className="accordion__item" key={faq.q}>
                                <button
                                    className={`accordion__head${openFaq === i ? ' is-open' : ''}`}
                                    type="button"
                                    aria-expanded={openFaq === i}
                                    onClick={() => toggleFaq(i)}
                                >
                                    {faq.q}
                                    <i className="fas fa-chevron-down"></i>
                                </button>
                                {openFaq === i && (
                                    <div className="accordion__body">
                                        <p>{faq.a}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </Animate>

                    <Animate className="callout callout--action">
                        <i className="fas fa-triangle-exclamation"></i>
                        <p>
                            <strong>Situação de risco iminente?</strong> Ligue <strong>190</strong>{' '}
                            (polícia), <strong>180</strong> (Central de Atendimento à Mulher) ou{' '}
                            <strong>100</strong> (Direitos Humanos). O SPM não é um serviço de
                            emergência — mas acompanhamos o caso depois, se você nos procurar.
                        </p>
                    </Animate>
                </div>
            </section>
        </>
    );
}
