'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { PostStatus } from '@/lib/generated/prisma/enums';
import { MAX_ADMIN_UPLOAD_BYTES, uploadAdminFile } from '@/lib/client/admin-upload';
import { salvarNoticia } from '../actions';
import { slugify } from '../slug';

/** Mesmo formato de `ActionState`, redeclarado aqui: `lib/server` é server-only. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

export interface CategoriaEditor {
    id: string;
    name: string;
}

export interface ImagemEditor {
    id: string;
    url: string;
    originalName: string;
}

export interface NoticiaEditor {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    categoryId: string;
    /** Tags separadas por vírgula, prontas para o campo de texto. */
    tags: string;
    /** "2026-08-14" ou string vazia. */
    publishedAt: string;
    status: PostStatus;
    highlight: boolean;
    coverUrl: string | null;
    coverMediaId: string | null;
}

interface Props {
    categorias: CategoriaEditor[];
    imagens: ImagemEditor[];
    autor: { name: string; initials: string; role: string };
    /** Ausente na criação; preenchido na edição. */
    post?: NoticiaEditor | null;
    /** Data sugerida quando a notícia ainda não tem uma. */
    dataPadrao: string;
}

const ERRO_HINT = { color: '#c2185b' } as const;

export default function PageContent({ categorias, imagens, autor, post, dataPadrao }: Props) {
    const editando = Boolean(post);

    const [state, formAction, pending] = useActionState<FormState, FormData>(salvarNoticia, {
        ok: false,
    });

    const [title, setTitle] = useState(post?.title ?? '');
    const [slug, setSlug] = useState(post?.slug ?? '');
    // Enquanto ninguém mexer no endereço, ele acompanha o título.
    const [slugTouched, setSlugTouched] = useState(Boolean(post?.slug));
    const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
    const [content, setContent] = useState(post?.content ?? '');

    const [tagsText, setTagsText] = useState(post?.tags ?? '');
    // Os campos abaixo também são controlados porque o React limpa os campos não
    // controlados a cada envio — sem isso a pessoa perderia o que escolheu
    // quando o formulário voltasse com erro de validação.
    const [status, setStatus] = useState<PostStatus>(post?.status ?? 'RASCUNHO');
    const [publishedAt, setPublishedAt] = useState(post?.publishedAt || dataPadrao);
    const [highlight, setHighlight] = useState(post?.highlight ?? false);
    const [categoryId, setCategoryId] = useState(post?.categoryId ?? categorias[0]?.id ?? '');

    const [cover, setCover] = useState<string>(post?.coverUrl ?? '');
    const [coverMediaId, setCoverMediaId] = useState<string>(post?.coverMediaId ?? '');
    const [uploadedName, setUploadedName] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadingCover, setUploadingCover] = useState(false);
    const uploadVersion = useRef(0);
    const arquivoInput = useRef<HTMLInputElement>(null);

    const onTitleChange = (value: string) => {
        setTitle(value);
        if (!slugTouched) {
            setSlug(slugify(value));
        }
    };

    const onSlugChange = (value: string) => {
        setSlugTouched(true);
        setSlug(slugify(value));
    };

    const escolherDoAcervo = (imagem: ImagemEditor) => {
        uploadVersion.current += 1;
        if (arquivoInput.current) {
            arquivoInput.current.value = '';
        }

        setCover(imagem.url);
        setCoverMediaId(imagem.id);
        setUploadedName(null);
        setUploadError(null);
        setUploadingCover(false);
    };

    const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        const version = ++uploadVersion.current;
        setUploadError(null);
        setUploadedName(file.name);
        setCoverMediaId('');

        if (!/\.(?:jpe?g|png|webp)$/i.test(file.name)) {
            setUploadError('A capa precisa ser JPG, PNG ou WebP.');
            setUploadedName(null);
            event.target.value = '';
            return;
        }
        if (file.size > MAX_ADMIN_UPLOAD_BYTES) {
            setUploadError('Arquivo maior que o limite de 10 MB.');
            setUploadedName(null);
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = () => setCover(String(reader.result));
        reader.readAsDataURL(file);

        setUploadingCover(true);
        try {
            const media = await uploadAdminFile(file, 'noticias');
            if (version !== uploadVersion.current) return;
            setCover(media.url);
            setCoverMediaId(media.id);
            setUploadedName(media.originalName);
        } catch (error) {
            if (version !== uploadVersion.current) return;
            setCover(post?.coverUrl ?? '');
            setCoverMediaId(post?.coverMediaId ?? '');
            setUploadedName(null);
            setUploadError(
                error instanceof Error ? error.message : 'Não foi possível enviar a capa.',
            );
        } finally {
            if (version === uploadVersion.current) setUploadingCover(false);
            if (arquivoInput.current) arquivoInput.current.value = '';
        }
    };

    // O `Set` evita chave repetida no React quando a pessoa digita a mesma tag duas vezes.
    const tagsPreview = Array.from(
        new Set(
            tagsText
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
        ),
    );

    return (
        <form action={formAction}>
            {editando && <input type="hidden" name="id" value={post?.id ?? ''} />}
            {/* A capa vem de um upload novo, do acervo ou do que já estava salvo. */}
            <input type="hidden" name="coverMediaId" value={coverMediaId} />
            <input
                type="hidden"
                name="coverUrl"
                value={cover.startsWith('data:') ? (post?.coverUrl ?? '') : cover}
            />

            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> /{' '}
                        <Link href="/admin/noticias">Notícias</Link> /{' '}
                        {editando ? 'Editar' : 'Nova'}
                    </div>
                    <h1>{editando ? 'Editar notícia' : 'Nova notícia'}</h1>
                    <p>
                        Escreva, escolha a imagem de capa e defina se a publicação vai ao ar agora
                        ou depois.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/admin/noticias">
                        <i className="fas fa-arrow-left"></i> Cancelar
                    </Link>
                    <button
                        className="abtn abtn--primary"
                        type="submit"
                        name="intencao"
                        value="salvar"
                        disabled={pending || uploadingCover}
                    >
                        <i className="fas fa-floppy-disk"></i>{' '}
                        {pending
                            ? 'Salvando…'
                            : uploadingCover
                              ? 'Enviando capa…'
                              : 'Salvar rascunho'}
                    </button>
                    <button
                        className="abtn abtn--action"
                        type="submit"
                        name="intencao"
                        value="publicar"
                        disabled={pending || uploadingCover}
                    >
                        <i className="fas fa-paper-plane"></i> Publicar agora
                    </button>
                </div>
            </div>

            {state.message && (
                <div className={state.ok ? 'anote anote--success' : 'anote anote--warning'}>
                    <i
                        className={`fas ${state.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}
                    ></i>
                    <div>
                        <strong>{state.ok ? 'Tudo certo.' : 'Verifique o formulário.'}</strong>{' '}
                        {state.message}
                    </div>
                </div>
            )}

            <div className="agrid agrid--sidebar">
                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>Conteúdo</h2>
                                <p>O texto que será exibido na página pública da notícia.</p>
                            </div>
                        </div>

                        <div className="afield">
                            <label htmlFor="titulo">Título</label>
                            <input
                                id="titulo"
                                name="title"
                                type="text"
                                value={title}
                                onChange={(e) => onTitleChange(e.target.value)}
                                placeholder="Ex.: Mutirão na fronteira garante documentação a 380 famílias"
                            />
                            {state.fieldErrors?.title && (
                                <span className="afield__hint" style={ERRO_HINT}>
                                    {state.fieldErrors.title}
                                </span>
                            )}
                        </div>

                        <div className="afield">
                            <label htmlFor="slug">Endereço da página (slug)</label>
                            <input
                                id="slug"
                                name="slug"
                                type="text"
                                value={slug}
                                onChange={(e) => onSlugChange(e.target.value)}
                                placeholder="mutirao-fronteira-380-familias"
                            />
                            <span className="afield__hint">
                                spmnacional.org.br/publicacoes/blog/
                                <strong>{slug || 'endereco-da-pagina'}</strong>
                            </span>
                            {state.fieldErrors?.slug && (
                                <span className="afield__hint" style={ERRO_HINT}>
                                    {state.fieldErrors.slug}
                                </span>
                            )}
                        </div>

                        <div className="afield">
                            <label htmlFor="resumo">Resumo</label>
                            <textarea
                                id="resumo"
                                name="excerpt"
                                style={{ minHeight: '100px' }}
                                value={excerpt}
                                onChange={(e) => setExcerpt(e.target.value)}
                                placeholder="Duas ou três linhas que aparecem nos cards do blog e nas redes sociais."
                            ></textarea>
                            <span className="afield__hint">
                                {excerpt.length} caracteres · ideal até 220
                            </span>
                            {state.fieldErrors?.excerpt && (
                                <span className="afield__hint" style={ERRO_HINT}>
                                    {state.fieldErrors.excerpt}
                                </span>
                            )}
                        </div>

                        <div className="afield" style={{ marginBottom: '0' }}>
                            <label htmlFor="conteudo">Texto completo</label>
                            <textarea
                                id="conteudo"
                                name="content"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Escreva a matéria. Use uma linha em branco para separar parágrafos."
                            ></textarea>
                            <span className="afield__hint">
                                {content.length} caracteres · aceita Markdown simples (##, listas,
                                &gt; citação)
                            </span>
                            {state.fieldErrors?.content && (
                                <span className="afield__hint" style={ERRO_HINT}>
                                    {state.fieldErrors.content}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>Imagem de capa</h2>
                                <p>
                                    Envie um arquivo ou escolha uma imagem já existente no acervo.
                                </p>
                            </div>
                        </div>

                        <div
                            className="acover-preview"
                            style={cover ? { backgroundImage: `url(${cover})` } : undefined}
                        >
                            {!cover && (
                                <div className="acover-preview__empty">
                                    <i className="fas fa-image"></i>
                                    <span>Nenhuma capa selecionada</span>
                                </div>
                            )}
                        </div>

                        <label className="adropzone">
                            <i className="fas fa-cloud-arrow-up"></i>
                            <strong>Clique para enviar uma imagem</strong>
                            <span>JPG, PNG ou WebP · até 10 MB · recomendado 1200 × 675 px</span>
                            <input
                                ref={arquivoInput}
                                type="file"
                                accept=".jpg,.jpeg,.png,.webp"
                                onChange={onFileSelected}
                            />
                        </label>

                        {(uploadError || state.fieldErrors?.cover) && (
                            <div className="anote anote--warning" style={{ margin: '1rem 0 0' }}>
                                <i className="fas fa-triangle-exclamation"></i>
                                <div>{uploadError || state.fieldErrors?.cover}</div>
                            </div>
                        )}

                        {uploadedName && (
                            <div className="anote anote--success" style={{ margin: '1rem 0 0' }}>
                                <i className="fas fa-file-image"></i>
                                <div>
                                    Arquivo enviado: <strong>{uploadedName}</strong> — ele já está
                                    protegido na biblioteca.
                                </div>
                            </div>
                        )}

                        <p
                            style={{
                                fontSize: '0.78rem',
                                color: '#93a1af',
                                margin: '1.25rem 0 0.6rem',
                            }}
                        >
                            Ou escolha do acervo:
                        </p>

                        {imagens.length ? (
                            <div className="media-grid">
                                {imagens.map((imagem) => (
                                    <button
                                        type="button"
                                        className="media-item"
                                        style={{
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            padding: '0',
                                            borderWidth: '2px',
                                            borderColor:
                                                coverMediaId === imagem.id
                                                    ? 'var(--color-action)'
                                                    : '#e6ebf1',
                                        }}
                                        onClick={() => escolherDoAcervo(imagem)}
                                        title={imagem.originalName}
                                        key={imagem.id}
                                    >
                                        <span
                                            className="media-item__img"
                                            style={{
                                                display: 'block',
                                                backgroundImage: `url(${imagem.url})`,
                                            }}
                                        ></span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="aempty">
                                <i className="fas fa-image"></i>
                                <strong>O acervo ainda não tem imagens</strong>
                                <span>Envie a primeira pela biblioteca de mídia.</span>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Publicação</h3>
                            </div>
                        </div>

                        <div className="afield">
                            <label htmlFor="status">Status</label>
                            <select
                                id="status"
                                name="status"
                                value={status}
                                onChange={(e) => setStatus(e.target.value as PostStatus)}
                            >
                                <option value="RASCUNHO">Rascunho</option>
                                <option value="REVISAO">Enviar para revisão</option>
                                <option value="AGENDADO">Agendado</option>
                                <option value="PUBLICADO">Publicado</option>
                            </select>
                        </div>

                        <div className="afield">
                            <label htmlFor="data">Data de publicação</label>
                            <input
                                id="data"
                                name="publishedAt"
                                type="date"
                                value={publishedAt}
                                onChange={(e) => setPublishedAt(e.target.value)}
                            />
                            {state.fieldErrors?.publishedAt && (
                                <span className="afield__hint" style={ERRO_HINT}>
                                    {state.fieldErrors.publishedAt}
                                </span>
                            )}
                        </div>

                        <label className="aswitch" style={{ marginTop: '0.5rem' }}>
                            <input
                                type="checkbox"
                                name="highlight"
                                checked={highlight}
                                onChange={(e) => setHighlight(e.target.checked)}
                            />
                            <span className="aswitch__track"></span>
                            <span className="aswitch__label">Destacar na página inicial</span>
                        </label>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Organização</h3>
                            </div>
                        </div>

                        <div className="afield">
                            <label htmlFor="categoria">Categoria</label>
                            <select
                                id="categoria"
                                name="categoryId"
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                            >
                                {categorias.map((c) => (
                                    <option value={c.id} key={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                            {state.fieldErrors?.categoryId && (
                                <span className="afield__hint" style={ERRO_HINT}>
                                    {state.fieldErrors.categoryId}
                                </span>
                            )}
                        </div>

                        <div className="afield" style={{ marginBottom: '0' }}>
                            <label htmlFor="tags">Tags</label>
                            <input
                                id="tags"
                                name="tags"
                                type="text"
                                value={tagsText}
                                onChange={(e) => setTagsText(e.target.value)}
                                placeholder="moradia, fronteira, documentação"
                            />
                            <span className="afield__hint">Separe por vírgula.</span>
                            {tagsPreview.length > 0 && (
                                <div
                                    style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '0.4rem',
                                        marginTop: '0.5rem',
                                    }}
                                >
                                    {tagsPreview.map((tag) => (
                                        <span className="abadge abadge--info" key={tag}>
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Autoria</h3>
                            </div>
                        </div>
                        <div className="atable__cell-media">
                            <span className="aavatar">{autor.initials}</span>
                            <span>
                                <span className="atable__title">{autor.name}</span>
                                <span className="atable__sub">{autor.role}</span>
                            </span>
                        </div>
                    </div>

                    <div className="anote">
                        <i className="fas fa-circle-info"></i>
                        <div>
                            <strong>Como fica no site.</strong> Rascunho, revisão e agendado não
                            aparecem no blog. Para programar uma estreia, escolha{' '}
                            <strong>Publicado</strong> com uma data futura: a matéria só entra no ar
                            naquele dia.
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
}
