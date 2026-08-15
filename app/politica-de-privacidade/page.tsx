import type { Metadata } from 'next';
import Link from 'next/link';
import PageHero from '@/components/PageHero';

export const metadata: Metadata = { title: 'Política de Privacidade' };

export default function Page() {
    return (
        <>
            <PageHero
                eyebrow="Institucional"
                title="Política de Privacidade"
                subtitle="Como o Serviço Pastoral dos Migrantes trata os dados pessoais de quem acessa este site e de quem procura nossos serviços."
                crumbs={[{ label: 'Política de Privacidade' }]}
            />

            <section className="section">
                <div className="container">
                    <div className="prose">
                        <div className="callout callout--action">
                            <i className="fas fa-shield-halved"></i>
                            <p>
                                <strong>Nosso princípio central:</strong> dados de pessoas migrantes
                                nunca são compartilhados com órgãos de controle migratório,
                                empregadores ou terceiros sem consentimento explícito. Situação
                                documental jamais será usada contra quem procura ajuda.
                            </p>
                        </div>

                        <h3>1. Quem somos</h3>
                        <p>
                            O Serviço Pastoral dos Migrantes (SPM) é um organismo da Pastoral Social
                            da CNBB, com secretariado nacional em São Paulo. Este site é mantido
                            pelo secretariado nacional.
                        </p>

                        <h3>2. Quais dados coletamos</h3>
                        <ul>
                            <li>
                                <strong>Dados de navegação:</strong> páginas visitadas, tempo de
                                permanência e tipo de dispositivo, usados apenas de forma agregada
                                para melhorar o site.
                            </li>
                            <li>
                                <strong>Dados fornecidos por você:</strong> nome, e-mail, telefone,
                                cidade e o conteúdo da mensagem, quando você preenche um formulário
                                ou nos escreve.
                            </li>
                            <li>
                                <strong>Dados de atendimento:</strong> informações necessárias ao
                                acompanhamento do caso, registradas apenas com o conhecimento da
                                pessoa atendida.
                            </li>
                        </ul>

                        <h3>3. Para que usamos</h3>
                        <p>
                            Usamos os dados exclusivamente para responder ao seu contato, prestar
                            orientação, encaminhar seu caso à equipe adequada, enviar publicações
                            que você tenha solicitado e produzir estatísticas agregadas sobre o
                            perfil de atendimento — nunca identificáveis.
                        </p>

                        <h3>4. Com quem compartilhamos</h3>
                        <p>
                            Compartilhamos dados apenas quando isso é necessário para o próprio
                            atendimento e com seu conhecimento — por exemplo, ao encaminhar um caso
                            à Defensoria Pública da União ou a um serviço de saúde. Não vendemos,
                            alugamos nem cedemos dados para fins comerciais.
                        </p>
                        <p>
                            <strong>Não compartilhamos dados com autoridades migratórias</strong>{' '}
                            para fins de fiscalização ou controle, salvo determinação judicial
                            expressa e específica.
                        </p>

                        <h3>5. Por quanto tempo guardamos</h3>
                        <p>
                            Mensagens de contato são mantidas por até 24 meses. Registros de
                            atendimento seguem os prazos exigidos pelos projetos e convênios aos
                            quais estão vinculados. Depois disso, são anonimizados ou eliminados.
                        </p>

                        <h3>6. Cookies</h3>
                        <p>
                            Utilizamos cookies essenciais ao funcionamento do site e cookies de
                            análise estatística agregada. Você pode bloquear cookies nas
                            configurações do seu navegador — o site continuará funcionando.
                        </p>

                        <h3>7. Seus direitos</h3>
                        <p>
                            Conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você
                            pode a qualquer momento solicitar:
                        </p>
                        <ul>
                            <li>confirmação da existência de tratamento dos seus dados;</li>
                            <li>acesso, correção ou atualização dos dados;</li>
                            <li>anonimização, bloqueio ou eliminação;</li>
                            <li>revogação do consentimento;</li>
                            <li>informação sobre com quem os dados foram compartilhados.</li>
                        </ul>
                        <p>
                            Esses direitos valem independentemente da sua nacionalidade ou situação
                            migratória.
                        </p>

                        <h3>8. Segurança</h3>
                        <p>
                            Adotamos controles de acesso individuais e registrados para sistemas que
                            contenham dados de atendimento. Agentes e voluntários assinam termo de
                            sigilo.
                        </p>

                        <h3>9. Como falar sobre privacidade</h3>
                        <p>
                            Escreva para{' '}
                            <a href="mailto:privacidade@spmnacional.org.br">
                                privacidade@spmnacional.org.br
                            </a>{' '}
                            ou use o formulário em <Link href="/fale-conosco">Fale Conosco</Link>.
                            Respondemos em até 15 dias.
                        </p>

                        <h3>10. Atualizações</h3>
                        <p>
                            Esta política pode ser atualizada. Alterações relevantes serão
                            comunicadas nesta página. Última revisão: agosto de 2026.
                        </p>
                    </div>
                </div>
            </section>
        </>
    );
}
