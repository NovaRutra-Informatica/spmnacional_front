import { expect, test } from '@playwright/test';

test('metadados públicos distintos, canônicos e HML fora do índice', async ({ page, request }) => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const path of ['/quem-somos', '/o-que-fazemos', '/fale-conosco']) {
        await page.goto(path);
        const title = await page.title();
        const description = await page.locator('meta[name="description"]').getAttribute('content');
        expect(titles.has(title)).toBe(false);
        expect(descriptions.has(description!)).toBe(false);
        titles.add(title);
        descriptions.add(description!);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            `https://spmnacional.org.br${path}`,
        );
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
        await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
            'content',
            description!,
        );
    }
    const robots = await request.get('/robots.txt');
    expect(await robots.text()).toContain('Disallow: /');
    expect(await robots.text()).not.toContain('Sitemap:');
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).not.toContain('<url>');
});

test('imagem social e ícone têm arquivos válidos', async ({ request }) => {
    const image = await request.get('/opengraph-image');
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/png');
    const png = await image.body();
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    const icon = await request.get('/assets/spm_logo_atualizada.png');
    expect(icon.status()).toBe(200);
    expect(icon.headers()['content-type']).toContain('image/png');
    const iconBytes = await icon.body();
    expect(iconBytes.subarray(1, 4).toString()).toBe('PNG');
    expect(iconBytes.readUInt32BE(16)).toBe(1080);
    expect(iconBytes.readUInt32BE(20)).toBe(1080);
    const optimized = await request.get(
        '/_next/image?url=%2Fassets%2Fhome%2Facolhimento-comunitario.webp&w=640&q=75',
    );
    expect(optimized.status()).toBe(200);
    expect(optimized.headers()['content-type']).toMatch(/^image\//);
});

test('contato visível no destaque e barra móvel não cobre o fim da página', async ({
    page,
}, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const hero = page.getByRole('region', { name: 'Destaques do Serviço Pastoral dos Migrantes' });
    const contact = hero.getByRole('link', { name: 'Preciso de orientação' });
    await expect(contact).toBeVisible();
    const bounds = await contact.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(await page.locator('h1').count()).toBe(1);
    await page.getByRole('button', { name: 'Entendi e fechar' }).click();
    const sticky = page.getByRole('navigation', { name: 'Contato e apoio' });
    if (testInfo.project.name === 'mobile') {
        await expect(sticky).toBeVisible();
        await expect(sticky.getByRole('link', { name: 'Falar com a equipe' })).toHaveAttribute(
            'href',
            '/fale-conosco#formulario',
        );
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const footer = await page.locator('.footer-bottom').boundingBox();
        const bar = await sticky.boundingBox();
        expect(footer).not.toBeNull();
        expect(bar).not.toBeNull();
        expect(footer!.y + footer!.height).toBeLessThanOrEqual(bar!.y);
    } else {
        await expect(sticky).toBeHidden();
    }
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);
});

test('perguntas frequentes, breadcrumbs e mapa acessíveis sem carregar iframe', async ({
    page,
}) => {
    await page.goto('/fale-conosco');
    const breadcrumb = page.getByRole('navigation', { name: 'Caminho da página' });
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Fale conosco');
    const question = page.getByRole('button', {
        name: 'Sou migrante e preciso de orientação. Como entro em contato?',
    });
    await expect(question).toHaveAttribute('aria-expanded', 'false');
    await question.click();
    await expect(question).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#faq-answer-0')).toBeVisible();
    await question.click();
    await expect(page.locator('#faq-answer-0')).toBeHidden();
    const directions = page.getByRole('link', { name: 'Traçar rota no Google Maps', exact: false });
    const mapsUrl = new URL((await directions.getAttribute('href'))!);
    expect(mapsUrl.origin).toBe('https://www.google.com');
    expect(mapsUrl.searchParams.get('destination')).toContain('Rua Caiambé, 126');
    await expect(directions).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('iframe')).toHaveCount(0);
    const faq = page.locator('script[type="application/ld+json"]');
    const json = JSON.parse((await faq.textContent())!);
    expect(json['@type']).toBe('FAQPage');
    expect(json.mainEntity).toHaveLength(6);
    expect(await faq.evaluate((node) => (node as HTMLScriptElement).nonce)).toBeTruthy();
});

test('envio sintético confirma em página própria sem dados na URL', async ({ page }) => {
    // O runner deste projeto exige Postgres descartável e desativa SMTP.
    await page.goto('/fale-conosco');
    await page.getByRole('button', { name: 'Entendi e fechar' }).click();
    await page.getByLabel('Nome', { exact: true }).fill('Pessoa sintética de teste UI');
    await page.getByLabel('E-mail', { exact: true }).fill('contato-ui@example.invalid');
    await page.getByLabel('Assunto', { exact: true }).selectOption('Outro assunto');
    await page
        .getByLabel('Mensagem', { exact: true })
        .fill(
            'Mensagem sintética do teste isolado de interface. Não contém dados de pessoas reais.',
        );
    await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
    await expect(page).toHaveURL(/\/fale-conosco\/obrigado$/);
    await expect(page.getByRole('heading', { name: 'Obrigado pelo contato' })).toBeVisible();
    await expect(
        page.getByText('Responderemos o mais breve possível.', { exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('404, casos vazios e política oferecem caminhos úteis sem evidência inventada', async ({
    page,
}) => {
    const missing = await page.goto('/rota-publica-inexistente-de-teste');
    expect(missing?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
    await expect(
        page.locator('main').getByRole('link', { name: /Entrar em contato/ }),
    ).toHaveAttribute('href', '/fale-conosco');
    await page.goto('/publicacoes/estudos-de-caso');
    await expect(
        page.getByRole('heading', { name: 'Nenhum estudo de caso publicado no momento' }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    await page.goto('/politica-de-privacidade');
    await expect(
        page.getByText('o Google Analytics está desativado neste ambiente.', { exact: false }),
    ).toBeVisible();
});
