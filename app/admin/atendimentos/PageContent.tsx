'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { AtendimentoStatus, Necessidade } from '@/lib/generated/prisma/enums';
import type { FaixaEtaria } from '@/lib/generated/prisma/enums';
import {
    ATENDIMENTO_STATUS_CLASS,
    ATENDIMENTO_STATUS_LABEL,
    FAIXA_ETARIA_LABEL,
    NECESSIDADE_LABEL,
} from '@/lib/labels';
import { anonimizarAtendimento } from './actions';

/**
 * Linha da listagem.
 *
 * Repare no que não está aqui: nome, contato e observações. A lista trabalha
 * só com o código pseudônimo — o dado identificável nem sai do banco nesta
 * consulta, e só aparece na ficha, cuja abertura é auditada.
 */
export interface AtendimentoRow {
    id: string;
    codigo: string;
    regionalId: string;
    regionalNome: string;
    faixaEtaria: FaixaEtaria;
    necessidades: Necessidade[];
    status: AtendimentoStatus;
    abertoEmLabel: string;
    retencaoLabel: string;
    retencaoVencida: boolean;
    /** Prazo vencido e ainda há nome, contato ou observação para apagar. */
    podeAnonimizar: boolean;
}

export interface RegionalOption {
    id: string;
    nome: string;
}

interface Props {
    rows: AtendimentoRow[];
    regionais: RegionalOption[];
    podeFiltrarRegional: boolean;
    stats: {
        abertos: number;
        acompanhamento: number;
        encaminhados: number;
        vencidos: number;
    };
    total: number;
    truncado: boolean;
    escopoLabel: string;
    aviso: string | null;
}

/** `ActionState` mora em `lib/server`, que é server-only: o tipo é redeclarado aqui. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const STATUS_OPCOES = Object.values(AtendimentoStatus);
const NECESSIDADE_OPCOES = Object.values(Necessidade);

/** Quantas necessidades cabem na célula antes de virar "+N". */
const NECESSIDADES_VISIVEIS = 3;

