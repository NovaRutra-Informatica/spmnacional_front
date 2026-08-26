'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import type { EditalStatus } from '@/lib/generated/prisma/enums';
import { EDITAL_STATUS_LABEL } from '@/lib/labels';
import { alternarPublicacaoEdital, excluirEdital, salvarEdital } from './actions';

export interface EditalRow {
    id: string;
    code: string;
    slug: string;
    title: string;
    description: string;
    status: EditalStatus;
    deadlineText: string;
    /** Já no formato do <input type="date">. */
    deadlineAt: string;
    scope: string;
    order: number;
    published: boolean;
    fileMediaId: string | null;
    fileUrl: string | null;
}

export interface MediaOption {
    id: string;
    label: string;
}

interface Props {
    editais: EditalRow[];
    midia: MediaOption[];
}

/**
 * `ActionState` mora em `lib/server/actions`, que é `server-only`: o contrato é
 * redeclarado aqui para o Client Component conseguir tipar `useActionState`.
 */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const IDLE: FormState = { ok: false };

const STATUS_ORDER: EditalStatus[] = ['ABERTO', 'EM_ANALISE', 'ENCERRADO'];

/** Reaproveita os selos do painel; `EDITAL_STATUS_CLASS` é do site público. */
const STATUS_BADGE: Record<EditalStatus, string> = {
    ABERTO: 'abadge abadge--publicado',
    EM_ANALISE: 'abadge abadge--pendente',
    ENCERRADO: 'abadge abadge--inativo',
};

function erro(state: FormState, campo: string) {
    const mensagem = state.fieldErrors?.[campo];
    if (!mensagem) return null;
    return (
        <span className="afield__hint" style={{ color: '#c2185b' }}>
            {mensagem}
        </span>
    );
}

