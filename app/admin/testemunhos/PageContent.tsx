'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { alternarFlagTestemunho, excluirTestemunho, salvarTestemunho } from './actions';

export interface TestemunhoRow {
    id: string;
    text: string;
    personName: string;
    origin: string;
    initials: string;
    consent: boolean;
    consentNote: string;
    anonymized: boolean;
    featured: boolean;
    published: boolean;
    order: number;
}

interface Props {
    testemunhos: TestemunhoRow[];
}

/** `ActionState` vive em módulo `server-only`; o contrato é redeclarado aqui. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const IDLE: FormState = { ok: false };

type Filtro = 'todos' | 'publicados' | 'ocultos' | 'sem-consentimento';

function erro(state: FormState, campo: string) {
    const mensagem = state.fieldErrors?.[campo];
    if (!mensagem) return null;
    return (
        <span className="afield__hint" style={{ color: '#c2185b' }}>
            {mensagem}
        </span>
    );
}

export default function PageContent({ testemunhos }: Props) {
    const [busca, setBusca] = useState('');
    const [filtro, setFiltro] = useState<Filtro>('todos');
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [reset, setReset] = useState(0);

    const [salvarState, salvarAction, salvando] = useActionState<FormState, FormData>(
        salvarTestemunho,
        IDLE,
    );
    const [excluirState, excluirAction, excluindo] = useActionState<FormState, FormData>(
        excluirTestemunho,
        IDLE,
    );
    const [flagState, flagAction, alterandoFlag] = useActionState<FormState, FormData>(
        alternarFlagTestemunho,
        IDLE,
    );

    useEffect(() => {
        if (salvarState.ok) {
            setEditandoId(null);
            setReset((valor) => valor + 1);
        }
    }, [salvarState]);

    const emEdicao = useMemo(
        () => testemunhos.find((item) => item.id === editandoId) ?? null,
        [testemunhos, editandoId],
    );

    const filtrados = useMemo(() => {
        const termo = busca.trim().toLowerCase();

        return testemunhos.filter((item) => {
            const combinaTermo =
                !termo ||
                item.personName.toLowerCase().includes(termo) ||
                item.origin.toLowerCase().includes(termo) ||
                item.text.toLowerCase().includes(termo);

            const combinaFiltro =
                filtro === 'todos' ||
                (filtro === 'publicados' && item.published) ||
                (filtro === 'ocultos' && !item.published) ||
                (filtro === 'sem-consentimento' && !item.consent);

            return combinaTermo && combinaFiltro;
        });
    }, [testemunhos, busca, filtro]);

    const publicados = testemunhos.filter((item) => item.published).length;
    const semConsentimento = testemunhos.filter((item) => !item.consent).length;
    const destaques = testemunhos.filter((item) => item.featured).length;

    /**
     * Exclusão e alternância de destaque/publicação escrevem no mesmo aviso.
     * Guardamos o último retorno porque `useActionState` mantém o estado anterior
     * indefinidamente: sem isso, a recusa por falta de consentimento poderia
     * ficar escondida atrás da mensagem de uma exclusão antiga.
     */
    const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

    useEffect(() => {
        if (excluirState.message) {
            setAviso({ ok: excluirState.ok, texto: excluirState.message });
        }
    }, [excluirState]);

    useEffect(() => {
        if (flagState.message) {
            setAviso({ ok: flagState.ok, texto: flagState.message });
        }
    }, [flagState]);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> / Conteúdo
                    </div>
                    <h1>Testemunhos</h1>
                    <p>
                        Histórias de vida partilhadas por pessoas migrantes. Cada depoimento no ar é
                        um compromisso de confiança — trate-o como tal.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/publicacoes/testemunhos">
                        <i className="fas fa-arrow-up-right-from-square"></i> Ver página pública
                    </Link>
                    {emEdicao && (
                        <button
                            type="button"
                            className="abtn abtn--action"
                            onClick={() => {
                                setEditandoId(null);
                                setReset((valor) => valor + 1);
                            }}
                        >
                            <i className="fas fa-plus"></i> Novo testemunho
                        </button>
                    )}
                </div>
            </div>

            <div className="anote anote--warning">
                <i className="fas fa-shield-halved"></i>
                <div>
                    <strong>Só se publica testemunho com consentimento registrado.</strong> Marque o
                    consentimento apenas quando houver autorização da pessoa — por escrito, por
                    áudio ou em termo assinado — e descreva no campo de registro quando e como ela
                    foi obtida. Sem isso, o sistema não deixa publicar nem destacar o depoimento.
                </div>
            </div>

            <div className="agrid agrid--4" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-tile">
                    <span className="stat-tile__icon">
                        <i className="fas fa-comment-dots"></i>
                    </span>
                    <div>
                        <strong>{testemunhos.length}</strong>
                        <span>Depoimentos cadastrados</span>
                    </div>
                </div>
                <div className="stat-tile is-success">
                    <span className="stat-tile__icon">
                        <i className="fas fa-globe"></i>
                    </span>
                    <div>
                        <strong>{publicados}</strong>
                        <span>Publicados</span>
                    </div>
                </div>
                <div className="stat-tile is-action">
                    <span className="stat-tile__icon">
                        <i className="fas fa-star"></i>
                    </span>
                    <div>
                        <strong>{destaques}</strong>
                        <span>Em destaque</span>
                    </div>
                </div>
                <div className="stat-tile is-warning">
                    <span className="stat-tile__icon">
                        <i className="fas fa-file-signature"></i>
                    </span>
                    <div>
                        <strong>{semConsentimento}</strong>
                        <span>Sem consentimento</span>
                    </div>
                </div>
            </div>

            <div className="agrid agrid--sidebar">
                <div>
                    <div className="acard">
                        {aviso && (
                            <div
                                className={
                                    aviso.ok ? 'anote anote--success' : 'anote anote--warning'
                                }
                            >
                                <i
                                    className={`fas ${aviso.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}
                                ></i>
                                <div>{aviso.texto}</div>
                            </div>
                        )}

                        <div className="atoolbar">
                            <input
                                className="atoolbar__search"
                                type="search"
                                placeholder="Buscar por nome, origem ou trecho do depoimento…"
                                value={busca}
                                onChange={(event) => setBusca(event.target.value)}
                            />
                            <select
                                value={filtro}
                                onChange={(event) => setFiltro(event.target.value as Filtro)}
                            >
                                <option value="todos">Todos</option>
                                <option value="publicados">Publicados</option>
                                <option value="ocultos">Ocultos</option>
                                <option value="sem-consentimento">Sem consentimento</option>
                            </select>
                            <span className="atoolbar__spacer"></span>
                            <span style={{ fontSize: '0.82rem', color: '#7b8a9a' }}>
                                {filtrados.length} de {testemunhos.length} registros
                            </span>
                        </div>

                        {filtrados.length ? (
                            <div className="atable-wrap">
                                <table className="atable">
                                    <thead>
                                        <tr>
                                            <th>Pessoa</th>
                                            <th>Depoimento</th>
                                            <th>Consentimento</th>
                                            <th>Situação</th>
                                            <th style={{ textAlign: 'right' }}>Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtrados.map((item) => (
                                            <tr key={item.id}>
                                                <td>
                                                    <div className="atable__cell-media">
                                                        <span className="aavatar">
                                                            {item.initials}
                                                        </span>
                                                        <span>
                                                            <span className="atable__title">
                                                                {item.featured && (
                                                                    <i
                                                                        className="fas fa-star"
                                                                        style={{
                                                                            color: '#e0a800',
                                                                            marginRight: '0.35rem',
                                                                        }}
                                                                        title="Em destaque"
                                                                    ></i>
                                                                )}
                                                                {item.personName}
                                                            </span>
                                                            <span className="atable__sub">
                                                                {item.origin}
                                                                {item.anonymized
                                                                    ? ' · anonimizado'
                                                                    : ''}
                                                            </span>
                                                        </span>
                                                    </div>
                                                </td>
                                                <td>
                                                    {item.text.length > 110
                                                        ? `${item.text.slice(0, 110)}…`
                                                        : item.text}
                                                </td>
                                                <td>
                                                    <span
                                                        className={
                                                            item.consent
                                                                ? 'abadge abadge--publicado'
                                                                : 'abadge abadge--critico'
                                                        }
                                                    >
                                                        {item.consent ? 'registrado' : 'pendente'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span
                                                        className={
                                                            item.published
                                                                ? 'abadge abadge--publicado'
                                                                : 'abadge abadge--rascunho'
                                                        }
                                                    >
                                                        {item.published ? 'no site' : 'oculto'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="atable__actions">
                                                        <form action={flagAction}>
                                                            <input
                                                                type="hidden"
                                                                name="id"
                                                                value={item.id}
                                                            />
                                                            <input
                                                                type="hidden"
                                                                name="campo"
                                                                value="featured"
                                                            />
                                                            <button
                                                                className="abtn abtn--ghost abtn--sm"
                                                                disabled={alterandoFlag}
                                                                title={
                                                                    item.featured
                                                                        ? 'Remover destaque'
                                                                        : 'Destacar'
                                                                }
                                                            >
                                                                <i className="fas fa-star"></i>
                                                            </button>
                                                        </form>
                                                        <form action={flagAction}>
                                                            <input
                                                                type="hidden"
                                                                name="id"
                                                                value={item.id}
                                                            />
                                                            <input
                                                                type="hidden"
                                                                name="campo"
                                                                value="published"
                                                            />
                                                            <button
                                                                className="abtn abtn--ghost abtn--sm"
                                                                disabled={alterandoFlag}
                                                                title={
                                                                    item.published
                                                                        ? 'Retirar do site'
                                                                        : 'Publicar no site'
                                                                }
                                                            >
                                                                <i
                                                                    className={`fas ${item.published ? 'fa-eye-slash' : 'fa-paper-plane'}`}
                                                                ></i>
                                                            </button>
                                                        </form>
                                                        <button
                                                            type="button"
                                                            className="abtn abtn--ghost abtn--sm"
                                                            onClick={() => setEditandoId(item.id)}
                                                            title="Editar"
                                                        >
                                                            <i className="fas fa-pen"></i>
                                                        </button>
                                                        <form
                                                            action={excluirAction}
                                                            onSubmit={(event) => {
                                                                // Exclusão é definitiva: confirma antes.
                                                                if (
                                                                    !confirm(
                                                                        `Excluir definitivamente o testemunho de “${item.personName}”?`,
                                                                    )
                                                                ) {
                                                                    event.preventDefault();
                                                                }
                                                            }}
                                                        >
                                                            <input
                                                                type="hidden"
                                                                name="id"
                                                                value={item.id}
                                                            />
                                                            <button
                                                                className="abtn abtn--danger abtn--sm"
                                                                disabled={excluindo}
                                                                title="Excluir"
                                                            >
                                                                <i className="fas fa-trash"></i>
                                                            </button>
                                                        </form>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="aempty">
                                <i className="fas fa-comment-dots"></i>
                                <strong>Nenhum testemunho encontrado</strong>
                                <span>Ajuste os filtros ou registre um novo depoimento.</span>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>{emEdicao ? 'Editar testemunho' : 'Novo testemunho'}</h2>
                                <p>
                                    {emEdicao
                                        ? `Alterando o depoimento de “${emEdicao.personName}”.`
                                        : 'Registre o depoimento e o consentimento de quem falou.'}
                                </p>
                            </div>
                            {emEdicao && (
                                <button
                                    type="button"
                                    className="abtn abtn--ghost abtn--sm"
                                    onClick={() => {
                                        setEditandoId(null);
                                        setReset((valor) => valor + 1);
                                    }}
                                >
                                    Cancelar
                                </button>
                            )}
                        </div>

                        <form action={salvarAction} key={`${emEdicao?.id ?? 'novo'}-${reset}`}>
                            {emEdicao && <input type="hidden" name="id" value={emEdicao.id} />}

                            {salvarState.message && (
                                <div
                                    className={
                                        salvarState.ok
                                            ? 'anote anote--success'
                                            : 'anote anote--warning'
                                    }
                                >
                                    <i
                                        className={`fas ${salvarState.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}
                                    ></i>
                                    <div>{salvarState.message}</div>
                                </div>
                            )}

                            <div className="afield">
                                <label htmlFor="text">Depoimento</label>
                                <textarea
                                    id="text"
                                    name="text"
                                    defaultValue={emEdicao?.text ?? ''}
                                    placeholder="Transcreva a fala da pessoa, sem corrigir o jeito de falar."
                                />
                                {erro(salvarState, 'text')}
                            </div>

                            <div className="afield">
                                <label htmlFor="personName">Nome ou pseudônimo</label>
                                <input
                                    id="personName"
                                    name="personName"
                                    type="text"
                                    defaultValue={emEdicao?.personName ?? ''}
                                    placeholder="Rosa M."
                                />
                                {erro(salvarState, 'personName')}
                            </div>

                            <div className="afield">
                                <label htmlFor="origin">Origem</label>
                                <input
                                    id="origin"
                                    name="origin"
                                    type="text"
                                    defaultValue={emEdicao?.origin ?? ''}
                                    placeholder="Boliviana, residente em Campo Grande (MS)"
                                />
                                {erro(salvarState, 'origin')}
                            </div>

                            <div className="afield">
                                <label htmlFor="initials">Iniciais</label>
                                <input
                                    id="initials"
                                    name="initials"
                                    type="text"
                                    maxLength={3}
                                    defaultValue={emEdicao?.initials ?? ''}
                                    placeholder="RM"
                                />
                                <span className="afield__hint">
                                    Em branco, são deduzidas do nome informado.
                                </span>
                                {erro(salvarState, 'initials')}
                            </div>

                            <div className="afield">
                                <label htmlFor="order">Ordem</label>
                                <input
                                    id="order"
                                    name="order"
                                    type="number"
                                    min={0}
                                    max={999}
                                    defaultValue={emEdicao?.order ?? 0}
                                />
                                <span className="afield__hint">Menor número aparece primeiro.</span>
                                {erro(salvarState, 'order')}
                            </div>

                            <label className="aswitch" style={{ marginBottom: '1rem' }}>
                                <input
                                    type="checkbox"
                                    name="consent"
                                    defaultChecked={emEdicao?.consent ?? false}
                                />
                                <span className="aswitch__track"></span>
                                <span className="aswitch__label">
                                    Consentimento registrado para publicação
                                </span>
                            </label>

                            {salvarState.fieldErrors?.consent && (
                                <div className="anote anote--warning">
                                    <i className="fas fa-triangle-exclamation"></i>
                                    <div>{salvarState.fieldErrors.consent}</div>
                                </div>
                            )}

                            <div className="afield">
                                <label htmlFor="consentNote">Registro do consentimento</label>
                                <textarea
                                    id="consentNote"
                                    name="consentNote"
                                    defaultValue={emEdicao?.consentNote ?? ''}
                                    placeholder="Ex.: autorização gravada em áudio na acolhida de 12/03/2026, com a equipe de Manaus."
                                />
                                <span className="afield__hint">
                                    Obrigatório quando o consentimento estiver marcado.
                                </span>
                                {erro(salvarState, 'consentNote')}
                            </div>

                            <label className="aswitch" style={{ marginBottom: '1rem' }}>
                                <input
                                    type="checkbox"
                                    name="anonymized"
                                    defaultChecked={emEdicao?.anonymized ?? false}
                                />
                                <span className="aswitch__track"></span>
                                <span className="aswitch__label">
                                    Depoimento anonimizado (nome fictício)
                                </span>
                            </label>

                            <label className="aswitch" style={{ marginBottom: '1rem' }}>
                                <input
                                    type="checkbox"
                                    name="featured"
                                    defaultChecked={emEdicao?.featured ?? false}
                                />
                                <span className="aswitch__track"></span>
                                <span className="aswitch__label">Destacar no site</span>
                            </label>

                            <label className="aswitch" style={{ marginBottom: '1.25rem' }}>
                                <input
                                    type="checkbox"
                                    name="published"
                                    defaultChecked={emEdicao?.published ?? false}
                                />
                                <span className="aswitch__track"></span>
                                <span className="aswitch__label">Publicar no site</span>
                            </label>

                            <button className="abtn abtn--action abtn--block" disabled={salvando}>
                                <i className="fas fa-floppy-disk"></i>
                                {salvando
                                    ? 'Salvando…'
                                    : emEdicao
                                      ? 'Salvar alterações'
                                      : 'Registrar testemunho'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}
