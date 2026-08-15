import type { Metadata } from 'next';
import Link from 'next/link';
import PageHero from '@/components/PageHero';
import { recordAudit } from '@/lib/server/audit';
import { hashToken } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/db';

// Consulta e atualiza o Postgres a cada acesso: nunca pode ser pré-renderizada.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Confirmação do boletim',
    robots: { index: false, follow: false },
};

interface PageProps {
    searchParams: Promise<{ token?: string }>;
}

type Resultado =
    { ok: true; email: string } | { ok: false; motivo: 'ausente' | 'invalido' | 'falha' };

/**
 * O link do e-mail carrega o token em claro; no banco só existe o HMAC dele.
 * Confirmar é, então, procurar pelo hash — o mesmo desenho usado em sessões e
 * convites.
 */
async function confirmar(token: string | undefined): Promise<Resultado> {
    if (!token) return { ok: false, motivo: 'ausente' };

    try {
        const subscriber = await prisma.newsletterSubscriber.findUnique({
            where: { confirmTokenHash: hashToken(token) },
            select: { id: true, email: true },
        });

        if (!subscriber) return { ok: false, motivo: 'invalido' };

        await prisma.newsletterSubscriber.update({
            where: { id: subscriber.id },
            data: {
                confirmed: true,
                confirmedAt: new Date(),
                // O token é de uso único: some assim que cumpre seu papel.
                confirmTokenHash: null,
                unsubscribedAt: null,
            },
        });

        await recordAudit({
            action: 'Inscrição no boletim confirmada',
            target: subscriber.email,
            actorLabel: 'site público',
        });

        return { ok: true, email: subscriber.email };
    } catch (error) {
        console.error('[newsletter] falha ao confirmar inscrição:', error);
        return { ok: false, motivo: 'falha' };
    }
}

const MENSAGENS: Record<'ausente' | 'invalido' | 'falha', string> = {
    ausente:
        'O endereço acessado não trouxe o código de confirmação. Abra o link direto do e-mail que enviamos.',
    invalido:
        'Este link não vale mais: ou já foi usado, ou a inscrição foi refeita depois dele. Se você não recebe o boletim, inscreva-se novamente na página inicial.',
    falha: 'Tivemos um problema para confirmar sua inscrição agora. Tente novamente em alguns minutos.',
};

export default async function Page({ searchParams }: PageProps) {
    const { token } = await searchParams;
    const resultado = await confirmar(token);

    return (
        <>
            <PageHero
                eyebrow="Boletim"
                title={resultado.ok ? 'Inscrição confirmada' : 'Não foi possível confirmar'}
                subtitle={
                    resultado.ok
                        ? 'Pronto: você passa a receber as notícias, editais e materiais de formação do SPM.'
                        : 'O link de confirmação não pôde ser validado.'
                }
                center
                crumbs={[{ label: 'Boletim' }, { label: 'Confirmação' }]}
            />

            <section className="section">
                <div className="container">
                    {resultado.ok ? (
                        <div className="callout">
                            <i className="fas fa-circle-check"></i>
                            <p>
                                <strong>Inscrição confirmada para {resultado.email}.</strong>{' '}
                                Enviamos o boletim mensalmente e você pode cancelar quando quiser.
                                Enquanto isso, veja as{' '}
                                <Link href="/publicacoes/blog">últimas notícias</Link> ou conheça a{' '}
                                <Link href="/semana-do-migrante">Semana do Migrante</Link>.
                            </p>
                        </div>
                    ) : (
                        <div className="callout callout--action">
                            <i className="fas fa-triangle-exclamation"></i>
                            <p>
                                {MENSAGENS[resultado.motivo]} Se precisar falar com a equipe, use a
                                página <Link href="/fale-conosco">Fale conosco</Link>.
                            </p>
                        </div>
                    )}
                </div>
            </section>
        </>
    );
}
