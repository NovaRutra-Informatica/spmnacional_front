import { expect, test } from '@playwright/test';

test('home, carrossel, curva, logo e layout responsivo', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    const hero = page.getByRole('region', { name: 'Destaques do Serviço Pastoral dos Migrantes' });
    await expect(hero).toBeVisible();
    await hero.getByRole('button', { name: 'Pausar rotação automática' }).click();
    await hero.getByRole('button', { name: 'Mostrar destaque 1:', exact: false }).click();
    await expect(
        hero.getByRole('heading', { name: 'Acolher, Proteger, Promover e Integrar.' }),
    ).toBeVisible();
    await hero.getByRole('button', { name: 'Próximo destaque' }).click();
    await expect(
        hero.getByRole('heading', {
            name: 'Cada jornada carrega histórias, direitos e esperança.',
        }),
    ).toBeVisible();
    await expect(page.locator('.hero-carousel .wave-bottom svg')).toBeVisible();
    await expect(page.locator('.main-header .brand-logo')).toHaveCSS('border-radius', '50%');
    const desktopDonate = page.locator('.main-header .header-actions .btn-donate');
    if (await desktopDonate.isVisible()) {
        const bounds = await desktopDonate.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    const width = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
    }));
    expect(width.doc).toBeLessThanOrEqual(width.viewport);
    expect(errors).toEqual([]);
});

test('redução de movimento desativa rotação e mantém navegação', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Pausar rotação automática' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Próximo destaque' }).click();
    await expect(
        page.getByRole('heading', {
            name: 'Cada jornada carrega histórias, direitos e esperança.',
        }),
    ).toBeVisible();
});

test('health, headers e endpoints protegidos', async ({ request }) => {
    for (const path of ['/api/health/live', '/api/health/ready']) {
        const response = await request.get(path);
        expect(response.status()).toBe(200);
        expect(await response.json()).toEqual(
            path.endsWith('/ready')
                ? { status: 'ok', databaseProtocol: 'scoped-rls-v1' }
                : { status: 'ok' },
        );
        expect(response.headers()['cache-control']).toContain('no-store');
    }
    expect((await request.post('/api/cron/retencao')).status()).toBe(401);
    expect((await request.post('/api/cron/agenda')).status()).toBe(401);
    expect((await request.post('/api/cron/notificacoes')).status()).toBe(401);
    expect((await request.get('/api/cron/agenda')).status()).toBe(405);
    expect((await request.post('/api/admin/uploads')).status()).toBe(403);
    expect(
        (
            await request.post('/api/admin/uploads?purpose=biblioteca', {
                headers: { Origin: 'http://localhost:3147' },
            })
        ).status(),
    ).toBe(401);
    expect(
        (await request.get('/_next/image?url=%2Fapi%2Farquivos%2Fprivado.png&w=640&q=75')).status(),
    ).toBe(400);
    const first = await request.get('/atendente');
    const second = await request.get('/atendente');
    expect(first.headers()['x-content-type-options']).toBe('nosniff');
    expect(first.headers()['x-frame-options']).toBe('DENY');
    const csp = first.headers()['content-security-policy'];
    expect(csp).toContain("'nonce-");
    expect(csp.match(/script-src[^;]+/)?.[0]).not.toContain('unsafe-inline');
    expect(second.headers()['content-security-policy']).not.toBe(csp);
    expect(await first.text()).toMatch(/nonce="[^"]+"/);
});

test('entrada exclusiva Workspace, sessão de fixture, biblioteca de mídia e logout', async ({
    page,
    context,
    request,
}, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/admin/midia');
    await expect(page).toHaveURL(/\/atendente/);
    await expect(page.getByLabel('Senha', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Entrar com Google Workspace' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar no ambiente local' })).toHaveCount(0);
    // OAuth signature/claims/cookie issuance have unit coverage. This isolated E2E
    // injects a DB fixture session; it does not authenticate against real Google.
    await context.addCookies([
        {
            name: '__Host-spm_session',
            value:
                testInfo.project.name === 'mobile'
                    ? process.env.E2E_MOBILE_SESSION_TOKEN!
                    : process.env.E2E_SESSION_TOKEN!,
            domain: 'localhost',
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
        },
    ]);
    await page.goto('/admin/midia');
    await expect(page.getByRole('heading', { name: /Biblioteca de mídia/i })).toBeVisible();
    await expect(page.locator('.admin-local-test-notice')).toHaveCount(0);
    const session = (await context.cookies()).find(
        (cookie) => cookie.name === '__Host-spm_session',
    );
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    const uploaded = await context.request.post('/api/admin/uploads?purpose=biblioteca', {
        headers: {
            Origin: 'http://localhost:3147',
            'Content-Type': 'application/octet-stream',
            'X-File-Name': 'pixel-teste.png',
        },
        data: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6HAAAAABJRU5ErkJggg==',
            'base64',
        ),
    });
    expect(uploaded.status()).toBe(201);
    const { media } = await uploaded.json();
    expect((await context.request.get(media.url)).status()).toBe(200);
    expect((await request.get(media.url)).status()).toBe(404);
    const logout = page.getByRole('button', { name: /sair/i }).first();
    if (!(await logout.isVisible()))
        await page
            .getByRole('button', { name: /abrir.*menu|abrir.*navegação/i })
            .first()
            .click();
    await logout.click();
    await expect(page).toHaveURL(/\/atendente/);
    expect(
        (await context.cookies()).find((cookie) => cookie.name === '__Host-spm_session'),
    ).toBeUndefined();
    await page.goto('/admin/midia');
    await expect(page).toHaveURL(/\/atendente/);
    expect(errors).toEqual([]);
});
