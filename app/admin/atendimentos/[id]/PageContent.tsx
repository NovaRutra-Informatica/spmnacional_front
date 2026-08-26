'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { AtendimentoStatus } from '@/lib/generated/prisma/enums';
import type { FaixaEtaria, Genero, Necessidade } from '@/lib/generated/prisma/enums';
import {
    ATENDIMENTO_STATUS_CLASS,
    ATENDIMENTO_STATUS_LABEL,
    FAIXA_ETARIA_LABEL,
    GENERO_LABEL,
    NECESSIDADE_LABEL,
} from '@/lib/labels';
import { anonimizarAtendimento, atualizarAtendimento, registrarEncaminhamento } from '../actions';

export interface EncaminhamentoItem {
    id: string;
    orgao: string;
    descricao: string;
    quandoLabel: string;
    registradoPor: string | null;
}

export interface AtendimentoDetalhe {
    id: string;
    codigo: string;
    regionalNome: string;
    /** Há cifra guardada — diferente de "decifrou e veio vazio". */
    nomeGuardado: boolean;
    nome: string | null;
    nomeMascarado: string;
    contatoGuardado: boolean;
    contato: string | null;
    contatoMascarado: string;
    faixaEtaria: FaixaEtaria;
    genero: Genero;
    paisOrigem: string | null;
    idiomas: string[];
    chegadaAno: number | null;
    necessidades: Necessidade[];
    observacoes: string | null;
    status: AtendimentoStatus;
    abertoPorNome: string | null;
    abertoEmLabel: string;
    encerradoEmLabel: string | null;
    retencaoInput: string;
    retencaoLabel: string;
    retencaoVencida: boolean;
    retencaoMaximaAnos: number;
    semDadosPessoais: boolean;
    encaminhamentos: EncaminhamentoItem[];
}

