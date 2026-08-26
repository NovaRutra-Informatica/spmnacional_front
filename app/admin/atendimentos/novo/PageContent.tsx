'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { FaixaEtaria, Genero, Necessidade } from '@/lib/generated/prisma/enums';
import { FAIXA_ETARIA_LABEL, GENERO_LABEL, NECESSIDADE_LABEL } from '@/lib/labels';
import { criarAtendimento } from '../actions';

export interface RegionalOption {
    id: string;
    nome: string;
}

interface Props {
    regionais: RegionalOption[];
    regionalPadrao: string;
    retencaoPadraoInput: string;
    retencaoPadraoAnos: number;
    usuario: { nome: string; iniciais: string; perfil: string };
}

/** `ActionState` mora em `lib/server`, que é server-only: o tipo é redeclarado aqui. */
interface FormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const FAIXAS = Object.values(FaixaEtaria);
const GENEROS = Object.values(Genero);
const NECESSIDADES = Object.values(Necessidade);

const erroEstilo = { color: '#c2185b' };

export default function PageContent({
    regionais,
    regionalPadrao,
    retencaoPadraoInput,
    retencaoPadraoAnos,
    usuario,
}: Props) {
    const router = useRouter();
    const [state, formAction, pending] = useActionState<FormState, FormData>(criarAtendimento, {
        ok: false,
    });

    const criadoId = typeof state.data?.id === 'string' ? state.data.id : null;
    const erros = state.fieldErrors;

    // Depois de criar, a pessoa precisa da ficha aberta para seguir o
    // atendimento — mas primeiro lê o código gerado na mensagem de sucesso.
    useEffect(() => {
        if (!criadoId) return;
        const temporizador = setTimeout(() => {
            router.push(`/admin/atendimentos/${criadoId}`);
        }, 1200);
        return () => clearTimeout(temporizador);
    }, [criadoId, router]);

    const semRegional = regionais.length === 0;
    const bloqueado = pending || Boolean(criadoId) || semRegional;

    return (
        <form action={formAction}>
            <div className="admin-page-head">
                <div>
                    <div className="admin-crumb">
                        <Link href="/admin">Painel</Link> /{' '}
                        <Link href="/admin/atendimentos">Atendimentos</Link> / Novo
                    </div>
                    <h1>Novo atendimento</h1>
                    <p>
                        A ficha recebe um código próprio ao ser salva. Nome e contato ficam cifrados
                        e só aparecem para quem abrir a ficha.
                    </p>
                </div>
                <div className="admin-page-head__actions">
                    <Link className="abtn abtn--ghost" href="/admin/atendimentos">
                        <i className="fas fa-arrow-left"></i> Cancelar
                    </Link>
                    <button className="abtn abtn--action" type="submit" disabled={bloqueado}>
                        <i className="fas fa-floppy-disk"></i>{' '}
                        {pending ? 'Salvando…' : 'Registrar atendimento'}
                    </button>
                </div>
            </div>

            <div className="anote anote--warning">
                <i className="fas fa-triangle-exclamation"></i>
                <div>
                    <strong>Registre só o indispensável ao encaminhamento.</strong> Nada de situação
                    documental, dado de saúde ou detalhe que não mude o que a rede vai fazer pela
                    pessoa. Diga a ela o que está sendo anotado, para que serve e por quanto tempo
                    fica guardado — e siga em frente mesmo que ela prefira não informar o nome.
                </div>
            </div>

            {state.message && (
                <div className={state.ok ? 'anote anote--success' : 'anote anote--warning'}>
                    <i
                        className={`fas ${
                            state.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'
                        }`}
                    ></i>
                    <div>
                        {state.message}
                        {criadoId && ' Abrindo a ficha…'}
                    </div>
                </div>
            )}

            {semRegional && (
                <div className="anote anote--warning">
                    <i className="fas fa-circle-exclamation"></i>
                    <div>
                        Sua conta não está vinculada a nenhuma regional, então não há onde registrar
                        o atendimento. Peça à coordenação para fazer o vínculo.
                    </div>
                </div>
            )}

            <div className="agrid agrid--sidebar">
                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>Identificação</h2>
                                <p>
                                    Os dois campos abaixo são opcionais e vão cifrados para o banco.
                                </p>
                            </div>
                        </div>

                        <div className="afield">
                            <label htmlFor="regionalId">Regional responsável</label>
                            <select
                                id="regionalId"
                                name="regionalId"
                                defaultValue={regionalPadrao}
                                disabled={semRegional}
                            >
                                {regionais.map((regional) => (
                                    <option value={regional.id} key={regional.id}>
                                        {regional.nome}
                                    </option>
                                ))}
                            </select>
                            {erros?.regionalId && (
                                <span className="afield__hint" style={erroEstilo}>
                                    {erros.regionalId}
                                </span>
                            )}
                        </div>

                        <div className="afield-row">
                            <div className="afield">
                                <label htmlFor="nome">Nome (opcional)</label>
                                <input
                                    id="nome"
                                    name="nome"
                                    type="text"
                                    autoComplete="off"
                                    placeholder="Como a pessoa quer ser chamada"
                                />
                                <span className="afield__hint">
                                    Se a pessoa preferir não informar, deixe em branco: o código da
                                    ficha basta para o acompanhamento.
                                </span>
                                {erros?.nome && (
                                    <span className="afield__hint" style={erroEstilo}>
                                        {erros.nome}
                                    </span>
                                )}
                            </div>

                            <div className="afield">
                                <label htmlFor="contato">Contato (opcional)</label>
                                <input
                                    id="contato"
                                    name="contato"
                                    type="text"
                                    autoComplete="off"
                                    placeholder="Telefone, WhatsApp ou e-mail"
                                />
                                <span className="afield__hint">
                                    Registre um só meio de contato — o que a pessoa realmente usa.
                                </span>
                                {erros?.contato && (
                                    <span className="afield__hint" style={erroEstilo}>
                                        {erros.contato}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>Perfil</h2>
                                <p>
                                    Campos estatísticos: são eles que sobram quando a ficha é
                                    anonimizada e que alimentam os relatórios da rede.
                                </p>
                            </div>
                        </div>

                        <div className="afield-row">
                            <div className="afield">
                                <label htmlFor="faixaEtaria">Faixa etária</label>
                                <select
                                    id="faixaEtaria"
                                    name="faixaEtaria"
                                    defaultValue={FaixaEtaria.NAO_INFORMADO}
                                >
                                    {FAIXAS.map((valor) => (
                                        <option value={valor} key={valor}>
                                            {FAIXA_ETARIA_LABEL[valor]}
                                        </option>
                                    ))}
                                </select>
                                {erros?.faixaEtaria && (
                                    <span className="afield__hint" style={erroEstilo}>
                                        {erros.faixaEtaria}
                                    </span>
                                )}
                            </div>

                            <div className="afield">
                                <label htmlFor="genero">Gênero</label>
                                <select
                                    id="genero"
                                    name="genero"
                                    defaultValue={Genero.NAO_INFORMADO}
                                >
                                    {GENEROS.map((valor) => (
                                        <option value={valor} key={valor}>
                                            {GENERO_LABEL[valor]}
                                        </option>
                                    ))}
                                </select>
                                {erros?.genero && (
                                    <span className="afield__hint" style={erroEstilo}>
                                        {erros.genero}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="afield-row">
                            <div className="afield">
                                <label htmlFor="paisOrigem">País de origem</label>
                                <input
                                    id="paisOrigem"
                                    name="paisOrigem"
                                    type="text"
                                    placeholder="Venezuela"
                                />
                                {erros?.paisOrigem && (
                                    <span className="afield__hint" style={erroEstilo}>
                                        {erros.paisOrigem}
                                    </span>
                                )}
                            </div>

                            <div className="afield">
                                <label htmlFor="chegadaAno">Ano de chegada ao Brasil</label>
                                <input
                                    id="chegadaAno"
                                    name="chegadaAno"
                                    type="number"
                                    min={1900}
                                    step={1}
                                    placeholder="2024"
                                />
                                {erros?.chegadaAno && (
                                    <span className="afield__hint" style={erroEstilo}>
                                        {erros.chegadaAno}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="afield" style={{ marginBottom: 0 }}>
                            <label htmlFor="idiomas">Idiomas</label>
                            <input
                                id="idiomas"
                                name="idiomas"
                                type="text"
                                placeholder="Espanhol, crioulo haitiano"
                            />
                            <span className="afield__hint">
                                Separe por vírgula. Ajuda a equipe a saber quem pode acompanhar a
                                conversa.
                            </span>
                            {erros?.idiomas && (
                                <span className="afield__hint" style={erroEstilo}>
                                    {erros.idiomas}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>Necessidades identificadas</h2>
                                <p>Marque o que a pessoa procurou — orienta o encaminhamento.</p>
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gap: '0.85rem',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                            }}
                        >
                            {NECESSIDADES.map((valor) => (
                                <label className="aswitch" key={valor}>
                                    <input type="checkbox" name="necessidades" value={valor} />
                                    <span className="aswitch__track"></span>
                                    <span className="aswitch__label">
                                        {NECESSIDADE_LABEL[valor]}
                                    </span>
                                </label>
                            ))}
                        </div>

                        {erros?.necessidades && (
                            <div
                                className="afield__hint"
                                style={{ ...erroEstilo, marginTop: '1rem' }}
                            >
                                {erros.necessidades}
                            </div>
                        )}
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h2>Observações</h2>
                                <p>O que a equipe precisa saber para continuar o atendimento.</p>
                            </div>
                        </div>

                        <div className="afield" style={{ marginBottom: 0 }}>
                            <label htmlFor="observacoes">Anotações da equipe</label>
                            <textarea
                                id="observacoes"
                                name="observacoes"
                                placeholder="Ex.: procurou a casa buscando vaga em curso de português; combinamos retorno na próxima terça."
                            ></textarea>
                            <span className="afield__hint">
                                Não registre situação documental, dado de saúde, religião ou
                                qualquer informação que não mude o encaminhamento. Este é o campo
                                apagado primeiro na anonimização.
                            </span>
                            {erros?.observacoes && (
                                <span className="afield__hint" style={erroEstilo}>
                                    {erros.observacoes}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div>
                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Retenção</h3>
                            </div>
                        </div>

                        <div className="afield" style={{ marginBottom: 0 }}>
                            <label htmlFor="retencaoAte">Manter esta ficha até</label>
                            <input
                                id="retencaoAte"
                                name="retencaoAte"
                                type="date"
                                defaultValue={retencaoPadraoInput}
                            />
                            <span className="afield__hint">
                                Padrão de {retencaoPadraoAnos} anos a partir de hoje. Encurte sempre
                                que o caso permitir — vencido o prazo, a ficha entra na fila de
                                anonimização.
                            </span>
                            {erros?.retencaoAte && (
                                <span className="afield__hint" style={erroEstilo}>
                                    {erros.retencaoAte}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="acard">
                        <div className="acard__head">
                            <div>
                                <h3>Responsável</h3>
                            </div>
                        </div>
                        <div className="atable__cell-media">
                            <span className="aavatar">{usuario.iniciais}</span>
                            <span>
                                <span className="atable__title">{usuario.nome}</span>
                                <span className="atable__sub">{usuario.perfil}</span>
                            </span>
                        </div>
                    </div>

                    <div className="anote">
                        <i className="fas fa-fingerprint"></i>
                        <div>
                            <strong>Como a ficha nasce.</strong> Ela recebe um código no formato{' '}
                            <strong>ATD-ano-sequencial</strong>, no status <strong>aberto</strong>,
                            e é esse código que deve ser usado em planilhas, conversas e relatórios.
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
}
