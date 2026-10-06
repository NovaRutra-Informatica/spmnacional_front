'use client';

export default function GlobalError({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="pt-BR">
            <body
                style={{
                    fontFamily: 'system-ui, sans-serif',
                    padding: '3rem',
                    maxWidth: '50rem',
                    margin: 'auto',
                }}
            >
                <main role="alert">
                    <h1>O site está temporariamente indisponível</h1>
                    <p>
                        Tente novamente em alguns instantes. Nenhum detalhe interno é exibido aqui.
                    </p>
                    <button type="button" onClick={reset}>
                        Tentar novamente
                    </button>
                </main>
            </body>
        </html>
    );
}