/** `ActionState` mora em `lib/server`, que é server-only: o tipo é redeclarado aqui. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const STATUS_OPCOES = Object.values(AtendimentoStatus);
const ESTADO_INICIAL: FormState = { ok: false };
const erroEstilo = { color: '#c2185b' };

function Aviso({ state }: { state: FormState }) {
    if (!state.message) return null;
    return (
        <div
            className={state.ok ? 'anote anote--success' : 'anote anote--warning'}
            style={{ marginBottom: '1.25rem' }}
        >
            <i className={`fas ${state.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
            <div>{state.message}</div>
        </div>
    );
}

export default function PageContent({ detalhe }: { detalhe: AtendimentoDetalhe }) {
    // O dado já chegou decifrado; esconder por padrão só evita que a ficha fique
    // aberta e legível na tela de um balcão movimentado.
    const [revelado, setRevelado] = useState(false);

    const [gestaoState, gestaoAction, gestaoPendente] = useActionState<FormState, FormData>(
        atualizarAtendimento,
        ESTADO_INICIAL,
    );
    const [encaminhamentoState, encaminhamentoAction, encaminhamentoPendente] = useActionState<
        FormState,
        FormData
    >(registrarEncaminhamento, ESTADO_INICIAL);
    const [anonimizarState, anonimizarAction, anonimizarPendente] = useActionState<
        FormState,
        FormData
    >(anonimizarAtendimento, ESTADO_INICIAL);

    const identificacao = (guardado: boolean, valor: string | null, mascarado: string): string => {
        if (!guardado) return 'Não informado';
        if (valor === null) return 'Indisponível (chave de cifragem não confere)';
        return revelado ? valor : mascarado;
    };

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> /{' '}
                        <Link href="/admin/atendimentos">Atendimentos</Link> / {detalhe.codigo}
                    </div>
                    <h1>{detalhe.codigo}</h1>
                    <p>
                        {detalhe.regionalNome} · aberto em {detalhe.abertoEmLabel}
                        {detalhe.abertoPorNome ? ` por ${detalhe.abertoPorNome}` : ''}.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <span
                        className={ATENDIMENTO_STATUS_CLASS[detalhe.status]}
                        style={{ alignSelf: 'center' }}
                    >
                        {ATENDIMENTO_STATUS_LABEL[detalhe.status]}
                    </span>
                    <Link className="abtn abtn--ghost" href="/admin/atendimentos">
                        <i className="fas fa-arrow-left"></i> Voltar
                    </Link>
                </div>
            </div>

            <div className="anote anote--warning">
                <i className="fas fa-user-shield"></i>
                <div>
                    <strong>Esta abertura ficou registrada.</strong> Toda leitura de ficha entra no
                    log de auditoria com o seu nome, o horário e o código do atendimento. Consulte
                    só o que precisar para o encaminhamento e não copie estes dados para fora do
                    painel.
                </div>
            </div>

            {detalhe.retencaoVencida && (
                <div className="anote anote--warning">
                    <i className="fas fa-clock-rotate-left"></i>
                    <div>
                        <strong>Prazo de retenção vencido em {detalhe.retencaoLabel}.</strong> Se o
                        caso está encerrado, anonimize a ficha: os dados estatísticos continuam,
                        nome, contato e observações são apagados.
                    </div>
                </div>
            )}

            <div className="agrid agrid--sidebar">
                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>Identificação</h2>
                                <p>Guardados cifrados; decifrados só nesta tela.</p>
                            </div>
                            <button
                                className="abtn abtn--ghost abtn--sm"
                                type="button"
                                onClick={() => setRevelado((atual) => !atual)}
                            >
                                <i className={`fas ${revelado ? 'fa-eye-slash' : 'fa-eye'}`}></i>{' '}
                                {revelado ? 'Ocultar' : 'Revelar'}
                            </button>
                        </div>

                        <ul className="activity-list">
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-user"></i>
                                </span>
                                <div>
                                    <strong>
                                        {identificacao(
                                            detalhe.nomeGuardado,
                                            detalhe.nome,
                                            detalhe.nomeMascarado,
                                        )}
                                    </strong>
                                    <span>Nome</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-phone"></i>
                                </span>
                                <div>
                                    <strong>
                                        {identificacao(
                                            detalhe.contatoGuardado,
                                            detalhe.contato,
                                            detalhe.contatoMascarado,
                                        )}
                                    </strong>
                                    <span>Contato</span>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>Perfil e necessidades</h2>
                                <p>
                                    Os campos que permanecem na base mesmo depois da anonimização.
                                </p>
                            </div>
                        </div>

                        <ul className="activity-list">
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-user-clock"></i>
                                </span>
                                <div>
                                    <strong>{FAIXA_ETARIA_LABEL[detalhe.faixaEtaria]}</strong>
                                    <span>Faixa etária</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-venus-mars"></i>
                                </span>
                                <div>
                                    <strong>{GENERO_LABEL[detalhe.genero]}</strong>
                                    <span>Gênero</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-earth-americas"></i>
                                </span>
                                <div>
                                    <strong>{detalhe.paisOrigem ?? 'Não informado'}</strong>
                                    <span>País de origem</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-language"></i>
                                </span>
                                <div>
                                    <strong>
                                        {detalhe.idiomas.length
                                            ? detalhe.idiomas.join(', ')
                                            : 'Não informado'}
                                    </strong>
                                    <span>Idiomas</span>
                                </div>
                            </li>
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-plane-arrival"></i>
                                </span>
                                <div>
                                    <strong>{detalhe.chegadaAno ?? 'Não informado'}</strong>
                                    <span>Ano de chegada ao Brasil</span>
                                </div>
                            </li>
                        </ul>

                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '0.4rem',
                                marginTop: '1.25rem',
                            }}
                        >
                            {detalhe.necessidades.length ? (
                                detalhe.necessidades.map((item) => (
                                    <span className="abadge abadge--info" key={item}>
                                        {NECESSIDADE_LABEL[item]}
                                    </span>
                                ))
                            ) : (
                                <span className="atable__sub">Nenhuma necessidade registrada.</span>
                            )}
                        </div>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>Observações</h2>
                                <p>Anotações da equipe sobre o acompanhamento.</p>
                            </div>
                        </div>

                        {detalhe.observacoes ? (
                            <p
                                style={{
                                    margin: 0,
                                    fontSize: '0.9rem',
                                    lineHeight: 1.7,
                                    color: '#46586a',
                                    whiteSpace: 'pre-line',
                                }}
                            >
                                {detalhe.observacoes}
                            </p>
                        ) : (
                            <div className="aempty">
                                <i className="fas fa-note-sticky"></i>
                                <strong>Sem observações</strong>
                                <span>Nada foi anotado — ou o campo já foi apagado.</span>
                            </div>
                        )}
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>Encaminhamentos</h2>
                                <p>Para onde a pessoa foi levada e o que foi combinado.</p>
                            </div>
                            <span className="abadge abadge--info">
                                {detalhe.encaminhamentos.length} registro
                                {detalhe.encaminhamentos.length === 1 ? '' : 's'}
                            </span>
                        </div>

                        {detalhe.encaminhamentos.length ? (
                            <ul className="activity-list">
                                {detalhe.encaminhamentos.map((item) => (
                                    <li key={item.id}>
                                        <span className="activity-list__icon">
                                            <i className="fas fa-share-nodes"></i>
                                        </span>
                                        <div>
                                            <strong>{item.orgao}</strong>
                                            <span style={{ display: 'block', color: '#46586a' }}>
                                                {item.descricao}
                                            </span>
                                            <span>
                                                {item.quandoLabel}
                                                {item.registradoPor
                                                    ? ` · ${item.registradoPor}`
                                                    : ''}
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="aempty">
                                <i className="fas fa-share-nodes"></i>
                                <strong>Nenhum encaminhamento ainda</strong>
                                <span>Registre abaixo o primeiro serviço acionado.</span>
                            </div>
                        )}

                        {/* A chave muda a cada novo registro, o que remonta o
                            formulário e limpa os campos preenchidos. */}
                        <form
                            action={encaminhamentoAction}
                            key={detalhe.encaminhamentos.length}
                            style={{ marginTop: '1.5rem' }}
                        >
                            <input type="hidden" name="atendimentoId" value={detalhe.id} />

                            <Aviso state={encaminhamentoState} />

                            <div className="afield">
                                <label htmlFor="orgao">Órgão ou serviço</label>
                                <input
                                    id="orgao"
                                    name="orgao"
                                    type="text"
                                    placeholder="Defensoria Pública da União"
                                />
                                {encaminhamentoState.fieldErrors?.orgao && (
                                    <span className="afield__hint" style={erroEstilo}>
                                        {encaminhamentoState.fieldErrors.orgao}
                                    </span>
                                )}
                            </div>

                            <div className="afield">
                                <label htmlFor="descricao">O que foi encaminhado</label>
                                <textarea
                                    id="descricao"
                                    name="descricao"
                                    style={{ minHeight: '110px' }}
                                    placeholder="Agendamento para orientação sobre reunião familiar, com acompanhamento da equipe."
                                ></textarea>
                                {encaminhamentoState.fieldErrors?.descricao && (
                                    <span className="afield__hint" style={erroEstilo}>
                                        {encaminhamentoState.fieldErrors.descricao}
                                    </span>
                                )}
                            </div>

                            <button
                                className="abtn abtn--primary"
                                type="submit"
                                disabled={encaminhamentoPendente}
                            >
                                <i className="fas fa-plus"></i>{' '}
                                {encaminhamentoPendente
                                    ? 'Registrando…'
                                    : 'Registrar encaminhamento'}
                            </button>
                        </form>
                    </div>
                </div>

                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Gestão do caso</h3>
                            </div>
                        </div>

                        <form action={gestaoAction}>
                            <input type="hidden" name="id" value={detalhe.id} />

                            <Aviso state={gestaoState} />

                            <div className="afield">
                                <label htmlFor="status">Status</label>
                                <select
                                    id="status"
                                    name="status"
                                    key={detalhe.status}
                                    defaultValue={detalhe.status}
                                >
                                    {STATUS_OPCOES.map((valor) => (
                                        <option value={valor} key={valor}>
                                            {ATENDIMENTO_STATUS_LABEL[valor]}
                                        </option>
                                    ))}
                                </select>
                                {gestaoState.fieldErrors?.status && (
                                    <span className="afield__hint" style={erroEstilo}>
                                        {gestaoState.fieldErrors.status}
                                    </span>
                                )}
                            </div>

                            <div className="afield">
                                <label htmlFor="retencaoAte">Manter esta ficha até</label>
                                <input
                                    id="retencaoAte"
                                    name="retencaoAte"
                                    type="date"
                                    key={detalhe.retencaoInput}
                                    defaultValue={detalhe.retencaoInput}
                                />
                                <span className="afield__hint">
                                    Máximo de {detalhe.retencaoMaximaAnos} anos. Encurtar o prazo é
                                    a forma de colocar a ficha na fila de anonimização.
                                </span>
                                {gestaoState.fieldErrors?.retencaoAte && (
                                    <span className="afield__hint" style={erroEstilo}>
                                        {gestaoState.fieldErrors.retencaoAte}
                                    </span>
                                )}
                            </div>

                            <button
                                className="abtn abtn--action abtn--block"
                                type="submit"
                                disabled={gestaoPendente}
                            >
                                <i className="fas fa-floppy-disk"></i>{' '}
                                {gestaoPendente ? 'Salvando…' : 'Salvar alterações'}
                            </button>
                        </form>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Linha do tempo</h3>
                            </div>
                        </div>

                        <ul className="activity-list">
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-folder-open"></i>
                                </span>
                                <div>
                                    <strong>{detalhe.abertoEmLabel}</strong>
                                    <span>
                                        Abertura
                                        {detalhe.abertoPorNome ? ` · ${detalhe.abertoPorNome}` : ''}
                                    </span>
                                </div>
                            </li>
                            {detalhe.encerradoEmLabel && (
                                <li>
                                    <span className="activity-list__icon">
                                        <i className="fas fa-circle-check"></i>
                                    </span>
                                    <div>
                                        <strong>{detalhe.encerradoEmLabel}</strong>
                                        <span>Encerramento</span>
                                    </div>
                                </li>
                            )}
                            <li>
                                <span className="activity-list__icon">
                                    <i className="fas fa-clock-rotate-left"></i>
                                </span>
                                <div>
                                    <strong>{detalhe.retencaoLabel}</strong>
                                    <span>
                                        {detalhe.retencaoVencida
                                            ? 'Retenção vencida'
                                            : 'Limite de retenção'}
                                    </span>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Anonimizar</h3>
                                <p>LGPD, art. 16, IV.</p>
                            </div>
                        </div>

                        {detalhe.semDadosPessoais ? (
                            <div className="anote anote--success" style={{ marginBottom: 0 }}>
                                <i className="fas fa-shield-halved"></i>
                                <div>
                                    Esta ficha não guarda nome, contato nem observações. Só restam
                                    os campos estatísticos.
                                </div>
                            </div>
                        ) : (
                            <form action={anonimizarAction}>
                                <input type="hidden" name="id" value={detalhe.id} />

                                <Aviso state={anonimizarState} />

                                <p
                                    style={{
                                        margin: '0 0 1rem',
                                        fontSize: '0.85rem',
                                        lineHeight: 1.7,
                                        color: '#46586a',
                                    }}
                                >
                                    Apaga <strong>nome</strong>, <strong>contato</strong> e{' '}
                                    <strong>observações</strong> e mantém faixa etária, gênero,
                                    país, idiomas, necessidades e encaminhamentos. O código{' '}
                                    {detalhe.codigo} continua válido para os relatórios. Não tem
                                    volta.
                                </p>

                                <label className="aswitch" style={{ marginBottom: '1rem' }}>
                                    <input type="checkbox" name="confirmar" value="on" />
                                    <span className="aswitch__track"></span>
                                    <span className="aswitch__label">
                                        Entendi que a operação é irreversível
                                    </span>
                                </label>

                                {anonimizarState.fieldErrors?.confirmar && (
                                    <div
                                        className="afield__hint"
                                        style={{ ...erroEstilo, marginBottom: '1rem' }}
                                    >
                                        {anonimizarState.fieldErrors.confirmar}
                                    </div>
                                )}

                                <button
                                    className="abtn abtn--danger abtn--block"
                                    type="submit"
                                    disabled={anonimizarPendente}
                                >
                                    <i className="fas fa-user-slash"></i>{' '}
                                    {anonimizarPendente ? 'Apagando…' : 'Anonimizar ficha'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
