'use client';

import { useActionState } from 'react';

/** Espelha `ActionState` do servidor — o módulo original é server-only. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

export interface EdicaoDefaults {
    id?: string;
    ano: string;
    edicao: string;
    tema: string;
    lema: string;
    periodo: string;
    startsOn: string;
    endsOn: string;
    coverUrl: string;
    resumo: string;
    citacao: string;
    objetivos: string;
    published: boolean;
}

interface EdicaoFormProps {
    action: (prev: FormState, formData: FormData) => Promise<FormState>;
    defaults: EdicaoDefaults;
    title: string;
    description: string;
    submitLabel: string;
}

export const EMPTY_EDICAO: EdicaoDefaults = {
    ano: '',
    edicao: '',
    tema: '',
    lema: '',
    periodo: '',
    startsOn: '',
    endsOn: '',
    coverUrl: '',
    resumo: '',
    citacao: '',
    objetivos: '',
    published: true,
};

export default function EdicaoForm({
    action,
    defaults,
    title,
    description,
    submitLabel,
}: EdicaoFormProps) {
    const [state, formAction, pending] = useActionState<FormState, FormData>(action, { ok: false });

    // Depois de criar, o id devolvido muda e o formulário remonta já limpo.
    const formKey = `${defaults.id ?? 'novo'}-${String(state.data?.id ?? '')}`;

    return (
        <form action={formAction} key={formKey}>
            {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

            <div className="acard">
                <div className="acard__head">
                    <div>
                        <h2>{title}</h2>
                        <p>{description}</p>
                    </div>
                </div>

                {state.message && (
                    <div
                        className={state.ok ? 'anote anote--success' : 'anote anote--warning'}
                        style={{ marginTop: 0 }}
                    >
                        <i
                            className={`fas ${state.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}
                        ></i>
                        <div>{state.message}</div>
                    </div>
                )}

                <div className="afield-row">
                    <div className="afield">
                        <label htmlFor={`ano-${formKey}`}>Ano</label>
                        <input
                            id={`ano-${formKey}`}
                            name="ano"
                            type="number"
                            min={1985}
                            max={2100}
                            defaultValue={defaults.ano}
                            placeholder="2026"
                        />
                        <span className="afield__hint">
                            O ano define o endereço público da edição.
                        </span>
                        {state.fieldErrors?.ano && (
                            <span className="afield__hint" style={{ color: '#c2185b' }}>
                                {state.fieldErrors.ano}
                            </span>
                        )}
                    </div>

                    <div className="afield">
                        <label htmlFor={`edicao-${formKey}`}>Edição</label>
                        <input
                            id={`edicao-${formKey}`}
                            name="edicao"
                            type="text"
                            defaultValue={defaults.edicao}
                            placeholder="41ª Semana do Migrante"
                        />
                        {state.fieldErrors?.edicao && (
                            <span className="afield__hint" style={{ color: '#c2185b' }}>
                                {state.fieldErrors.edicao}
                            </span>
                        )}
                    </div>
                </div>

                <div className="afield-row">
                    <div className="afield">
                        <label htmlFor={`tema-${formKey}`}>Tema</label>
                        <input
                            id={`tema-${formKey}`}
                            name="tema"
                            type="text"
                            defaultValue={defaults.tema}
                            placeholder="Migração e Moradia"
                        />
                        {state.fieldErrors?.tema && (
                            <span className="afield__hint" style={{ color: '#c2185b' }}>
                                {state.fieldErrors.tema}
                            </span>
                        )}
                    </div>

                    <div className="afield">
                        <label htmlFor={`lema-${formKey}`}>Lema</label>
                        <input
                            id={`lema-${formKey}`}
                            name="lema"
                            type="text"
                            defaultValue={defaults.lema}
                            placeholder="“Eu não tenho onde morar!”"
                        />
                        {state.fieldErrors?.lema && (
                            <span className="afield__hint" style={{ color: '#c2185b' }}>
                                {state.fieldErrors.lema}
                            </span>
                        )}
                    </div>
                </div>

                <div className="afield">
                    <label htmlFor={`periodo-${formKey}`}>Período (texto exibido)</label>
                    <input
                        id={`periodo-${formKey}`}
                        name="periodo"
                        type="text"
                        defaultValue={defaults.periodo}
                        placeholder="14 a 21 de junho de 2026"
                    />
                    {state.fieldErrors?.periodo && (
                        <span className="afield__hint" style={{ color: '#c2185b' }}>
                            {state.fieldErrors.periodo}
                        </span>
                    )}
                </div>

                <div className="afield-row">
                    <div className="afield">
                        <label htmlFor={`startsOn-${formKey}`}>Data de início</label>
                        <input
                            id={`startsOn-${formKey}`}
                            name="startsOn"
                            type="date"
                            defaultValue={defaults.startsOn}
                        />
                    </div>
                    <div className="afield">
                        <label htmlFor={`endsOn-${formKey}`}>Data de encerramento</label>
                        <input
                            id={`endsOn-${formKey}`}
                            name="endsOn"
                            type="date"
                            defaultValue={defaults.endsOn}
                        />
                    </div>
                </div>

                <div className="afield">
                    <label htmlFor={`coverUrl-${formKey}`}>Imagem de capa</label>
                    <input
                        id={`coverUrl-${formKey}`}
                        name="coverUrl"
                        type="text"
                        defaultValue={defaults.coverUrl}
                        placeholder="/assets/house.jpg"
                    />
                    <span className="afield__hint">
                        Caminho de um arquivo da biblioteca de mídia ou endereço completo.
                    </span>
                    {state.fieldErrors?.coverUrl && (
                        <span className="afield__hint" style={{ color: '#c2185b' }}>
                            {state.fieldErrors.coverUrl}
                        </span>
                    )}
                </div>

                <div className="afield">
                    <label htmlFor={`resumo-${formKey}`}>Texto de abertura</label>
                    <textarea
                        id={`resumo-${formKey}`}
                        name="resumo"
                        defaultValue={defaults.resumo}
                        placeholder={
                            'Parágrafos separados por linha em branco.\n\n## Subtítulo\n\n> Citação'
                        }
                    ></textarea>
                    <span className="afield__hint">
                        Markdown simplificado: parágrafos, ## subtítulo, listas e &gt; citação.
                    </span>
                    {state.fieldErrors?.resumo && (
                        <span className="afield__hint" style={{ color: '#c2185b' }}>
                            {state.fieldErrors.resumo}
                        </span>
                    )}
                </div>

                <div className="afield">
                    <label htmlFor={`citacao-${formKey}`}>Citação em destaque</label>
                    <input
                        id={`citacao-${formKey}`}
                        name="citacao"
                        type="text"
                        defaultValue={defaults.citacao}
                        placeholder="Frase curta destacada na página da edição."
                    />
                    {state.fieldErrors?.citacao && (
                        <span className="afield__hint" style={{ color: '#c2185b' }}>
                            {state.fieldErrors.citacao}
                        </span>
                    )}
                </div>

                <div className="afield">
                    <label htmlFor={`objetivos-${formKey}`}>Objetivos</label>
                    <textarea
                        id={`objetivos-${formKey}`}
                        name="objetivos"
                        defaultValue={defaults.objetivos}
                        style={{ minHeight: '140px' }}
                        placeholder={'Um objetivo por linha.'}
                    ></textarea>
                    <span className="afield__hint">Um objetivo por linha.</span>
                </div>

                <label className="aswitch" style={{ marginBottom: '1.25rem' }}>
                    <input type="checkbox" name="published" defaultChecked={defaults.published} />
                    <span className="aswitch__track"></span>
                    <span className="aswitch__label">Publicar esta edição no site</span>
                </label>

                <button className="abtn abtn--action" disabled={pending}>
                    <i className="fas fa-floppy-disk"></i> {pending ? 'Salvando…' : submitLabel}
                </button>
            </div>
        </form>
    );
}