export default function PageContent({
    rows,
    regionais,
    podeFiltrarRegional,
    stats,
    total,
    truncado,
    escopoLabel,
    aviso,
}: Props) {
    const [busca, setBusca] = useState('');
    const [status, setStatus] = useState<'todos' | AtendimentoStatus>('todos');
    const [regional, setRegional] = useState('todas');
    const [necessidade, setNecessidade] = useState<'todas' | Necessidade>('todas');

    // Anonimizar direto da lista poupa abrir a ficha — e abrir a ficha significa
    // decifrar o dado pessoal e gerar mais um acesso no log de auditoria.
    const [anonState, anonAction, anonPendente] = useActionState<FormState, FormData>(
        anonimizarAtendimento,
        { ok: false },
    );

    const confirmarAnonimizacao = (event: FormEvent<HTMLFormElement>, codigo: string) => {
        const segue = confirm(
            `Anonimizar ${codigo}?\n\nNome, contato e observações serão apagados para sempre. Faixa etária, gênero, país, necessidades e encaminhamentos continuam.`,
        );
        if (!segue) {
            event.preventDefault();
        }
    };

    const filtradas = useMemo<AtendimentoRow[]>(() => {
        const termo = busca.trim().toLowerCase();

        return rows.filter((row) => {
            const casaTermo = !termo || row.codigo.toLowerCase().includes(termo);
            const casaStatus = status === 'todos' || row.status === status;
            const casaRegional = regional === 'todas' || row.regionalId === regional;
            const casaNecessidade =
                necessidade === 'todas' || row.necessidades.includes(necessidade);
            return casaTermo && casaStatus && casaRegional && casaNecessidade;
        });
    }, [rows, busca, status, regional, necessidade]);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> / Atendimento
                    </div>
                    <h1>Atendimentos</h1>
                    <p>
                        Fichas de acompanhamento das pessoas atendidas pela rede. Cada uma circula
                        pelo código, não pelo nome — {escopoLabel}.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--action" href="/admin/atendimentos/novo">
                        <i className="fas fa-plus"></i> Novo atendimento
                    </Link>
                </div>
            </div>

            {aviso && (
                <div className="anote anote--warning">
                    <i className="fas fa-triangle-exclamation"></i>
                    <div>{aviso}</div>
                </div>
            )}

            <div className="anote">
                <i className="fas fa-user-shield"></i>
                <div>
                    <strong>Dados pessoais.</strong> Nome e contato ficam cifrados e só aparecem na
                    ficha individual — e cada abertura de ficha é registrada na auditoria. Use o
                    código do atendimento para falar do caso com a equipe.
                </div>
            </div>

            <div className="agrid agrid--4" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-tile">
                    <span className="stat-tile__icon">
                        <i className="fas fa-folder-open"></i>
                    </span>
                    <div>
                        <strong>{stats.abertos}</strong>
                        <span>Abertos</span>
                    </div>
                </div>
                <div className="stat-tile is-warning">
                    <span className="stat-tile__icon">
                        <i className="fas fa-hourglass-half"></i>
                    </span>
                    <div>
                        <strong>{stats.acompanhamento}</strong>
                        <span>Em acompanhamento</span>
                    </div>
                </div>
                <div className="stat-tile is-success">
                    <span className="stat-tile__icon">
                        <i className="fas fa-share-nodes"></i>
                    </span>
                    <div>
                        <strong>{stats.encaminhados}</strong>
                        <span>Encaminhados</span>
                    </div>
                </div>
                <div className="stat-tile is-action">
                    <span className="stat-tile__icon">
                        <i className="fas fa-clock-rotate-left"></i>
                    </span>
                    <div>
                        <strong>{stats.vencidos}</strong>
                        <span>Retenção vencida</span>
                    </div>
                </div>
            </div>

            <div className="acard">
                <div className="atoolbar">
                    <input
                        className="atoolbar__search"
                        type="search"
                        placeholder="Buscar pelo código do atendimento…"
                        value={busca}
                        onChange={(event) => setBusca(event.target.value)}
                    />

                    <select
                        value={status}
                        onChange={(event) =>
                            setStatus(event.target.value as 'todos' | AtendimentoStatus)
                        }
                        aria-label="Filtrar por status"
                    >
                        <option value="todos">Todos os status</option>
                        {STATUS_OPCOES.map((valor) => (
                            <option value={valor} key={valor}>
                                {ATENDIMENTO_STATUS_LABEL[valor]}
                            </option>
                        ))}
                    </select>

                    {podeFiltrarRegional && (
                        <select
                            value={regional}
                            onChange={(event) => setRegional(event.target.value)}
                            aria-label="Filtrar por regional"
                        >
                            <option value="todas">Todas as regionais</option>
                            {regionais.map((item) => (
                                <option value={item.id} key={item.id}>
                                    {item.nome}
                                </option>
                            ))}
                        </select>
                    )}

                    <select
                        value={necessidade}
                        onChange={(event) =>
                            setNecessidade(event.target.value as 'todas' | Necessidade)
                        }
                        aria-label="Filtrar por necessidade"
                    >
                        <option value="todas">Todas as necessidades</option>
                        {NECESSIDADE_OPCOES.map((valor) => (
                            <option value={valor} key={valor}>
                                {NECESSIDADE_LABEL[valor]}
                            </option>
                        ))}
                    </select>

                    <span className="atoolbar__spacer"></span>
                    <span style={{ fontSize: '0.82rem', color: '#7b8a9a' }}>
                        {filtradas.length} de {total} fichas
                    </span>
                </div>

                {truncado && (
                    <div className="anote">
                        <i className="fas fa-circle-info"></i>
                        <div>
                            Exibindo as {rows.length} fichas mais recentes de {total}. Use os
                            filtros para chegar às demais.
                        </div>
                    </div>
                )}

                {anonState.message && (
                    <div className={anonState.ok ? 'anote anote--success' : 'anote anote--warning'}>
                        <i
                            className={`fas ${
                                anonState.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'
                            }`}
                        ></i>
                        <div>{anonState.message}</div>
                    </div>
                )}

                {filtradas.length ? (
                    <div className="atable-wrap">
                        <table className="atable">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Regional</th>
                                    <th>Faixa etária</th>
                                    <th>Necessidades</th>
                                    <th>Status</th>
                                    <th>Aberto em</th>
                                    <th>Retenção</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map((row) => (
                                    <tr key={row.id}>
                                        <td>
                                            <span className="atable__title">{row.codigo}</span>
                                            <span className="atable__sub">ficha protegida</span>
                                        </td>
                                        <td>{row.regionalNome}</td>
                                        <td>{FAIXA_ETARIA_LABEL[row.faixaEtaria]}</td>
                                        <td>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    gap: '0.35rem',
                                                }}
                                            >
                                                {row.necessidades
                                                    .slice(0, NECESSIDADES_VISIVEIS)
                                                    .map((item) => (
                                                        <span
                                                            className="abadge abadge--info"
                                                            key={item}
                                                        >
                                                            {NECESSIDADE_LABEL[item]}
                                                        </span>
                                                    ))}
                                                {row.necessidades.length >
                                                    NECESSIDADES_VISIVEIS && (
                                                    <span className="abadge abadge--info">
                                                        +
                                                        {row.necessidades.length -
                                                            NECESSIDADES_VISIVEIS}
                                                    </span>
                                                )}
                                                {row.necessidades.length === 0 && (
                                                    <span className="atable__sub">—</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={ATENDIMENTO_STATUS_CLASS[row.status]}>
                                                {ATENDIMENTO_STATUS_LABEL[row.status]}
                                            </span>
                                        </td>
                                        <td className="atable__sub">{row.abertoEmLabel}</td>
                                        <td>
                                            {row.retencaoVencida ? (
                                                <span className="abadge abadge--alerta">
                                                    <i className="fas fa-clock-rotate-left"></i>{' '}
                                                    {row.retencaoLabel}
                                                </span>
                                            ) : (
                                                <span className="atable__sub">
                                                    {row.retencaoLabel}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="atable__actions">
                                                <Link
                                                    className="abtn abtn--ghost abtn--sm"
                                                    href={`/admin/atendimentos/${row.id}`}
                                                    title="Abrir ficha (o acesso fica registrado)"
                                                >
                                                    <i className="fas fa-folder-open"></i> Abrir
                                                </Link>
                                                {row.podeAnonimizar && (
                                                    <form
                                                        action={anonAction}
                                                        onSubmit={(event) =>
                                                            confirmarAnonimizacao(event, row.codigo)
                                                        }
                                                    >
                                                        <input
                                                            type="hidden"
                                                            name="id"
                                                            value={row.id}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="confirmar"
                                                            value="on"
                                                        />
                                                        <button
                                                            className="abtn abtn--danger abtn--sm"
                                                            type="submit"
                                                            disabled={anonPendente}
                                                            title="Apagar nome, contato e observações"
                                                        >
                                                            <i className="fas fa-user-slash"></i>{' '}
                                                            Anonimizar
                                                        </button>
                                                    </form>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="aempty">
                        <i className="fas fa-hand-holding-heart"></i>
                        <strong>Nenhuma ficha encontrada</strong>
                        <span>
                            {total === 0
                                ? 'Nenhum atendimento foi registrado no seu escopo até agora.'
                                : 'Ajuste a busca ou os filtros de status, regional e necessidade.'}
                        </span>
                    </div>
                )}
            </div>
        </>
    );
}
