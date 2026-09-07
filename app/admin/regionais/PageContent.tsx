'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import type { Regiao } from '@/lib/generated/prisma/enums';
import { REGIAO_LABEL } from '@/lib/labels';
import { alternarAtivaRegional, excluirRegional, salvarRegional } from './actions';
import { UFS } from './ufs';

export interface RegionalRow {
    id: string;
    slug: string;
    uf: string;
    city: string;
    name: string;
    region: Regiao;
    description: string;
    focus: string[];
    address: string;
    phone: string;
    email: string;
    active: boolean;
    order: number;
    /** Vínculos que impedem a exclusão. */
    usuarios: number;
    atendimentos: number;
}

interface Props {
    regionais: RegionalRow[];
}

/** `ActionState` vive em módulo `server-only`; o contrato é redeclarado aqui. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const IDLE: FormState = { ok: false };

const REGIOES: Regiao[] = ['NORTE', 'NORDESTE', 'CENTRO_OESTE', 'SUDESTE', 'SUL'];

function erro(state: FormState, campo: string) {
    const mensagem = state.fieldErrors?.[campo];
    if (!mensagem) return null;
    return (
        <span className="afield__hint" style={{ color: '#c2185b' }}>
            {mensagem}
        </span>
    );
}

export default function PageContent({ regionais }: Props) {
    const [busca, setBusca] = useState('');
    const [filtroRegiao, setFiltroRegiao] = useState<'todas' | Regiao>('todas');
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [reset, setReset] = useState(0);

    const [salvarState, salvarAction, salvando] = useActionState<FormState, FormData>(
        salvarRegional,
        IDLE,
    );
    const [excluirState, excluirAction, excluindo] = useActionState<FormState, FormData>(
        excluirRegional,
        IDLE,
    );
    const [ativarState, ativarAction, alterandoAtiva] = useActionState<FormState, FormData>(
        alternarAtivaRegional,
        IDLE,
    );

    useEffect(() => {
        if (salvarState.ok) {
            setEditandoId(null);
            setReset((valor) => valor + 1);
        }
    }, [salvarState]);

    const emEdicao = useMemo(
        () => regionais.find((item) => item.id === editandoId) ?? null,
        [regionais, editandoId],
    );

    const filtrados = useMemo(() => {
        const termo = busca.trim().toLowerCase();

        return regionais.filter((item) => {
            const combinaTermo =
                !termo ||
                item.name.toLowerCase().includes(termo) ||
                item.city.toLowerCase().includes(termo) ||
                item.uf.toLowerCase().includes(termo) ||
                item.slug.includes(termo);
            const combinaRegiao = filtroRegiao === 'todas' || item.region === filtroRegiao;
            return combinaTermo && combinaRegiao;
        });
    }, [regionais, busca, filtroRegiao]);

    const ativas = regionais.filter((item) => item.active).length;
    const ufsAtendidas = new Set(regionais.filter((item) => item.active).map((item) => item.uf))
        .size;

    /**
     * Exclusão e ativação escrevem no mesmo aviso da lista. Guardamos o último
     * retorno porque `useActionState` mantém o estado anterior indefinidamente:
     * sem isso, a recusa por vínculos existentes ficaria congelada na tela e
     * esconderia o resultado das ativações seguintes.
     */
    const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

    useEffect(() => {
        if (excluirState.message) {
            setAviso({ ok: excluirState.ok, texto: excluirState.message });
        }
    }, [excluirState]);

    useEffect(() => {
        if (ativarState.message) {
            setAviso({ ok: ativarState.ok, texto: ativarState.message });
        }
    }, [ativarState]);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> / Sistema
                    </div>
                    <h1>Regionais</h1>
                    <p>
                        Equipes do SPM espalhadas pelo país. A lista alimenta a página “Onde
                        estamos”, o vínculo dos usuários e o registro de atendimentos.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/onde-estamos">
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
                            <i className="fas fa-plus"></i> Nova regional
                        </button>
                    )}
                </div>
            </div>

            <div className="agrid agrid--3" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-tile">
                    <span className="stat-tile__icon">
                        <i className="fas fa-map-location-dot"></i>
                    </span>
                    <div>
                        <strong>{regionais.length}</strong>
                        <span>Regionais cadastradas</span>
                    </div>
                </div>
                <div className="stat-tile is-success">
                    <span className="stat-tile__icon">
                        <i className="fas fa-circle-check"></i>
                    </span>
                    <div>
                        <strong>{ativas}</strong>
                        <span>Ativas no site</span>
                    </div>
                </div>
                <div className="stat-tile is-action">
                    <span className="stat-tile__icon">
                        <i className="fas fa-flag"></i>
                    </span>
                    <div>
                        <strong>{ufsAtendidas}</strong>
                        <span>UFs atendidas</span>
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
                                aria-label="Buscar regionais"
                                placeholder="Buscar por nome, cidade, UF ou identificador…"
                                value={busca}
                                onChange={(event) => setBusca(event.target.value)}
                            />
                            <select
                                aria-label="Filtrar regionais por região"
                                value={filtroRegiao}
                                onChange={(event) =>
                                    setFiltroRegiao(event.target.value as 'todas' | Regiao)
                                }
                            >
                                <option value="todas">Todas as regiões</option>
                                {REGIOES.map((regiao) => (
                                    <option key={regiao} value={regiao}>
                                        {REGIAO_LABEL[regiao]}
                                    </option>
                                ))}
                            </select>
                            <span className="atoolbar__spacer"></span>
                            <span className="atoolbar__count">
                                {filtrados.length} de {regionais.length} registros
                            </span>
                        </div>

                        {filtrados.length ? (
                            <div className="atable-wrap">
                                <table className="atable">
                                    <thead>
                                        <tr>
                                            <th>Regional</th>
                                            <th>Região</th>
                                            <th>Vínculos</th>
                                            <th>Situação</th>
                                            <th style={{ textAlign: 'right' }}>Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtrados.map((item) => (
                                            <tr key={item.id}>
                                                <td>
                                                    <div className="atable__cell-media">
                                                        <span className="aavatar">{item.uf}</span>
                                                        <span>
                                                            <span className="atable__title">
                                                                {item.name}
                                                            </span>
                                                            <span className="atable__sub">
                                                                {item.city ||
                                                                    'Cidade não informada'}{' '}
                                                                · /{item.slug}
                                                            </span>
                                                        </span>
                                                    </div>
                                                </td>
                                                <td>{REGIAO_LABEL[item.region]}</td>
                                                <td>
                                                    <span className="atable__sub">
                                                        {item.usuarios} usuário(s)
                                                    </span>
                                                    <span
                                                        className="atable__sub"
                                                        style={{ display: 'block' }}
                                                    >
                                                        {item.atendimentos} atendimento(s)
                                                    </span>
                                                </td>
                                                <td>
                                                    <span
                                                        className={
                                                            item.active
                                                                ? 'abadge abadge--ativo'
                                                                : 'abadge abadge--inativo'
                                                        }
                                                    >
                                                        {item.active ? 'ativa' : 'inativa'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="atable__actions">
                                                        <form action={ativarAction}>
                                                            <input
                                                                type="hidden"
                                                                name="id"
                                                                value={item.id}
                                                            />
                                                            <button
                                                                className="abtn abtn--ghost abtn--sm"
                                                                disabled={alterandoAtiva}
                                                                title={
                                                                    item.active
                                                                        ? 'Desativar'
                                                                        : 'Reativar'
                                                                }
                                                            >
                                                                <i
                                                                    className={`fas ${item.active ? 'fa-eye-slash' : 'fa-circle-check'}`}
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
                                                                        `Excluir definitivamente a regional “${item.name}”?`,
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
                                                                title={
                                                                    item.usuarios ||
                                                                    item.atendimentos
                                                                        ? 'Há vínculos: desative em vez de excluir'
                                                                        : 'Excluir'
                                                                }
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
                                <i className="fas fa-map-location-dot"></i>
                                <strong>Nenhuma regional encontrada</strong>
                                <span>Ajuste os filtros ou cadastre uma nova equipe.</span>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>{emEdicao ? 'Editar regional' : 'Nova regional'}</h2>
                                <p>
                                    {emEdicao
                                        ? `Alterando “${emEdicao.name}”.`
                                        : 'Identificador, endereço e frentes de trabalho da equipe.'}
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
                                <label htmlFor="name">Nome da equipe</label>
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    defaultValue={emEdicao?.name ?? ''}
                                    placeholder="Amazonas — Manaus"
                                />
                                {erro(salvarState, 'name')}
                            </div>

                            <div className="afield">
                                <label htmlFor="slug">Identificador</label>
                                <input
                                    id="slug"
                                    name="slug"
                                    type="text"
                                    defaultValue={emEdicao?.slug ?? ''}
                                    placeholder="am-manaus"
                                />
                                <span className="afield__hint">
                                    Em branco, é gerado a partir do nome. Só letras minúsculas,
                                    números e hífen.
                                </span>
                                {erro(salvarState, 'slug')}
                            </div>

                            <div className="afield">
                                <label htmlFor="uf">UF</label>
                                <select id="uf" name="uf" defaultValue={emEdicao?.uf ?? 'SP'}>
                                    {UFS.map((uf) => (
                                        <option key={uf} value={uf}>
                                            {uf}
                                        </option>
                                    ))}
                                </select>
                                {erro(salvarState, 'uf')}
                            </div>

                            <div className="afield">
                                <label htmlFor="city">Cidade</label>
                                <input
                                    id="city"
                                    name="city"
                                    type="text"
                                    defaultValue={emEdicao?.city ?? ''}
                                    placeholder="Manaus"
                                />
                                {erro(salvarState, 'city')}
                            </div>

                            <div className="afield">
                                <label htmlFor="region">Região</label>
                                <select
                                    id="region"
                                    name="region"
                                    defaultValue={emEdicao?.region ?? 'SUDESTE'}
                                >
                                    {REGIOES.map((regiao) => (
                                        <option key={regiao} value={regiao}>
                                            {REGIAO_LABEL[regiao]}
                                        </option>
                                    ))}
                                </select>
                                {erro(salvarState, 'region')}
                            </div>

                            <div className="afield">
                                <label htmlFor="description">Descrição</label>
                                <textarea
                                    id="description"
                                    name="description"
                                    defaultValue={emEdicao?.description ?? ''}
                                    placeholder="Onde a equipe fica, o que caracteriza o território e como acolhe."
                                />
                                {erro(salvarState, 'description')}
                            </div>

                            <div className="afield">
                                <label htmlFor="focus">Frentes de trabalho</label>
                                <input
                                    id="focus"
                                    name="focus"
                                    type="text"
                                    defaultValue={emEdicao?.focus.join(', ') ?? ''}
                                    placeholder="Rotas fluviais, Acolhida urbana, Formação"
                                />
                                <span className="afield__hint">
                                    Separe por vírgula — até 12 frentes.
                                </span>
                            </div>

                            <div className="afield">
                                <label htmlFor="address">Endereço</label>
                                <input
                                    id="address"
                                    name="address"
                                    type="text"
                                    defaultValue={emEdicao?.address ?? ''}
                                    placeholder="Rua Caiambé, 126 — Vila Monumento, CEP 04264-060"
                                />
                                {erro(salvarState, 'address')}
                            </div>

                            <div className="afield">
                                <label htmlFor="phone">Telefone</label>
                                <input
                                    id="phone"
                                    name="phone"
                                    type="text"
                                    defaultValue={emEdicao?.phone ?? ''}
                                    placeholder="(11) 2063-7064"
                                />
                                {erro(salvarState, 'phone')}
                            </div>

                            <div className="afield">
                                <label htmlFor="email">E-mail</label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    defaultValue={emEdicao?.email ?? ''}
                                    placeholder="equipe@spmnacional.org.br"
                                />
                                {erro(salvarState, 'email')}
                            </div>

                            <div className="afield">
                                <label htmlFor="order">Ordem na região</label>
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
                                    name="active"
                                    defaultChecked={emEdicao ? emEdicao.active : true}
                                />
                                <span className="aswitch__track"></span>
                                <span className="aswitch__label">Regional ativa</span>
                            </label>

                            <button className="abtn abtn--action abtn--block" disabled={salvando}>
                                <i className="fas fa-floppy-disk"></i>
                                {salvando
                                    ? 'Salvando…'
                                    : emEdicao
                                      ? 'Salvar alterações'
                                      : 'Criar regional'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}
