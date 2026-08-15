import type { Metadata } from 'next';
import Link from 'next/link';
import PageHero from '@/components/PageHero';
import { UserStatus } from '@/lib/generated/prisma/enums';
import { hashToken } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/db';
import PageContent from './PageContent';

// Consulta o banco a cada acesso: o convite é válido por tempo limitado.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Ativar acesso',
    // Convite é link privado: não deve aparecer em buscador nenhum.
    robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;

    // No banco só existe o HMAC do token — o valor em claro vive só na URL.
    // O `status` entra na busca porque desativar uma conta não apaga o convite
    // pendente: sem esse filtro, um link antigo reativaria o próprio acesso.
    const usuario = await prisma.user.findFirst({
        where: {
            inviteTokenHash: hashToken(token),
            inviteExpiresAt: { gt: new Date() },
            status: UserStatus.PENDENTE,
        },
        select: { name: true, email: true, role: { select: { name: true } } },
    });

    if (!usuario) {
        return (
            <>
                <PageHero
                    eyebrow="Área restrita"
                    title="Convite indisponível"
                    subtitle="Este link de ativação não está mais válido."
                    crumbs={[{ label: 'Ativar acesso' }]}
                    center
                    waveFill="#f8f9fa"
                />

                <section className="section section--light">
                    <div className="container">
                        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
                            <div className="empty-state">
                                <i className="fas fa-hourglass-end"></i>
                                <h3>Convite expirado ou já utilizado</h3>
                                <p>
                                    Por segurança, o link de ativação vale por tempo limitado e só
                                    pode ser usado uma vez. Se você já definiu sua senha, entre pela
                                    Área do Atendente. Caso contrário, peça um novo convite à
                                    coordenação.
                                </p>
                                <div
                                    style={{
                                        display: 'flex',
                                        gap: '0.75rem',
                                        justifyContent: 'center',
                                        flexWrap: 'wrap',
                                        marginTop: '1.75rem',
                                    }}
                                >
                                    <Link className="btn btn--primary" href="/fale-conosco">
                                        <i className="fas fa-headset"></i> Falar com a coordenação
                                    </Link>
                                    <Link className="btn btn--outline" href="/atendente">
                                        <i className="fas fa-right-to-bracket"></i> Ir para o login
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </>
        );
    }

    return (
        <PageContent
            token={token}
            nome={usuario.name}
            email={usuario.email}
            papel={usuario.role.name}
        />
    );
}
