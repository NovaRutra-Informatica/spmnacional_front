'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useMemo, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import type { MediaKind } from '@/lib/generated/prisma/enums';
import { MAX_ADMIN_UPLOAD_BYTES, uploadAdminFile } from '@/lib/client/admin-upload';
import { excluirMidia } from './actions';

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

export default function PageContent({ arquivos }: Props) {
    const router = useRouter();
    const [typeFilter, setTypeFilter] = useState<'todos' | MediaKind>('todos');
    const [uploadState, setUploadState] = useState<FormState>({ ok: false });
    const [uploading, setUploading] = useState(false);
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

    const enviarAoEscolher = async (event: ChangeEvent<HTMLInputElement>) => {
        const input = event.currentTarget;
        const selecionados = Array.from(input.files ?? []);
        if (!selecionados.length) return;

        if (selecionados.length > 5) {
            setUploadState({ ok: false, message: 'Envie no máximo 5 arquivos por vez.' });
            input.value = '';
            return;
        }

        const tamanhoTotal = selecionados.reduce((total, arquivo) => total + arquivo.size, 0);
        if (tamanhoTotal > MAX_ADMIN_UPLOAD_BYTES * 2.5) {
            setUploadState({
                ok: false,
                message: 'O conjunto de arquivos ultrapassa o limite de 25 MB.',
            });
            input.value = '';
            return;
        }

        setUploading(true);
        setUploadState({ ok: false });
        const enviados: string[] = [];
        const recusados: string[] = [];

        for (const arquivo of selecionados) {
            try {
                await uploadAdminFile(arquivo, 'biblioteca');
                enviados.push(arquivo.name);
            } catch (error) {
                recusados.push(
                    `${arquivo.name} (${error instanceof Error ? error.message : 'falha no envio'})`,
                );
            }
        }

        input.value = '';
        setUploading(false);
        if (enviados.length) {
            const resumo =
                enviados.length === 1
                    ? '1 arquivo adicionado à biblioteca.'
                    : `${enviados.length} arquivos adicionados à biblioteca.`;
            setUploadState({
                ok: true,
                message: recusados.length ? `${resumo} Recusados: ${recusados.join('; ')}` : resumo,
            });
            router.refresh();
        } else {
            setUploadState({
                ok: false,
                message: `Nenhum arquivo foi enviado: ${recusados.join('; ')}`,
            });
        }
    };

    const confirmarExclusao = (event: MouseEvent<HTMLButtonElement>, nome: string) => {
        if (!confirm(`Remover “${nome}” da biblioteca?`)) {
            event.preventDefault();
        }
    };

    return (
        <>
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
                    <label
                        className={`abtn abtn--action admin-upload-button${uploading ? ' is-disabled' : ''}`}
                        aria-disabled={uploading}
                    >
                        <i className="fas fa-cloud-arrow-up" aria-hidden="true"></i>
                        {uploading ? 'Enviando…' : 'Enviar arquivos'}
                        <input
                            className="admin-visually-hidden"
                            type="file"
                            multiple
                            accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.zip"
                            disabled={uploading}
                            onChange={enviarAoEscolher}
                        />
                    </label>
                </div>
            </div>

            {uploadState.message && (
                <div
                    role={uploadState.ok ? 'status' : 'alert'}
                    className={uploadState.ok ? 'anote anote--success' : 'anote anote--warning'}
                >
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

            <div className="agrid agrid--3 media-summary-grid">
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

            <section className="acard media-library" aria-label="Acervo da biblioteca">
                <div className="atoolbar">
                    <label className="media-library__filter" htmlFor="media-type-filter">
                        <span>Mostrar</span>
                        <select
                            id="media-type-filter"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as 'todos' | MediaKind)}
                        >
                            {FILTROS.map((filtro) => (
                                <option value={filtro.value} key={filtro.value}>
                                    {filtro.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <span className="atoolbar__spacer"></span>
                    <span className="atoolbar__count" aria-live="polite">
                        <strong>{filtered.length}</strong>{' '}
                        {filtered.length === 1 ? 'arquivo' : 'arquivos'}
                    </span>
                </div>

                <label className={`adropzone${uploading ? ' is-uploading' : ''}`}>
                    <i className="fas fa-cloud-arrow-up" aria-hidden="true"></i>
                    <strong>
                        {uploading
                            ? 'Enviando arquivos…'
                            : 'Clique para selecionar os arquivos'}
                    </strong>
                    <span>
                        JPG, PNG, WebP, PDF, Office e ZIP · até 5 itens por vez · máximo de 10
                        MB por arquivo
                    </span>
                    <input
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.zip"
                        disabled={uploading}
                        onChange={enviarAoEscolher}
                    />
                </label>

                {filtered.length ? (
                    <div className="media-grid">
                        {filtered.map((arquivo) => (
                            <article className="media-item" key={arquivo.id}>
                                {arquivo.kind === 'IMAGEM' ? (
                                    <div className="media-item__img">
                                        <span className="media-item__image-fallback" aria-hidden="true">
                                            <i className="fas fa-image"></i>
                                            Prévia indisponível
                                        </span>
                                        <span
                                            className="media-item__image-photo"
                                            aria-hidden="true"
                                            style={{ backgroundImage: `url("${arquivo.url}")` }}
                                        ></span>
                                    </div>
                                ) : (
                                    <div
                                        className={`media-item__img media-item__img--file media-item__img--${arquivo.kind.toLowerCase()}`}
                                    >
                                        <i
                                            className={`fas ${
                                                arquivo.kind === 'DOCUMENTO'
                                                    ? 'fa-file-pdf'
                                                    : 'fa-file'
                                            }`}
                                            aria-hidden="true"
                                        ></i>
                                    </div>
                                )}
                                <div className="media-item__body">
                                    <strong className="media-item__name" title={arquivo.name}>
                                        {arquivo.name}
                                    </strong>
                                    <div className="media-item__meta">
                                        <span>{arquivo.size}</span>
                                        <span>{arquivo.uploadedAt}</span>
                                    </div>
                                    {arquivo.usos > 0 && (
                                        <span className="media-item__usage">
                                            <i className="fas fa-link" aria-hidden="true"></i>
                                            Em uso em {arquivo.usos} registro(s)
                                        </span>
                                    )}
                                    <form action={deleteAction} className="media-item__actions">
                                        <input type="hidden" name="id" value={arquivo.id} />
                                        <button
                                            className="abtn abtn--danger abtn--sm abtn--block"
                                            type="submit"
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
                                            <i className="fas fa-trash" aria-hidden="true"></i>{' '}
                                            Remover
                                        </button>
                                    </form>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <div className="aempty">
                        <i className="fas fa-photo-film"></i>
                        <strong>Nenhum arquivo neste filtro</strong>
                        <span>Envie um arquivo ou mude o tipo selecionado.</span>
                    </div>
                )}
            </section>

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
