import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { INSTITUTIONAL_ICONS, INSTITUTIONAL_LOGO, INSTITUTIONAL_LOGO_ALT } from '@/lib/content/branding';

vi.mock('@/components/TranslationProvider', () => ({
    TranslatedContent: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    usePublicTranslation: () => ({ locale: 'pt', enabled: false }),
}));
vi.mock('@/components/LocalizedLink', () => ({
    default: ({ children, href, ...props }: {children:React.ReactNode;href:string}) => React.createElement('a',{href,...props},children),
}));
vi.mock('next/link', () => ({
    default: ({ children, href, ...props }: {children:React.ReactNode;href:string}) => React.createElement('a',{href,...props},children),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/app/atendente/actions', () => ({ entrarLocal: vi.fn() }));
beforeAll(() => vi.stubGlobal('React',React));

describe('original institutional branding', () => {
    it('preserves the exact supplied artwork and uses it for both browser icons', () => {
        const bytes=readFileSync(`public${INSTITUTIONAL_LOGO}`);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe('f521e9f990c695efb931c4248bb61159559b3eeea3a71191f017a45f111daa82');
        expect(bytes.readUInt32BE(16)).toBe(1080);
        expect(bytes.readUInt32BE(20)).toBe(1080);
        expect(INSTITUTIONAL_ICONS).toEqual({icon:{url:INSTITUTIONAL_LOGO,type:'image/png'},apple:INSTITUTIONAL_LOGO});
        expect(existsSync('app/icon.svg')).toBe(false);
        expect(readFileSync('app/layout.tsx','utf8')).toContain('icons: INSTITUTIONAL_ICONS');
    });

    it('renders the original logo with accessible dimensions across public and private entry points', async () => {
        const [{default:Header},{default:Footer},{default:AdminShell},{default:Login}] = await Promise.all([
            import('@/components/Header'),import('@/components/Footer'),import('@/components/admin/AdminShell'),import('@/app/atendente/PageContent'),
        ]);
        const shellProps={user:{name:'Fixture',role:'Admin',initials:'FX'},groups:[],notifications:[],logoutAction:async()=>{},children:null};
        const components=[React.createElement(Header),React.createElement(Footer),
            React.createElement(AdminShell,shellProps),
            React.createElement(Login,{googleEnabled:true,proximo:'/admin'})];
        for(const component of components){
            const html=renderToStaticMarkup(component);
            expect(html).toContain(`src="${INSTITUTIONAL_LOGO}"`);
            expect(html).toContain(`alt="${INSTITUTIONAL_LOGO_ALT}"`);
            expect(html).not.toMatch(/logo-small-(blue|white)/);
            const image=html.match(/<img[^>]*src="\/assets\/spm_logo_atualizada.png"[^>]*>/)?.[0];
            expect(image).toMatch(/width="\d+"/);
            expect(image).toMatch(/height="\d+"/);
        }
    });

    it('does not crop the artwork in header, footer or administrative shell', () => {
        for(const file of ['styles/_header.scss','styles/_footer.scss','styles/_admin.scss']){
            const source=readFileSync(file,'utf8');
            const brand=source.slice(source.indexOf(file.includes('header')?'.brand-logo':file.includes('footer')?'.footer-logo':'.admin-brand'));
            expect(brand.slice(0,1500)).toContain('object-fit: contain');
        }
    });

    it('renders a valid social PNG using the original artwork without an invented logotype', async () => {
        const {default:OpenGraphImage}=await import('@/app/opengraph-image');
        const response=await OpenGraphImage();
        const png=Buffer.from(await response.arrayBuffer());
        expect(png.subarray(1,4).toString()).toBe('PNG');
        expect(png.readUInt32BE(16)).toBe(1200);
        expect(png.readUInt32BE(20)).toBe(630);
        const source=readFileSync('app/opengraph-image.tsx','utf8');
        expect(source).toContain('INSTITUTIONAL_LOGO');
        expect(source).not.toContain('fontSize: 80');
    });
});
