import Link from 'next/link';

interface PageCtaProps {
    title?: string;
    text?: string;
    primaryLabel?: string;
    primaryLink?: string;
    secondaryLabel?: string;
    secondaryLink?: string;
}

export default function PageCta({
    title = 'Ninguém constrói pontes sozinho',
    text = 'Sua doação, seu tempo ou sua articulação local sustentam a acolhida de quem chega. Some-se à rede do SPM.',
    primaryLabel = 'Como Ajudar',
    primaryLink = '/como-ajudar',
    secondaryLabel = 'Fale Conosco',
    secondaryLink = '/fale-conosco',
}: PageCtaProps) {
    return (
        <section className="cta-band">
            <div className="container">
                <h2>{title}</h2>
                <p>{text}</p>
                <div className="cta-band__actions">
                    <Link className="btn btn--cta" href={primaryLink}>
                        <i className="fas fa-heart"></i> {primaryLabel}
                    </Link>
                    <Link className="btn btn--light" href={secondaryLink}>
                        {secondaryLabel}
                    </Link>
                </div>
            </div>
        </section>
    );
}
