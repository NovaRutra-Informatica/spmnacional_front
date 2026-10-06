import { expect, test } from '@playwright/test';

test.describe('consentimento Analytics', () => {
    test.skip(
        process.env.E2E_ANALYTICS !== 'true',
        'Uses a separate isolated server with a synthetic ID.',
    );
    test('só carrega após permitir e mantém dados pessoais e painel fora da medição', async ({
        page,
    }) => {
        const requests: string[] = [];
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('https://www.googletagmanager.com/**', (route) => {
            requests.push(route.request().url());
            return route.fulfill({
                status: 200,
                contentType: 'application/javascript',
                body: '/* isolated test: no external Google code */',
            });
        });
        await page.addInitScript(() => localStorage.setItem('spm_cookies', 'true'));
        await page.goto('/fale-conosco?email=private@example.test#private-token');
        await expect(page.getByRole('button', { name: 'Somente essenciais' })).toBeVisible();
        expect(requests).toHaveLength(0);
        await page.getByRole('button', { name: 'Permitir Analytics' }).click();
        await expect.poll(() => requests.length).toBe(1);
        const publicData = await page.evaluate(() => {
            const data = (window as unknown as { dataLayer: ArrayLike<unknown>[] }).dataLayer;
            return JSON.stringify(data.map((entry) => Array.from(entry)));
        });
        expect(publicData).not.toContain('private@example.test');
        expect(publicData).not.toContain('private-token');
        expect(publicData).toContain('http://localhost:3147/fale-conosco');
        expect(publicData).toContain('"send_page_view":false');
        expect(
            await page
                .locator('script[src*="googletagmanager.com"]')
                .evaluate((node) => (node as HTMLScriptElement).nonce),
        ).toBeTruthy();
        await page.locator('footer a[href="/atendente"]').click();
        await expect(page).toHaveURL(/\/atendente$/);
        expect(await page.evaluate(() => 'dataLayer' in window)).toBe(false);
        await expect(page.locator('script[src*="googletagmanager.com"]')).toHaveCount(0);
        expect(requests).toHaveLength(1);
        expect(errors).toEqual([]);
    });
    test('recusa e revogação são persistentes e não dependem do aviso essencial antigo', async ({
        page,
    }) => {
        let requests = 0;
        await page.route('https://www.googletagmanager.com/**', (route) => {
            requests++;
            return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
        });
        await page.goto('/');
        await page.getByRole('button', { name: 'Somente essenciais' }).click();
        await page.reload();
        await expect(
            page.getByRole('button', { name: 'Preferências de privacidade' }),
        ).toBeVisible();
        expect(requests).toBe(0);
        await page.getByRole('button', { name: 'Preferências de privacidade' }).click();
        await page.getByRole('button', { name: 'Permitir Analytics' }).click();
        await expect.poll(() => requests).toBe(1);
        await page.getByRole('button', { name: 'Preferências de privacidade' }).click();
        await page.getByRole('button', { name: 'Somente essenciais' }).click();
        expect(
            await page.evaluate(
                () => (window as unknown as Record<string, unknown>)['ga-disable-G-TEST123456'],
            ),
        ).toBe(true);
        await page.reload();
        await expect(
            page.getByRole('button', { name: 'Preferências de privacidade' }),
        ).toBeVisible();
        expect(requests).toBe(1);
    });
    test('armazenamento bloqueado permite recusar sem erro ou chamada ao Google', async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        let requests = 0;
        await page.route('https://www.googletagmanager.com/**', (route) => {
            requests++;
            return route.abort();
        });
        await page.addInitScript(() =>
            Object.defineProperty(window, 'localStorage', {
                get() {
                    throw new DOMException('Storage blocked', 'SecurityError');
                },
            }),
        );
        await page.goto('/');
        await page.getByRole('button', { name: 'Somente essenciais' }).click();
        await expect(
            page.getByRole('button', { name: 'Preferências de privacidade' }),
        ).toBeVisible();
        expect(requests).toBe(0);
        expect(errors).toEqual([]);
    });
});
