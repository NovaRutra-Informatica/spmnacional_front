import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/seo';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { INSTITUTIONAL_LOGO, INSTITUTIONAL_LOGO_ALT } from '@/lib/content/branding';

export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
    const logo = await readFile(join(process.cwd(), 'public', INSTITUTIONAL_LOGO));
    return new ImageResponse(
        <div
            style={{
                display: 'flex',
                width: '100%',
                height: '100%',
                background: '#004a99',
                color: '#fff',
                padding: '72px',
                flexDirection: 'column',
                justifyContent: 'space-between',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img width={160} height={160} src={`data:image/png;base64,${logo.toString('base64')}`} alt={INSTITUTIONAL_LOGO_ALT} style={{ objectFit: 'contain' }} />
                <span style={{ fontSize: 38, maxWidth: 560 }}>Serviço Pastoral dos Migrantes</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <span style={{ fontSize: 64, maxWidth: 990, lineHeight: 1.15 }}>
                    Acolher. Proteger. Promover. Integrar.
                </span>
                <span style={{ fontSize: 26 }}>spmnacional.org.br</span>
            </div>
        </div>,
        size,
    );
}
