import { PRODUCTION_ORIGIN } from '@/lib/seo';

/** Dados institucionais já publicados em Fale conosco; sem geolocalização ou ratings. */
export const ORGANIZATION_SCHEMA = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    '@id': `${PRODUCTION_ORIGIN}/#organizacao`,
    name: 'Serviço Pastoral dos Migrantes',
    alternateName: 'SPM Nacional',
    url: PRODUCTION_ORIGIN,
    address: {
        '@type': 'PostalAddress',
        streetAddress: 'Rua Caiambé, 126, Ipiranga',
        addressLocality: 'São Paulo',
        addressRegion: 'SP',
        postalCode: '04264-060',
        addressCountry: 'BR',
    },
    contactPoint: {
        '@type': 'ContactPoint',
        telephone: '+55-11-2063-7064',
        contactType: 'Secretariado nacional',
    },
} as const;
