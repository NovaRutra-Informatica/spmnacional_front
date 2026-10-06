import { expect, test, type Page } from '@playwright/test';

const browserDiagnostics = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    const messages: string[] = [];
    browserDiagnostics.set(page, messages);
    page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
    // Hydration warnings are console.error, not necessarily uncaught exceptions.
    // Keep all errors: a filter could accidentally hide another React regression.
    page.on('console', (message) => {
        if (message.type() === 'error') messages.push(`console.error: ${message.text()}`);
    });
});
test.afterEach(async ({ page }, testInfo) => {
    const messages = browserDiagnostics.get(page) ?? [];
    if (messages.length)
        await testInfo.attach('browser-errors', {
            body: JSON.stringify(messages, null, 2),
            contentType: 'application/json',
        });
    expect(
        messages,
        'Browser must not report hydration mismatches or other runtime errors',
    ).toEqual([]);
});

test('idiomas usam cache sintético offline e acompanham navegação do cliente', async ({ page }) => {
    await page.goto('/');
    const selector = page.getByRole('combobox', { name: 'Idioma / Language' });
    await expect(selector).toBeEnabled();
    await selector.selectOption('en');
    await expect(page).toHaveURL(/\?lang=en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.main-header')).toContainText('[TEST en] Início');

    // Clicking a Next Link, not page.goto, catches a stale RootLayout dictionary.
    await page.locator('a[href="/publicacoes/blog?lang=en"]').last().click();
    await expect(page).toHaveURL(/\/publicacoes\/blog\?lang=en$/);
    await expect(
        page.getByRole('heading', {
            name: '[TEST en] O que estamos pensando e fazendo',
            exact: true,
        }),
    ).toBeVisible();

    await page.getByRole('combobox', { name: 'Idioma / Language' }).selectOption('pt');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(
        page.getByRole('heading', { name: 'O que estamos pensando e fazendo', exact: true }),
    ).toBeVisible();
});

test('árabe mantém direção RTL, marca tradução automática e não transborda viewport', async ({
    page,
}, testInfo) => {
    // A captura de página inteira precisa mostrar também blocos fora da viewport.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/publicacoes/blog/noticia-publicada-teste?lang=ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('.main-header')).toHaveClass(/\bscrolled\b/);
    await expect(page.locator('.brand-text strong')).toHaveText('SPM');
    const translatedArticle = page
        .locator('[lang="ar-x-mtfrom-pt"]')
        .filter({ hasText: '[TEST ar] مرحبا Conteúdo sintético de teste.' })
        .last();
    await expect(translatedArticle).toHaveAttribute('dir', 'rtl');
    await expect(translatedArticle).toContainText('[TEST ar] مرحبا Conteúdo sintético de teste.');
    await expect(translatedArticle.locator('.translation-notice')).toContainText('ترجمة آلية');
    const cookieDismiss = page.getByRole('button', { name: /Entendi e fechar/ });
    if (await cookieDismiss.isVisible()) await cookieDismiss.click();
    if (testInfo.project.name === 'mobile') {
        const donate = page.locator('.mobile-sticky-bar .btn-sticky-donate');
        await expect(donate).toBeVisible();
        const bounds = await donate.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    await page.mouse.move(0, (page.viewportSize()?.height ?? 720) - 1);
    if (testInfo.project.name === 'desktop') {
        await expect(page.locator('.main-header .dropdown:visible')).toHaveCount(0);
        const donate = page.locator('.main-header .header-actions .btn-donate');
        await expect(donate).toBeVisible();
        const bounds = await donate.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    // A largura do documento não revela recortes mascarados por overflow-x:hidden.
    // O aviso precisa estar integralmente abaixo do header fixo, sem sobreposição.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect
        .poll(async () => {
            const header = await page.locator('.main-header').boundingBox();
            const notice = await page
                .locator('main > .public-translation > .translation-notice')
                .boundingBox();
            return header && notice ? notice.y - (header.y + header.height) : -1;
        })
        .toBeGreaterThanOrEqual(0);
    const width = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
    }));
    expect(width.doc).toBeLessThanOrEqual(width.viewport);
    await testInfo.attach('translation-layout', {
        body: JSON.stringify(
            await page.evaluate(() =>
                Object.fromEntries(
                    [
                        '.main-header',
                        'main > .public-translation',
                        'main > .public-translation > .translation-notice',
                    ].map((selector) => {
                        const element = document.querySelector(selector)!;
                        const style = getComputedStyle(element);
                        return [
                            selector,
                            {
                                rectangle: element.getBoundingClientRect().toJSON(),
                                paddingTop: style.paddingTop,
                                paddingBottom: style.paddingBottom,
                                marginTop: style.marginTop,
                                position: style.position,
                            },
                        ];
                    }),
                ),
            ),
            null,
            2,
        ),
        contentType: 'application/json',
    });
    await page.screenshot({ path: testInfo.outputPath('arabic-viewport.png') });
    await page.screenshot({ path: testInfo.outputPath('arabic-translation.png'), fullPage: true });
    await testInfo.attach('translation-layout-after-screenshot', {
        body: JSON.stringify(
            await page.evaluate(() => ({
                header: document.querySelector('.main-header')!.getBoundingClientRect().toJSON(),
                notice: document
                    .querySelector('main > .public-translation > .translation-notice')!
                    .getBoundingClientRect()
                    .toJSON(),
                viewportHeight: window.innerHeight,
                viewportWidth: window.innerWidth,
                headerVariable: getComputedStyle(document.documentElement).getPropertyValue(
                    '--localized-header-height',
                ),
            })),
            null,
            2,
        ),
        contentType: 'application/json',
    });
});

for (const locale of ['es', 'fr'] as const) {
    test(`${locale}: catálogo completo em cache mantém o idioma solicitado`, async ({ page }) => {
        await page.goto(`/publicacoes/blog?lang=${locale}`);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
        await expect(page.getByRole('combobox', { name: 'Idioma / Language' })).toHaveValue(locale);
        await expect(
            page.getByRole('heading', {
                name: `[TEST ${locale}] O que estamos pensando e fazendo`,
                exact: true,
            }),
        ).toBeVisible();
    });
}
