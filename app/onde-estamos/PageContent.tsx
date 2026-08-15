'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Animate from '@/components/Animate';
import PageHero from '@/components/PageHero';
import PageCta from '@/components/PageCta';
import { REGIAO_LABEL } from '@/lib/labels';
import type { Regiao } from '@/lib/generated/prisma/enums';

export interface RegionalItem {
    id: string;
    uf: string;
    name: string;
    region: Regiao;
    description: string;
    focus: string[];
    address: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
}

export interface RegionaisStats {
    unidades: number;
    ufs: number;
    regioes: number;
}

interface PageContentProps {
    regionais: RegionalItem[];
    stats: RegionaisStats;
}

const ALL = 'TODAS';

/** Filtro montado a partir do próprio dicionário de rótulos das regiões. */
const REGION_FILTERS: { value: string; label: string }[] = [
    { value: ALL, label: 'Todas' },
    ...(Object.entries(REGIAO_LABEL) as [Regiao, string][]).map(([value, label]) => ({
        value,
        label,
    })),
];

/** Endereço, telefone e e-mail só entram no card quando a unidade os divulga. */
function contactLines(regional: RegionalItem): { icon: string; value: string }[] {
    const lines: { icon: string; value: string }[] = [];
    const endereco = regional.address ?? regional.city;

    if (endereco) lines.push({ icon: 'fa-location-dot', value: endereco });
    if (regional.phone) lines.push({ icon: 'fa-phone', value: regional.phone });
    if (regional.email) lines.push({ icon: 'fa-envelope', value: regional.email });

    return lines;
}

