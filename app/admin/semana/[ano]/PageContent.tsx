'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { atualizarEdicao, excluirMaterial, excluirPrograma } from '../actions';
import EdicaoForm, { type EdicaoDefaults } from '../EdicaoForm';
import MaterialForm, { type MaterialDefaults } from './MaterialForm';
import ProgramaForm, { type ProgramaDefaults } from './ProgramaForm';

export type MaterialRow = MaterialDefaults;

export type ProgramaRow = ProgramaDefaults;

export interface MediaOption {
    id: string;
    label: string;
}

interface PageContentProps {
    edicaoId: string;
    ano: number;
    titulo: string;
    subtitulo: string;
    defaults: EdicaoDefaults;
    materiais: MaterialRow[];
    programacao: ProgramaRow[];
    mediaOptions: MediaOption[];
}

const NOVO_MATERIAL: MaterialDefaults = {
    id: '',
    icon: 'fa-file-lines',
    title: '',
    meta: '',
    fileUrl: '',
    mediaId: '',
    order: 0,
};

const NOVA_ATIVIDADE: ProgramaDefaults = {
    id: '',
    dia: '',
    title: '',
    text: '',
    order: 0,
};

export default function PageContent({
    edicaoId,
    ano,
    titulo,
    subtitulo,
    defaults,
    materiais,
    programacao,
    mediaOptions,
}: PageContentProps) {
    const [materialEditandoId, setMaterialEditandoId] = useState<string | null>(null);
    const [atividadeEditandoId, setAtividadeEditandoId] = useState<string | null>(null);

    // Guardamos só o id: a linha vem sempre da lista recém-revalidada, senão o
    // formulário continuaria mostrando os valores anteriores depois de salvar.
    const materialEditando = useMemo(
        () => materiais.find((item) => item.id === materialEditandoId) ?? null,
        [materiais, materialEditandoId],
    );
    const atividadeEditando = useMemo(
        () => programacao.find((item) => item.id === atividadeEditandoId) ?? null,
        [programacao, atividadeEditandoId],
    );

    // A próxima ordem sugerida continua a sequência já existente.
    const proximaOrdemMaterial = materiais.length
        ? Math.max(...materiais.map((item) => item.order)) + 1
        : 0;
    const proximaOrdemAtividade = programacao.length
        ? Math.max(...programacao.map((item) => item.order)) + 1
        : 0;

    const materialDefaults = materialEditando ?? {
        ...NOVO_MATERIAL,
        order: proximaOrdemMaterial,
    };
    const atividadeDefaults = atividadeEditando ?? {
        ...NOVA_ATIVIDADE,
        order: proximaOrdemAtividade,
    };

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> /{' '}
                        <Link href="/admin/semana">Semana do Migrante</Link>
                    </div>
                    <h1>{titulo}</h1>
                    <p>{subtitulo}</p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/admin/semana">
                        <i className="fas fa-arrow-left"></i> Voltar
                    </Link>
                    <Link className="abtn abtn--ghost" href={`/semana-do-migrante/${ano}`}>
                        <i className="fas fa-arrow-up-right-from-square"></i> Ver página pública
                    </Link>
                </div>
            </div>

            <EdicaoForm
                action={atualizarEdicao}
                defaults={defaults}
                title="Dados da edição"
                description="Tema, lema, período e texto de abertura exibidos na página pública."
                submitLabel="Salvar edição"
            />

            <div className="acard">
                <div className="acard__head">
                    <div>
                        <h2>Materiais de apoio</h2>
                        <p>Subsídios que a rede baixa para preparar a semana.</p>
                    </div>
                </div>

                {materiais.length ? (
                    <div className="atable-wrap">
                        <table className="atable">
                            <thead>
                                <tr>
                                    <th>Material</th>
                                    <th>Formato</th>
                                    <th>Arquivo</th>
                                    <th>Ordem</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {materiais.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="atable__cell-media">
                                                <i className={`fas ${item.icon}`}></i>
                                                <span>
                                                    <span className="atable__title">
                                                        {item.title}
                                                    </span>
                                                    <span className="atable__sub">{item.icon}</span>
                                                </span>
                                            </div>
                                        </td>
                                        <td>{item.meta}</td>
                                        <td>
                                            {item.mediaId
                                                ? 'Biblioteca de mídia'
                                                : item.fileUrl || '—'}
                                        </td>
                                        <td>{item.order}</td>
                                        <td>
                                            <div className="atable__actions">
                                                <button
                                                    type="button"
                                                    className="abtn abtn--ghost abtn--sm"
                                                    onClick={() => setMaterialEditandoId(item.id)}
                                                    title="Editar material"
                                                >
                                                    <i className="fas fa-pen"></i>
                                                </button>
                                                <form action={excluirMaterial}>
                                                    <input
                                                        type="hidden"
                                                        name="id"
                                                        value={item.id}
                                                    />
                                                    <button
                                                        className="abtn abtn--danger abtn--sm"
                                                        title="Remover material"
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
                        <i className="fas fa-file-lines"></i>
                        <strong>Nenhum material cadastrado</strong>
                        <span>Adicione o texto-base, o subsídio litúrgico e os cartazes.</span>
                    </div>
                )}
            </div>

            <div className="acard">
                <div className="acard__head">
                    <div>
                        <h3>{materialEditando ? 'Editar material' : 'Novo material'}</h3>
                        <p>Vincule um arquivo da biblioteca ou informe o endereço direto.</p>
                    </div>
                </div>

                <MaterialForm
                    key={materialEditando?.id ?? 'novo-material'}
                    edicaoId={edicaoId}
                    defaults={materialDefaults}
                    mediaOptions={mediaOptions}
                    onDone={() => setMaterialEditandoId(null)}
                />
            </div>

            <div className="acard">
                <div className="acard__head">
                    <div>
                        <h2>Programação</h2>
                        <p>Roteiro dia a dia exibido na página da edição.</p>
                    </div>
                </div>

                {programacao.length ? (
                    <div className="atable-wrap">
                        <table className="atable">
                            <thead>
                                <tr>
                                    <th>Dia</th>
                                    <th>Atividade</th>
                                    <th>Ordem</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {programacao.map((item) => (
                                    <tr key={item.id}>
                                        <td>{item.dia}</td>
                                        <td>
                                            <span className="atable__title">{item.title}</span>
                                            <span className="atable__sub">{item.text}</span>
                                        </td>
                                        <td>{item.order}</td>
                                        <td>
                                            <div className="atable__actions">
                                                <button
                                                    type="button"
                                                    className="abtn abtn--ghost abtn--sm"
                                                    onClick={() => setAtividadeEditandoId(item.id)}
                                                    title="Editar atividade"
                                                >
                                                    <i className="fas fa-pen"></i>
                                                </button>
                                                <form action={excluirPrograma}>
                                                    <input
                                                        type="hidden"
                                                        name="id"
                                                        value={item.id}
                                                    />
                                                    <button
                                                        className="abtn abtn--danger abtn--sm"
                                                        title="Remover atividade"
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
                        <i className="fas fa-list-check"></i>
                        <strong>Programação vazia</strong>
                        <span>Cadastre as atividades de cada dia da semana.</span>
                    </div>
                )}
            </div>

            <div className="acard">
                <div className="acard__head">
                    <div>
                        <h3>{atividadeEditando ? 'Editar atividade' : 'Nova atividade'}</h3>
                        <p>Use o campo de ordem para organizar o roteiro.</p>
                    </div>
                </div>

                <ProgramaForm
                    key={atividadeEditando?.id ?? 'nova-atividade'}
                    edicaoId={edicaoId}
                    defaults={atividadeDefaults}
                    onDone={() => setAtividadeEditandoId(null)}
                />
            </div>
        </>
    );
}
