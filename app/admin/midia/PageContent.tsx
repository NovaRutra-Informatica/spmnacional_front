'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import type { MediaKind } from '@/lib/generated/prisma/enums';
import { enviarArquivos, excluirMidia } from './actions';

/** Mesmo formato de `ActionState`, redeclarado aqui: `lib/server` é server-only. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

export interface ArquivoItem {
    id: string;
    name: string;
    url: string;
    kind: MediaKind;
    /** Já formatado no servidor. */
    size: string;
    /** Já formatado no servidor. */
    uploadedAt: string;
    /** Quantos registros usam este arquivo. */
    usos: number;
}

interface Props {
    arquivos: ArquivoItem[];
}

const FILTROS: { value: 'todos' | MediaKind; label: string }[] = [
    { value: 'todos', label: 'Todos os tipos' },
    { value: 'IMAGEM', label: 'Imagens' },
    { value: 'DOCUMENTO', label: 'Documentos' },
    { value: 'OUTRO', label: 'Outros' },
];

const UPLOAD_FORM_ID = 'form-envio-midia';

export default function PageContent({ arquivos }: Props) {
    const [typeFilter, setTypeFilter] = useState<'todos' | MediaKind>('todos');

    const [uploadState, uploadAction, uploading] = useActionState<FormState, FormData>(
        enviarArquivos,
        { ok: false },
    );
    const [deleteState, deleteAction, deleting] = useActionState<FormState, FormData>(
        excluirMidia,
        { ok: false },
    );

    const filtered = useMemo(
        () =>
            typeFilter === 'todos'
                ? arquivos
                : arquivos.filter((arquivo) => arquivo.kind === typeFilter),
        [arquivos, typeFilter],
    );

    const imageCount = useMemo(
        () => arquivos.filter((arquivo) => arquivo.kind === 'IMAGEM').length,
        [arquivos],
    );
    const docCount = useMemo(
        () => arquivos.filter((arquivo) => arquivo.kind === 'DOCUMENTO').length,
        [arquivos],
    );

    // Escolher o arquivo já dispara o envio — era assim no protótipo.
    const submeterAoEscolher = (event: ChangeEvent<HTMLInputElement>) => {
        if (event.target.files?.length) {
            event.target.form?.requestSubmit();
        }
    };

    const confirmarExclusao = (event: MouseEvent<HTMLButtonElement>, nome: string) => {
        if (!confirm(`Remover “${nome}” da biblioteca?`)) {
            event.preventDefault();
        }
    };

    return (
        <>
            <form id={UPLOAD_FORM_ID} action={uploadAction}></form>

            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> / Conteúdo
                    </div>
                    <h1>Biblioteca de mídia</h1>
                    <p>
                        Imagens usadas nas notícias e arquivos disponibilizados para download no
                        site — como os subsídios da Semana do Migrante.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <label className="abtn abtn--action" style={{ cursor: 'pointer' }}>
                        <i className="fas fa-cloud-arrow-up"></i>{' '}
                        {uploading ? 'Enviando…' : 'Enviar arquivos'}
                        <input
                            type="file"
                            name="arquivos"
                            form={UPLOAD_FORM_ID}
                            multiple
                            hidden
                            disabled={uploading}
                            onChange={submeterAoEscolher}
                        />
                    </label>
                </div>
            </div>

            {uploadState.message && (
                <div className={uploadState.ok ? 'anote anote--success' : 'anote anote--warning'}>
                    <i
                        className={`fas ${uploadState.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}
                    ></i>
                    <div>{uploadState.message}</div>
                </div>
            )}

            {deleteState.message && (
                <div className={deleteState.ok ? 'anote anote--success' : 'anote anote--warning'}>
                    <i
                        className={`fas ${deleteState.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}
                    ></i>
                    <div>{deleteState.message}</div>
                </div>
            )}

            <div className="agrid agrid--3" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-tile">
                    <span className="stat-tile__icon">
                        <i className="fas fa-photo-film"></i>
                    </span>
                    <div>
                        <strong>{arquivos.length}</strong>
                        <span>Arquivos na biblioteca</span>
                    </div>
                </div>
                <div className="stat-tile is-success">
                    <span className="stat-tile__icon">
                        <i className="fas fa-image"></i>
                    </span>
                    <div>
                        <strong>{imageCount}</strong>
                        <span>Imagens</span>
                    </div>
                </div>
                <div className="stat-tile is-action">
                    <span className="stat-tile__icon">
                        <i className="fas fa-file-pdf"></i>
                    </span>
                    <div>
                        <strong>{docCount}</strong>
                        <span>Documentos</span>
                    </div>
                </div>
            </div>

            <div className="acard">
                <div className="atoolbar">
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as 'todos' | MediaKind)}
                    >
                        {FILTROS.map((filtro) => (
                            <option value={filtro.value} key={filtro.value}>
                                {filtro.label}
                            </option>
                        ))}
                    </select>
                    <span className="atoolbar__spacer"></span>
                    <span style={{ fontSize: '0.82rem', color: '#7b8a9a' }}>
                        {filtered.length} arquivo(s)
                    </span>
                </div>

                <label className="adropzone" style={{ marginBottom: '1.5rem' }}>
                    <i className="fas fa-cloud-arrow-up"></i>
                    <strong>
                        {uploading
                            ? 'Enviando arquivos…'
                            : 'Arraste arquivos ou clique para enviar'}
                    </strong>
                    <span>Imagens (JPG, PNG, WebP) e documentos (PDF) · até 20 MB por arquivo</span>
                    <input
                        type="file"
                        name="arquivos"
                        form={UPLOAD_FORM_ID}
                        multiple
                        disabled={uploading}
                        onChange={submeterAoEscolher}
                    />
                </label>

                {filtered.length ? (
                    <div className="media-grid">
                        {filtered.map((arquivo) => (
                            <div className="media-item" key={arquivo.id}>
                                {arquivo.kind === 'IMAGEM' ? (
                                    <div
                                        className="media-item__img"
                                        style={{ backgroundImage: `url(${arquivo.url})` }}
                                    ></div>
                                ) : (
                                    <div
                                        className="media-item__img"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#c2185b',
                                            fontSize: '2rem',
                                        }}
                                    >
                                        <i
                                            className={`fas ${
                                                arquivo.kind === 'DOCUMENTO'
                                                    ? 'fa-file-pdf'
                                                    : 'fa-file'
                                            }`}
                                        ></i>
                                    </div>
                                )}
                                <div className="media-item__body">
                                    <strong>{arquivo.name}</strong>
                                    <span>
                                        {arquivo.size} · {arquivo.uploadedAt}
                                    </span>
                                    {arquivo.usos > 0 && (
                                        <span style={{ display: 'block' }}>
                                            Em uso em {arquivo.usos} registro(s)
                                        </span>
                                    )}
                                    <form action={deleteAction}>
                                        <input type="hidden" name="id" value={arquivo.id} />
                                        <button
                                            className="abtn abtn--danger abtn--sm abtn--block"
                                            type="submit"
                                            style={{
                                                marginTop: '0.6rem',
                                                ...(arquivo.usos > 0
                                                    ? { opacity: 0.55, cursor: 'not-allowed' }
                                                    : null),
                                            }}
                                            disabled={deleting || arquivo.usos > 0}
                                            title={
                                                arquivo.usos > 0
                                                    ? 'Arquivo em uso — troque-o nos registros antes de excluir.'
                                                    : 'Remover da biblioteca'
                                            }
                                            onClick={(event) =>
                                                confirmarExclusao(event, arquivo.name)
                                            }
                                        >
                                            <i className="fas fa-trash"></i> Remover
                                        </button>
                                    </form>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="aempty">
                        <i className="fas fa-photo-film"></i>
                        <strong>Nenhum arquivo neste filtro</strong>
                        <span>Envie um arquivo ou mude o tipo selecionado.</span>
                    </div>
                )}
            </div>

            <div className="anote">
                <i className="fas fa-circle-info"></i>
                <div>
                    <strong>Antes de remover.</strong> Arquivos ligados a notícias, editais,
                    documentos ou materiais da Semana ficam bloqueados para exclusão — assim nenhuma
                    página do site fica com imagem ou download quebrado.
                </div>
            </div>
        </>
    );
}
