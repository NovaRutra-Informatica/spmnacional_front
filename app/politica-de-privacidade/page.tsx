import { pageMetadata } from '@/lib/seo';
import PublicTranslation from '@/components/PublicTranslation';
import Link from '@/components/LocalizedLink';
import PageHero from '@/components/PageHero';
import { readAnalyticsConfig } from '@/lib/config/analytics';

export const metadata = pageMetadata('/politica-de-privacidade');

export default function Page() {
    const analyticsEnabled = readAnalyticsConfig(process.env).enabled;
    return (
        <PublicTranslation pageKey="politica-de-privacidade">
            {
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
                                        <strong>Nosso princípio central:</strong> dados de pessoas
                                        migrantes são tratados para acolhimento e orientação, com
                                        acesso restrito. Os encaminhamentos e as hipóteses legais de
                                        compartilhamento são descritos abaixo.
                                    </p>
                                </div>

                                <h3>1. Quem somos</h3>
                                <p>
                                    O Serviço Pastoral dos Migrantes (SPM) é um organismo da
                                    Pastoral Social da CNBB, com secretariado nacional em São Paulo.
                                    Este site é mantido pelo secretariado nacional.
                                </p>

                                <h3>2. Quais dados coletamos</h3>
                                <ul>
                                    <li>
                                        <strong>Estatísticas opcionais de navegação:</strong>{' '}
                                        {analyticsEnabled
                                            ? 'quando você permite, o Google Analytics recebe informações de uso das páginas públicas para ajudar a melhorar o site. Os campos dos formulários, o painel e os parâmetros das URLs não são enviados a essa ferramenta.'
                                            : 'o Google Analytics está desativado neste ambiente. Não carregamos essa ferramenta para medir suas visitas.'}
                                    </li>
                                    <li>
                                        <strong>Dados fornecidos por você:</strong> nome, e-mail,
                                        telefone, cidade e o conteúdo da mensagem, quando você
                                        preenche um formulário ou nos escreve.
                                    </li>
                                    <li>
                                        <strong>Dados de atendimento:</strong> informações
                                        necessárias ao acompanhamento do caso, registradas apenas
                                        com o conhecimento da pessoa atendida.
                                    </li>
                                </ul>

                                <h3>3. Para que usamos</h3>
                                <p>
                                    Usamos os dados exclusivamente para responder ao seu contato,
                                    prestar orientação, encaminhar seu caso à equipe adequada,
                                    enviar publicações que você tenha solicitado e produzir
                                    estatísticas agregadas sobre o perfil de atendimento.
                                </p>

                                <h3>4. Com quem compartilhamos</h3>
                                <p>
                                    Compartilhamos dados apenas quando isso é necessário para o
                                    próprio atendimento e com seu conhecimento — por exemplo, ao
                                    encaminhar um caso à Defensoria Pública da União ou a um serviço
                                    de saúde. O funcionamento do site também envolve provedores de
                                    infraestrutura e, quando configurado, de e-mail. Eles processam
                                    os dados necessários à prestação desses serviços. Não vendemos
                                    nem alugamos dados para fins comerciais.
                                </p>
                                <p>
                                    <strong>
                                        Não compartilhamos dados com autoridades migratórias
                                    </strong>{' '}
                                    para fins de fiscalização ou controle, salvo determinação
                                    judicial expressa e específica.
                                </p>

                                <h3>5. Por quanto tempo guardamos</h3>
                                <p>
                                    Mensagens de contato entram na rotina de exclusão após 24 meses
                                    desde a última atualização. Registros de atendimento entram na
                                    rotina de anonimização na data definida para o caso ou após
                                    24 meses sem atualização, o que ocorrer primeiro. O expurgo é
                                    automático e acontece quando essa rotina é executada.
                                </p>
                                <p>
                                    As cópias de segurança seguem retenção de 30 dias. A exclusão
                                    no banco ativo não elimina imediatamente os dados dessas
                                    cópias; eles permanecem até o expurgo do respectivo backup.
                                </p>

                                <h3>6. Cookies</h3>
                                <p>
                                    O painel usa cookies essenciais de sessão e de proteção do
                                    login. O site guarda preferências de idioma e de privacidade no
                                    navegador. Não há rastreamento publicitário.
                                </p>
                                <p>
                                    {analyticsEnabled
                                        ? 'As estatísticas opcionais só são ativadas depois de sua escolha explícita. Você pode recusar ou mudar a decisão em “Preferências de privacidade”, no rodapé. A recusa não impede o acesso ao site.'
                                        : 'Se estatísticas opcionais forem ativadas futuramente, pediremos sua escolha antes de carregar a ferramenta. Você poderá recusar sem perder acesso ao site.'}
                                </p>

                                <h3>7. Seus direitos</h3>
                                <p>
                                    Conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018),
                                    você pode a qualquer momento solicitar:
                                </p>
                                <ul>
                                    <li>confirmação da existência de tratamento dos seus dados;</li>
                                    <li>acesso, correção ou atualização dos dados;</li>
                                    <li>anonimização, bloqueio ou eliminação;</li>
                                    <li>revogação do consentimento;</li>
                                    <li>
                                        informação sobre com quem os dados foram compartilhados.
                                    </li>
                                </ul>
                                <p>
                                    Esses direitos valem independentemente da sua nacionalidade ou
                                    situação migratória.
                                </p>

                                <h3>8. Segurança</h3>
                                <p>
                                    Nome, contato e conteúdo enviados pelo formulário e os
                                    identificadores dos atendimentos são cifrados em repouso.
                                    Adotamos acesso individual por função, sessões revogáveis e
                                    auditoria das consultas a dados pessoais. IP e navegador não são
                                    associados às mensagens recebidas.
                                </p>

                                <h3>9. Como falar sobre privacidade</h3>
                                <p>
                                    Escreva para{' '}
                                    <a href="mailto:privacidade@spmnacional.org.br">
                                        privacidade@spmnacional.org.br
                                    </a>{' '}
                                    ou use o formulário em{' '}
                                    <Link href="/fale-conosco">Fale conosco</Link>. Sua solicitação
                                    será encaminhada à equipe responsável, observados os prazos
                                    legais aplicáveis a cada direito.
                                </p>
                                <p>
                                    Consulte também a orientação oficial da{' '}
                                    <a
                                        href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        ANPD sobre direitos dos titulares
                                        <span className="sr-only"> (abre em nova aba)</span>
                                    </a>
                                    .
                                </p>

                                <h3>10. Atualizações</h3>
                                <p>
                                    Esta política pode ser atualizada. Alterações relevantes serão
                                    comunicadas nesta página. Última revisão: outubro de 2026.
                                </p>
                            </div>
                        </div>
                    </section>
                </>
            }
        </PublicTranslation>
    );
}
