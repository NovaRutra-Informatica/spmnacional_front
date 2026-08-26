import Link from 'next/link';

export default function Footer() {
    return (
        <footer className="main-footer">
            <div className="container">
                <div className="footer-top">
                    <div className="footer-col brand-col">
                        <Link href="/" className="footer-logo">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/logo-small-white.png" alt="Serviço Pastoral dos Migrantes" />
                        </Link>
                        <p className="mission-text">
                            Desde 1985, construindo pontes e derrubando muros. Um organismo da
                            Pastoral Social da CNBB que acolhe, organiza e defende os direitos de
                            quem migra em todo o Brasil.
                        </p>
                        <div className="social-links">
                            <a href="#" aria-label="Instagram">
                                <i className="fab fa-instagram"></i>
                            </a>
                            <a href="#" aria-label="Facebook">
                                <i className="fab fa-facebook-f"></i>
                            </a>
                            <a href="#" aria-label="YouTube">
                                <i className="fab fa-youtube"></i>
                            </a>
                            <a href="#" aria-label="WhatsApp">
                                <i className="fab fa-whatsapp"></i>
                            </a>
                        </div>
                    </div>

                    <div className="footer-col">
                        <h4>Institucional</h4>
                        <ul>
                            <li>
                                <Link href="/quem-somos">Quem somos</Link>
                            </li>
                            <li>
                                <Link href="/quem-somos/historia">Nossa história</Link>
                            </li>
                            <li>
                                <Link href="/quem-somos/estrutura">Estrutura e coordenação</Link>
                            </li>
                            <li>
                                <Link href="/quem-somos/documentos">Documentos</Link>
                            </li>
                            <li>
                                <Link href="/transparencia">Transparência</Link>
                            </li>
                        </ul>
                    </div>

                    <div className="footer-col">
                        <h4>O que fazemos</h4>
                        <ul>
                            <li>
                                <Link href="/o-que-fazemos">Frentes de atuação</Link>
                            </li>
                            <li>
                                <Link href="/onde-estamos">Onde estamos</Link>
                            </li>
                            <li>
                                <Link href="/semana-do-migrante">Semana do Migrante</Link>
                            </li>
                            <li>
                                <Link href="/legislacao">Legislação</Link>
                            </li>
                            <li>
                                <Link href="/como-ajudar">Como ajudar</Link>
                            </li>
                        </ul>
                    </div>

                    <div className="footer-col">
                        <h4>Publicações</h4>
                        <ul>
                            <li>
                                <Link href="/publicacoes/blog">Blog e notícias</Link>
                            </li>
                            <li>
                                <Link href="/publicacoes/editais">Editais</Link>
                            </li>
                            <li>
                                <Link href="/publicacoes/testemunhos">Testemunhos</Link>
                            </li>
                            <li>
                                <Link href="/agenda">Agenda</Link>
                            </li>
                            <li>
                                <Link href="/atendente">Área do atendente</Link>
                            </li>
                        </ul>
                    </div>

                    <div className="footer-col contact-col">
                        <h4>Fale conosco</h4>
                        <p>
                            <i className="fas fa-map-marker-alt"></i> Rua Caiambé, 126 — Ipiranga
                            <br />
                            São Paulo — SP · 04264-060
                        </p>
                        <p>
                            <i className="fas fa-envelope"></i> contato@spmnacional.org.br
                        </p>
                        <p>
                            <i className="fas fa-phone"></i> (11) 2063-7064
                        </p>

                        <Link href="/como-ajudar" className="footer-cta">
                            <i className="fas fa-heart"></i> Apoie o SPM
                        </Link>
                    </div>
                </div>

                <div className="footer-bottom">
                    <p>&copy; 2026 Serviço Pastoral dos Migrantes. Todos os direitos reservados.</p>
                    <div className="legal-links">
                        <Link href="/politica-de-privacidade">Política de Privacidade</Link>
                        <span className="separator">•</span>
                        <Link href="/transparencia">Transparência</Link>
                        <span className="separator">•</span>
                        <Link href="/fale-conosco">Contato</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
