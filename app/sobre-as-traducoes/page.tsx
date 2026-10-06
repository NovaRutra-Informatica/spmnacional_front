import { pageMetadata } from '@/lib/seo';
import PageHero from '@/components/PageHero';

export const metadata = pageMetadata('/sobre-as-traducoes');
export default function TranslationInformation() {
    return (
        <div lang="pt-BR" dir="ltr" translate="no">
            <PageHero
                title="Sobre as traduções"
                subtitle="O texto original do SPM é publicado em português."
            />
            <section className="section">
                <div className="container prose">
                    <p>
                        Este site utiliza a Cloud Translation API para oferecer traduções
                        automáticas fornecidas pelo Google Translate. A tradução é uma facilidade de
                        leitura, não uma revisão humana.
                    </p>
                    <p>
                        O Google não oferece garantias, expressas ou implícitas, relacionadas às
                        traduções, incluindo precisão, confiabilidade, comercialização, adequação a
                        uma finalidade específica ou ausência de violação de direitos.
                    </p>
                    <p>
                        Se houver dúvida ou divergência, consulte o original em português e procure
                        a equipe do SPM. A tradução não substitui orientação profissional. Arquivos
                        PDF, imagens, vídeos e informações privadas enviadas em formulários não são
                        traduzidos por esta ferramenta.
                    </p>
                    <p>
                        Se a tradução estiver indisponível, o conteúdo original permanece acessível.
                        As versões traduzidas são atualizadas quando o conteúdo publicado muda.
                    </p>
                    <p>
                        <a
                            href="https://cloud.google.com/translate"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            Conheça a Cloud Translation API
                        </a>{' '}
                        e os{' '}
                        <a
                            href="https://docs.cloud.google.com/translate/attribution"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            avisos do Google sobre tradução automática
                        </a>
                        .
                    </p>
                </div>
            </section>
        </div>
    );
}