export default function PageContent({ regionais, stats }: PageContentProps) {
    const [activeRegion, setActiveRegion] = useState<string>(ALL);

    const filtered = useMemo(
        () =>
            activeRegion === ALL
                ? regionais
                : regionais.filter((regional) => regional.region === activeRegion),
        [activeRegion, regionais],
    );

    return (
        <>
            <PageHero
                eyebrow="Presença nacional"
                title="Onde estamos"
                subtitle="Uma rede de equipes regionais e de base espalhada por fronteiras, canaviais, portos e periferias de todo o Brasil."
                crumbs={[{ label: 'Onde estamos' }]}
                waveFill="#f8f9fa"
            />

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head">
                        <span className="eyebrow">Mapa da rede</span>
                        <h2>O SPM está onde a migração acontece</h2>
                        <p>
                            Abaixo estão as <strong>unidades publicadas pelo SPM</strong>: equipes
                            com endereço e contato divulgados. A rede de atuação é maior do que esta
                            lista — muitas paróquias, casas de acolhida e coletivos de migrantes
                            caminham conosco sem constar aqui. Filtre por região para conhecer cada
                            equipe.
                        </p>
                    </Animate>

                    <Animate as="ul" className="pill-nav">
                        {REGION_FILTERS.map((filter) => (
                            <li key={filter.value}>
                                <button
                                    type="button"
                                    className={activeRegion === filter.value ? 'is-active' : ''}
                                    onClick={() => setActiveRegion(filter.value)}
                                >
                                    {filter.label}
                                </button>
                            </li>
                        ))}
                    </Animate>

                    {filtered.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-map-location-dot"></i>
                            <h3>Nenhuma unidade publicada nesta região</h3>
                            <p>
                                Ainda assim há equipes de base atuando por lá. Fale com o
                                secretariado nacional para localizar a mais próxima de você.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid--3">
                            {filtered.map((regional) => {
                                const contatos = contactLines(regional);

                                return (
                                    <Animate className="region-card" key={regional.id}>
                                        <span className="region-card__uf">
                                            {regional.uf} · {REGIAO_LABEL[regional.region]}
                                        </span>
                                        <h3>{regional.name}</h3>
                                        <p>{regional.description}</p>

                                        {regional.focus.length > 0 && (
                                            <ul>
                                                {regional.focus.map((item) => (
                                                    <li key={item}>
                                                        <i className="fas fa-circle-check"></i>{' '}
                                                        {item}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}

                                        {contatos.length > 0 && (
                                            <ul>
                                                {contatos.map((contato) => (
                                                    <li key={contato.value}>
                                                        <i className={`fas ${contato.icon}`}></i>{' '}
                                                        {contato.value}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </Animate>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            <section className="section section--brand">
                <div className="container">
                    <Animate className="stat-band">
                        <div className="stat-band__item">
                            <strong>{stats.unidades}</strong>
                            <span>Unidades publicadas pelo SPM</span>
                        </div>
                        <div className="stat-band__item">
                            <strong>{stats.ufs}</strong>
                            <span>UFs com unidade publicada</span>
                        </div>
                        <div className="stat-band__item">
                            <strong>{stats.regioes}</strong>
                            <span>Regiões do país representadas</span>
                        </div>
                        <div className="stat-band__item">
                            <strong>1985</strong>
                            <span>Ano em que a rede começou a se formar</span>
                        </div>
                    </Animate>
                </div>
            </section>

            <section className="section">
                <div className="container with-aside">
                    <Animate className="prose prose--wide">
                        <span className="eyebrow">Como a rede funciona</span>
                        <h2>Autonomia local, plano nacional</h2>
                        <p>
                            Cada regional tem autonomia para definir prioridades a partir da
                            realidade do seu território. Uma equipe de fronteira precisa de mutirões
                            de documentação; uma equipe de região canavieira precisa de
                            acompanhamento trabalhista; uma equipe urbana precisa de moradia e
                            escola.
                        </p>
                        <p>
                            O que une todas é o plano nacional aprovado em assembleia, a metodologia
                            FIA e o calendário comum — sobretudo a{' '}
                            <Link href="/semana-do-migrante">Semana do Migrante</Link>, celebrada
                            simultaneamente em todo o país na terceira semana de junho.
                        </p>

                        <h3>Não encontrou sua cidade?</h3>
                        <p>
                            Esta página lista apenas as unidades que o SPM publica com contato
                            aberto. A rede de atuação é bem maior: muitas paróquias, casas de
                            acolhida e coletivos de migrantes atuam conosco sem constar aqui. Se
                            você quer localizar a equipe mais próxima — ou começar uma —, fale com o
                            secretariado nacional.
                        </p>

                        <Link className="btn btn--cta" href="/fale-conosco">
                            <i className="fas fa-location-dot"></i> Encontrar uma equipe
                        </Link>
                    </Animate>

                    <aside className="aside-sticky">
                        <div className="aside-box">
                            <h4>Parceiros no território</h4>
                            <ul>
                                <li>Cáritas Brasileira e regionais</li>
                                <li>Missionários e Missionárias de São Carlos (Scalabrinianos)</li>
                                <li>Rede Clamor</li>
                                <li>Missão Paz — São Paulo</li>
                                <li>Comissão Pastoral da Terra</li>
                                <li>Defensoria Pública da União</li>
                            </ul>
                        </div>

                        <div className="aside-box">
                            <h4>Precisa de ajuda agora?</h4>
                            <ul>
                                <li>
                                    <strong>Disque 100</strong> — Direitos Humanos
                                </li>
                                <li>
                                    <strong>Disque 180</strong> — Central de Atendimento à Mulher
                                </li>
                                <li>
                                    <strong>Disque 190</strong> — Emergências policiais
                                </li>
                                <li>
                                    <Link href="/fale-conosco">Fale com o SPM →</Link>
                                </li>
                            </ul>
                        </div>
                    </aside>
                </div>
            </section>

            <PageCta
                title="Sua comunidade quer integrar a rede?"
                text="Oferecemos formação, material e acompanhamento para paróquias, dioceses e coletivos que desejam iniciar um trabalho pastoral com migrantes."
                primaryLabel="Quero começar"
                primaryLink="/fale-conosco"
                secondaryLabel="Ver o que fazemos"
                secondaryLink="/o-que-fazemos"
            />
        </>
    );
}