export default function PageContent({ editais, midia }: Props) {
    const [busca, setBusca] = useState('');
    const [filtroStatus, setFiltroStatus] = useState<'todos' | EditalStatus>('todos');
    const [editandoId, setEditandoId] = useState<string | null>(null);
    // Muda a `key` do formulário para limpar os campos depois de salvar.
    const [reset, setReset] = useState(0);

    const [salvarState, salvarAction, salvando] = useActionState<FormState, FormData>(
        salvarEdital,
        IDLE,
    );
    const [excluirState, excluirAction, excluindo] = useActionState<FormState, FormData>(
        excluirEdital,
        IDLE,
    );
    const [publicarState, publicarAction, publicando] = useActionState<FormState, FormData>(
        alternarPublicacaoEdital,
        IDLE,
    );

    useEffect(() => {
        if (salvarState.ok) {
            setEditandoId(null);
            setReset((valor) => valor + 1);
        }
    }, [salvarState]);

    const emEdicao = useMemo(
        () => editais.find((item) => item.id === editandoId) ?? null,
        [editais, editandoId],
    );

    const filtrados = useMemo(() => {
        const termo = busca.trim().toLowerCase();

        return editais.filter((item) => {
            const combinaTermo =
                !termo ||
                item.code.toLowerCase().includes(termo) ||
                item.title.toLowerCase().includes(termo) ||
                item.scope.toLowerCase().includes(termo);
            const combinaStatus = filtroStatus === 'todos' || item.status === filtroStatus;
            return combinaTermo && combinaStatus;
        });
    }, [editais, busca, filtroStatus]);

    const abertos = editais.filter((item) => item.status === 'ABERTO').length;
    const emAnalise = editais.filter((item) => item.status === 'EM_ANALISE').length;
    const publicados = editais.filter((item) => item.published).length;

    /**
     * Exclusão e publicação escrevem no mesmo aviso da lista. Guardamos o último
     * retorno porque `useActionState` mantém o estado anterior indefinidamente:
     * sem isso, a mensagem da exclusão ficaria congelada na tela e esconderia
     * (ou contradiria) o resultado das publicações seguintes.
     */
    const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

    useEffect(() => {
        if (excluirState.message) {
            setAviso({ ok: excluirState.ok, texto: excluirState.message });
        }
    }, [excluirState]);

    useEffect(() => {
        if (publicarState.message) {
            setAviso({ ok: publicarState.ok, texto: publicarState.message });
        }
    }, [publicarState]);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> / Conteúdo
                    </div>
                    <h1>Editais</h1>
                    <p>
                        Chamadas públicas, bolsas e seleções da rede do SPM. O que estiver publicado
                        aqui aparece imediatamente na página de editais do site.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/publicacoes/editais">
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
                            <i className="fas fa-plus"></i> Novo edital
                        </button>
                    )}
                </div>
            </div>

            <div className="agrid agrid--4" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-tile">
                    <span className="stat-tile__icon">
                        <i className="fas fa-bullhorn"></i>
                    </span>
                    <div>
                        <strong>{editais.length}</strong>
                        <span>Editais cadastrados</span>
                    </div>
                </div>
                <div className="stat-tile is-success">
                    <span className="stat-tile__icon">
                        <i className="fas fa-door-open"></i>
                    </span>
                    <div>
                        <strong>{abertos}</strong>
                        <span>Com inscrições abertas</span>
                    </div>
                </div>
                <div className="stat-tile is-warning">
                    <span className="stat-tile__icon">
                        <i className="fas fa-hourglass-half"></i>
                    </span>
                    <div>
                        <strong>{emAnalise}</strong>
                        <span>Em análise</span>
                    </div>
                </div>
                <div className="stat-tile is-action">
                    <span className="stat-tile__icon">
                        <i className="fas fa-globe"></i>
                    </span>
                    <div>
                        <strong>{publicados}</strong>
                        <span>Visíveis no site</span>
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
                                placeholder="Buscar por código, título ou abrangência…"
                                value={busca}
                                onChange={(event) => setBusca(event.target.value)}
                            />
                            <select
                                value={filtroStatus}
                                onChange={(event) =>
                                    setFiltroStatus(event.target.value as 'todos' | EditalStatus)
                                }
                            >
                                <option value="todos">Todas as situações</option>
                                {STATUS_ORDER.map((status) => (
                                    <option key={status} value={status}>
                                        {EDITAL_STATUS_LABEL[status]}
                                    </option>
                                ))}
                            </select>
                            <span className="atoolbar__spacer"></span>
                            <span style={{ fontSize: '0.82rem', color: '#7b8a9a' }}>
                                {filtrados.length} de {editais.length} registros
                            </span>
                        </div>

                        {filtrados.length ? (
                            <div className="atable-wrap">
                                <table className="atable">
                                    <thead>
                                        <tr>
                                            <th>Edital</th>
                                            <th>Prazo</th>
                                            <th>Abrangência</th>
                                            <th>Situação</th>
                                            <th style={{ textAlign: 'right' }}>Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtrados.map((item) => (
                                            <tr key={item.id}>
                                                <td>
                                                    <span className="atable__title">
                                                        {item.title}
                                                    </span>
                                                    <span className="atable__sub">
                                                        {item.code} · /{item.slug}
                                                        {item.fileUrl ? ' · com anexo' : ''}
                                                    </span>
                                                </td>
                                                <td>{item.deadlineText}</td>
                                                <td>{item.scope}</td>
                                                <td>
                                                    <span className={STATUS_BADGE[item.status]}>
                                                        {EDITAL_STATUS_LABEL[item.status]}
                                                    </span>
                                                    <span
                                                        className="atable__sub"
                                                        style={{
                                                            display: 'block',
                                                            marginTop: '0.3rem',
                                                        }}
                                                    >
                                                        {item.published
                                                            ? 'Visível no site'
                                                            : 'Oculto no site'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="atable__actions">
                                                        <form action={publicarAction}>
                                                            <input
                                                                type="hidden"
                                                                name="id"
                                                                value={item.id}
                                                            />
                                                            <button
                                                                className="abtn abtn--ghost abtn--sm"
                                                                disabled={publicando}
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
                                                                        `Excluir definitivamente o edital “${item.code}”?`,
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
                                <i className="fas fa-bullhorn"></i>
                                <strong>Nenhum edital encontrado</strong>
                                <span>Ajuste os filtros ou cadastre uma nova chamada.</span>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>{emEdicao ? 'Editar edital' : 'Novo edital'}</h2>
                                <p>
                                    {emEdicao
                                        ? `Alterando “${emEdicao.code}”.`
                                        : 'O endereço público é gerado a partir do título.'}
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
                                <label htmlFor="code">Código</label>
                                <input
                                    id="code"
                                    name="code"
                                    type="text"
                                    defaultValue={emEdicao?.code ?? ''}
                                    placeholder="EDITAL 03/2026"
                                />
                                {erro(salvarState, 'code')}
                            </div>

                            <div className="afield">
                                <label htmlFor="title">Título</label>
                                <input
                                    id="title"
                                    name="title"
                                    type="text"
                                    defaultValue={emEdicao?.title ?? ''}
                                    placeholder="Apoio a coletivos de migrantes"
                                />
                                {erro(salvarState, 'title')}
                            </div>

                            <div className="afield">
                                <label htmlFor="description">Descrição</label>
                                <textarea
                                    id="description"
                                    name="description"
                                    defaultValue={emEdicao?.description ?? ''}
                                    placeholder="Resumo do que a chamada oferece e para quem."
                                />
                                {erro(salvarState, 'description')}
                            </div>

                            <div className="afield">
                                <label htmlFor="status">Situação</label>
                                <select
                                    id="status"
                                    name="status"
                                    defaultValue={emEdicao?.status ?? 'ABERTO'}
                                >
                                    {STATUS_ORDER.map((status) => (
                                        <option key={status} value={status}>
                                            {EDITAL_STATUS_LABEL[status]}
                                        </option>
                                    ))}
                                </select>
                                {erro(salvarState, 'status')}
                            </div>

                            <div className="afield">
                                <label htmlFor="deadlineText">Texto do prazo</label>
                                <input
                                    id="deadlineText"
                                    name="deadlineText"
                                    type="text"
                                    defaultValue={emEdicao?.deadlineText ?? ''}
                                    placeholder="Inscrições até 30 de setembro de 2026"
                                />
                                <span className="afield__hint">
                                    É este texto que aparece no cartão do site.
                                </span>
                                {erro(salvarState, 'deadlineText')}
                            </div>

                            <div className="afield">
                                <label htmlFor="deadlineAt">Data limite</label>
                                <input
                                    id="deadlineAt"
                                    name="deadlineAt"
                                    type="date"
                                    defaultValue={emEdicao?.deadlineAt ?? ''}
                                />
                                <span className="afield__hint">
                                    Opcional — usada para ordenar e conferir prazos.
                                </span>
                            </div>

                            <div className="afield">
                                <label htmlFor="scope">Abrangência</label>
                                <input
                                    id="scope"
                                    name="scope"
                                    type="text"
                                    defaultValue={emEdicao?.scope ?? ''}
                                    placeholder="Nacional · modalidade on-line"
                                />
                                {erro(salvarState, 'scope')}
                            </div>

                            <div className="afield">
                                <label htmlFor="fileMediaId">Anexo (biblioteca de mídia)</label>
                                <select
                                    id="fileMediaId"
                                    name="fileMediaId"
                                    defaultValue={emEdicao?.fileMediaId ?? ''}
                                >
                                    <option value="">Sem anexo</option>
                                    {midia.map((arquivo) => (
                                        <option key={arquivo.id} value={arquivo.id}>
                                            {arquivo.label}
                                        </option>
                                    ))}
                                </select>
                                <span className="afield__hint">
                                    Envie o PDF na biblioteca de mídia e escolha-o aqui.
                                </span>
                                {erro(salvarState, 'fileMediaId')}
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

                            <label className="aswitch" style={{ marginBottom: '1.25rem' }}>
                                <input
                                    type="checkbox"
                                    name="published"
                                    defaultChecked={emEdicao ? emEdicao.published : true}
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
                                      : 'Criar edital'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}
