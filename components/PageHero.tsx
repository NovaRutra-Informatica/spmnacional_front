import Link from 'next/link';
import { Fragment } from 'react';

export interface Crumb {
    label: string;
    link?: string;
}

interface PageHeroProps {
    title: string;
    subtitle?: string;
    eyebrow?: string;
    center?: boolean;
    waveFill?: string;
    crumbs?: Crumb[];
}

export default function PageHero({
    title,
    subtitle,
    eyebrow,
    center = false,
    waveFill = '#ffffff',
    crumbs = [],
}: PageHeroProps) {
    return (
        <section className={`page-hero${center ? ' page-hero--center' : ''}`}>
            <div className="container">
                <div className="page-hero__inner">
                    {crumbs.length > 0 && (
                        <ul className="breadcrumb">
                            <li>
                                <Link href="/">Início</Link>
                            </li>
                            {crumbs.map((crumb) => (
                                <Fragment key={crumb.label}>
                                    <li className="sep">/</li>
                                    <li className={crumb.link ? undefined : 'current'}>
                                        {crumb.link ? (
                                            <Link href={crumb.link}>{crumb.label}</Link>
                                        ) : (
                                            crumb.label
                                        )}
                                    </li>
                                </Fragment>
                            ))}
                        </ul>
                    )}

                    {eyebrow && <span className="badge-pill badge-pill--light">{eyebrow}</span>}

                    <h1>{title}</h1>

                    {subtitle && <p className="page-hero__subtitle">{subtitle}</p>}
                </div>
            </div>

            <div className="wave-divider">
                <svg viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden="true">
                    <path
                        fill={waveFill}
                        d="M0,256L60,240C120,224,240,192,360,192C480,192,600,224,720,234.7C840,245,960,235,1080,213.3C1200,192,1320,160,1380,144L1440,128L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z"
                    ></path>
                </svg>
            </div>
        </section>
    );
}
