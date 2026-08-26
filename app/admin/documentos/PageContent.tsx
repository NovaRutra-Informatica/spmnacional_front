'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import type { DocumentoCategoria } from '@/lib/generated/prisma/enums';
import { DOCUMENTO_CATEGORIA_LABEL } from '@/lib/labels';
import { alternarPublicacaoDocumento, excluirDocumento, salvarDocumento } from './actions';

export interface DocumentoRow {
    id: string;
    title: string;
    category: DocumentoCategoria;
    meta: string;
    icon: string;
    mediaId: string | null;
    fileUrl: string;
    published: boolean;
    order: number;
}

export interface MediaOption {
    id: string;
    label: string;
}

interface Props {
    documentos: DocumentoRow[];
    midia: MediaOption[];
}

/** `ActionState` vive em módulo `server-only`; o contrato é redeclarado aqui. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const IDLE: FormState = { ok: false };

const CATEGORIAS: DocumentoCategoria[] = [
    'INSTITUCIONAL',
    'ASSEMBLEIAS',
    'NOTAS_PUBLICAS',
    'FORMACAO',
    'RELATORIOS',
];

function erro(state: FormState, campo: string) {
    const mensagem = state.fieldErrors?.[campo];
    if (!mensagem) return null;
    return (
        <span className="afield__hint" style={{ color: '#c2185b' }}>
            {mensagem}
        </span>
    );
}

export default function PageContent({ documentos, midia }: Props) {
    const [busca, setBusca] = useState('');
    const [filtroCategoria, setFiltroCategoria] = useState<'todas' | DocumentoCategoria>('todas');
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [reset, setReset] = useState(0);

    const [salvarState, salvarAction, salvando] = useActionState<FormState, FormData>(
        salvarDocumento,
        IDLE,
    );
    const [excluirState, excluirAction, excluindo] = useActionState<FormState, FormData>(
        excluirDocumento,
        IDLE,
    );
    const [publicarState, publicarAction, publicando] = useActionState<FormState, FormData>(
        alternarPublicacaoDocumento,
        IDLE,
    );

    useEffect(() => {
        if (salvarState.ok) {
            setEditandoId(null);
            setReset((valor) => valor + 1);
        }
    }, [salvarState]);

    const emEdicao = useMemo(
        () => documentos.find((item) => item.id === editandoId) ?? null,
        [documentos, editandoId],
    );

    const filtrados = useMemo(() => {
        const termo = busca.trim().toLowerCase();

        return documentos.filter((item) => {
            const combinaTermo =
                !termo ||
                item.title.toLowerCase().includes(termo) ||
                item.meta.toLowerCase().includes(termo);
            const combinaCategoria =
                filtroCategoria === 'todas' || item.category === filtroCategoria;
            return combinaTermo && combinaCategoria;
        });
    }, [documentos, busca, filtroCategoria]);

    const publicados = documentos.filter((item) => item.published).length;
    const semArquivo = documentos.filter((item) => !item.fileUrl).length;

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
                    <h1>Documentos</h1>
                    <p>
                        Estatutos, atas, notas públicas, subsídios de formação e relatórios
                        disponibilizados para download na página institucional.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/quem-somos/documentos">
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
                            <i className="fas fa-plus"></i> Novo documento
                        </button>
                    )}
                </div>
            </div>

            <div className="agrid agrid--3" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-tile">
                    <span className="stat-tile__icon">
                        <i className="fas fa-folder-open"></i>
                    </span>
                    <div>
                        <strong>{documentos.length}</strong>
                        <span>Documentos cadastrados</span>
                    </div>
                </div>
                <div className="stat-tile is-success">
                    <span className="stat-tile__icon">
                        <i className="fas fa-globe"></i>
                    </span>
                    <div>
                        <strong>{publicados}</strong>
                        <span>Visíveis no site</span>
                    </div>
                </div>
                <div className="stat-tile is-warning">
                    <span className="stat-tile__icon">
                        <i className="fas fa-link-slash"></i>
                    </span>
                    <div>
                        <strong>{semArquivo}</strong>
                        <span>Sem arquivo vinculado</span>
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
                                placeholder="Buscar por título ou descrição…"
                                value={busca}
                                onChange={(event) => setBusca(event.target.value)}
                            />
                            <select
                                value={filtroCategoria}
                                onChange={(event) =>
                                    setFiltroCategoria(
                                        event.target.value as 'todas' | DocumentoCategoria,
                                    )
                                }
                            >
                                <option value="todas">Todas as categorias</option>
                                {CATEGORIAS.map((categoria) => (
                                    <option key={categoria} value={categoria}>
                                        {DOCUMENTO_CATEGORIA_LABEL[categoria]}
                                    </option>
                                ))}
                            </select>
                            <span className="atoolbar__spacer"></span>
                            <span style={{ fontSize: '0.82rem', color: '#7b8a9a' }}>
                                {filtrados.length} de {documentos.length} registros
                            </span>
                        </div>

                        {filtrados.length ? (
                            <div className="atable-wrap">
                                <table className="atable">
                                    <thead>
                                        <tr>
                                            <th>Documento</th>
                                            <th>Categoria</th>
                                            <th>Arquivo</th>
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
                                                            <i className={`fas ${item.icon}`}></i>
                                                        </span>
                                                        <span>
                                                            <span className="atable__title">
                                                                {item.title}
                                                            </span>
                                                            <span className="atable__sub">
                                                                {item.meta}
                                                            </span>
                                                        </span>
                                                    </div>
                                                </td>
                                                <td>{DOCUMENTO_CATEGORIA_LABEL[item.category]}</td>
                                                <td>
                                                    {item.fileUrl ? (
                                                        <a
                                                            href={item.fileUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            {item.mediaId
                                                                ? 'Da biblioteca'
                                                                : 'Link externo'}
                                                        </a>
                                                    ) : (
                                                        <span className="abadge abadge--pendente">
                                                            sem arquivo
                                                        </span>
                                                    )}
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
                                                                        `Excluir definitivamente o documento “${item.title}”?`,
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
                                <i className="fas fa-folder-open"></i>
                                <strong>Nenhum documento encontrado</strong>
                                <span>Ajuste os filtros ou cadastre um novo arquivo.</span>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>{emEdicao ? 'Editar documento' : 'Novo documento'}</h2>
                                <p>
                                    {emEdicao
                                        ? `Alterando “${emEdicao.title}”.`
                                        : 'Escolha o arquivo na biblioteca ou informe um endereço externo.'}
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
                                <label htmlFor="title">Título</label>
                                <input
                                    id="title"
                                    name="title"
                                    type="text"
                                    defaultValue={emEdicao?.title ?? ''}
                                    placeholder="Estatuto do Serviço Pastoral dos Migrantes"
                                />
                                {erro(salvarState, 'title')}
                            </div>

                            <div className="afield">
                                <label htmlFor="category">Categoria</label>
                                <select
                                    id="category"
                                    name="category"
                                    defaultValue={emEdicao?.category ?? 'INSTITUCIONAL'}
                                >
                                    {CATEGORIAS.map((categoria) => (
                                        <option key={categoria} value={categoria}>
                                            {DOCUMENTO_CATEGORIA_LABEL[categoria]}
                                        </option>
                                    ))}
                                </select>
                                {erro(salvarState, 'category')}
                            </div>

                            <div className="afield">
                                <label htmlFor="meta">Linha de metadados</label>
                                <input
                                    id="meta"
                                    name="meta"
                                    type="text"
                                    defaultValue={emEdicao?.meta ?? ''}
                                    placeholder="PDF · 1,2 MB · atualizado em 2026"
                                />
                                <span className="afield__hint">
                                    Texto exibido abaixo do título no site.
                                </span>
                                {erro(salvarState, 'meta')}
                            </div>

                            <div className="afield">
                                <label htmlFor="icon">Ícone</label>
                                <input
                                    id="icon"
                                    name="icon"
                                    type="text"
                                    defaultValue={emEdicao?.icon ?? 'fa-file-lines'}
                                    placeholder="fa-file-lines"
                                />
                                <span className="afield__hint">
                                    Classe do Font Awesome — ex.: fa-file-pdf, fa-book-open,
                                    fa-bullhorn.
                                </span>
                                {erro(salvarState, 'icon')}
                            </div>

                            <div className="afield">
                                <label htmlFor="mediaId">Arquivo da biblioteca</label>
                                <select
                                    id="mediaId"
                                    name="mediaId"
                                    defaultValue={emEdicao?.mediaId ?? ''}
                                >
                                    <option value="">Nenhum (usar endereço externo)</option>
                                    {midia.map((arquivo) => (
                                        <option key={arquivo.id} value={arquivo.id}>
                                            {arquivo.label}
                                        </option>
                                    ))}
                                </select>
                                {erro(salvarState, 'mediaId')}
                            </div>

                            <div className="afield">
                                <label htmlFor="fileUrl">Endereço externo</label>
                                <input
                                    id="fileUrl"
                                    name="fileUrl"
                                    type="text"
                                    defaultValue={
                                        emEdicao?.mediaId ? '' : (emEdicao?.fileUrl ?? '')
                                    }
                                    placeholder="https://…/documento.pdf"
                                />
                                <span className="afield__hint">
                                    Usado apenas quando nenhum arquivo da biblioteca é escolhido.
                                </span>
                                {erro(salvarState, 'fileUrl')}
                            </div>

                            <div className="afield">
                                <label htmlFor="order">Ordem na categoria</label>
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
                                      : 'Criar documento'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}
