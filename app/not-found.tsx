import type { Metadata } from 'next';
import Link from '@/components/LocalizedLink';
import PageHero from '@/components/PageHero';

export const metadata: Metadata = {
    title: 'Página não encontrada',
    description:
        'Este endereço não foi encontrado. Volte ao início ou encontre o contato, as publicações e os serviços do SPM.',
    robots: { index: false, follow: false },
};

export default function NotFound() {
    return (
        <>
            <PageHero
                eyebrow="Erro 404"
                title="Página não encontrada"
                subtitle="Não encontramos este endereço. Confira o link ou use os caminhos abaixo para continuar no site do SPM."
                center
            />

            <section className="section">
                <div className="container">
                    <div className="section-head section-head--center">
                        <span className="eyebrow">Continue navegando</span>
                        <h2>Para onde você quer ir?</h2>
                    </div>

                    <div className="grid grid--3">
                        <Link className="card" href="/">
                            <div className="card__icon">
                                <i className="fas fa-house"></i>
                            </div>
                            <h3>Página inicial</h3>
                            <p>Volte ao começo e conheça o Serviço Pastoral dos Migrantes.</p>
                            <span className="card__link">
                                Ir para o início <i className="fas fa-arrow-right"></i>
                            </span>
                        </Link>
                        <Link className="card" href="/quem-somos">
                            <div className="card__icon">
                                <i className="fas fa-people-group"></i>
                            </div>
                            <h3>Quem somos</h3>
                            <p>
                                Missão, história, estrutura e a metodologia que orienta nosso
                                trabalho.
                            </p>
                            <span className="card__link">
                                Conhecer o SPM <i className="fas fa-arrow-right"></i>
                            </span>
                        </Link>
                        <Link className="card" href="/fale-conosco">
                            <div className="card__icon">
                                <i className="fas fa-headset"></i>
                            </div>
                            <h3>Fale conosco</h3>
                            <p>
                                Precisa de orientação ou quer ajudar? Escreva para a nossa equipe.
                            </p>
                            <span className="card__link">
                                Entrar em contato <i className="fas fa-arrow-right"></i>
                            </span>
                        </Link>
                        <Link className="card" href="/legislacao">
                            <div className="card__icon">
                                <i className="fas fa-scale-balanced"></i>
                            </div>
                            <h3>Legislação</h3>
                            <p>
                                Os direitos garantidos a quem migra no Brasil, explicados de forma
                                acessível.
                            </p>
                            <span className="card__link">
                                Ver leis <i className="fas fa-arrow-right"></i>
                            </span>
                        </Link>
                        <Link className="card" href="/publicacoes/blog">
                            <div className="card__icon">
                                <i className="fas fa-newspaper"></i>
                            </div>
                            <h3>Blog e notícias</h3>
                            <p>Artigos, notas públicas e relatos das equipes regionais.</p>
                            <span className="card__link">
                                Ler publicações <i className="fas fa-arrow-right"></i>
                            </span>
                        </Link>
                        <Link className="card" href="/semana-do-migrante">
                            <div className="card__icon">
                                <i className="fas fa-calendar-days"></i>
                            </div>
                            <h3>Semana do Migrante</h3>
                            <p>
                                Materiais de formação e a história da nossa principal campanha
                                anual.
                            </p>
                            <span className="card__link">
                                Ver materiais <i className="fas fa-arrow-right"></i>
                            </span>
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
