'use client';

export default function ErrorPage({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <section className="section" style={{ paddingTop: '10rem', minHeight: '65vh' }}>
            <div className="container" role="alert">
                <h1>Não foi possível carregar esta página</h1>
                <p>Tivemos uma falha temporária. Tente novamente em alguns instantes.</p>
                <button type="button" className="btn btn-primary" onClick={reset}>
                    Tentar novamente
                </button>
            </div>
        </section>
    );
}
