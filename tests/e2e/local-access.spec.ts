import { expect, test } from '@playwright/test';

test('acesso local temporário emite cookie real, ignora identidade forjada e encerra sessão', async ({
    page,
    context,
    request,
}, testInfo) => {
    test.skip(process.env.E2E_LOCAL_TEST_AUTH !== 'true', 'Executar pelo modo isolado e2e-local.');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Falha fechada se a interface tentar navegar para autenticação externa.
    let googleRequests = 0;
    await page.route('https://accounts.google.com/**', async (route) => {
        googleRequests += 1;
        await route.abort();
    });

    await page.goto('/admin/midia');
    await expect(page).toHaveURL(/\/atendente/);
    await expect(page.getByRole('link', { name: /Entrar com Google/ })).toHaveCount(0);
    await expect(page.getByLabel('Senha', { exact: true })).toHaveCount(0);
    const enter = page.getByRole('button', { name: 'Entrar no ambiente local', exact: true });
    await expect(enter).toBeVisible();
    await page.locator('.form-card').scrollIntoViewIfNeeded();
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    });
    await page.screenshot({
        path: testInfo.outputPath('local-login.png'),
        fullPage: false,
        animations: 'disabled',
    });
    expect(
        (await context.cookies()).find((cookie) => cookie.name === '__Host-spm_session'),
    ).toBeUndefined();

    // A identidade é determinada somente pelo ID configurado no servidor. Nem
    // fields extras enviados pelo navegador podem selecionar outra conta.
    await enter.evaluate((button) => {
        const form = button.closest('form');
        if (!form) throw new Error('O acesso local precisa de um formulário.');
        for (const [name, value] of [
            ['userId', 'forged-user-id'],
            ['email', 'forged@example.invalid'],
        ]) {
            const field = document.createElement('input');
            field.type = 'hidden';
            field.name = name;
            field.value = value;
            form.appendChild(field);
        }
    });
    const startedAt = Date.now() / 1000;
    await enter.click();
    await expect(page).toHaveURL(/\/admin(?:\/|$)/);
    await page.goto('/admin/midia');
    await expect(page.getByRole('heading', { name: /Biblioteca de mídia/i })).toBeVisible();
    await expect(page.locator('.admin-local-test-notice')).toContainText('Acesso local de teste.');
    await expect(page.locator('.admin-user__info strong')).toHaveText('Administrador de teste');
    await page.screenshot({
        path: testInfo.outputPath('local-admin.png'),
        fullPage: false,
        animations: 'disabled',
    });

    const cookie = (await context.cookies()).find((entry) => entry.name === '__Host-spm_session');
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    expect(cookie!.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie!.expires).toBeGreaterThan(startedAt + 3500);
    expect(cookie!.expires).toBeLessThanOrEqual(startedAt + 3610);
    expect(await page.evaluate(() => document.cookie.includes('__Host-spm_session='))).toBe(false);

    const logout = page.getByRole('button', { name: /sair/i }).first();
    if (!(await logout.isVisible()))
        await page
            .getByRole('button', { name: /abrir.*menu|abrir.*navegação/i })
            .first()
            .click();
    await logout.click();
    await expect(page).toHaveURL(/\/atendente/);
    expect(
        (await context.cookies()).find((entry) => entry.name === '__Host-spm_session'),
    ).toBeUndefined();
    await page.goto('/admin/midia');
    await expect(page).toHaveURL(/\/atendente/);

    // Não basta apagar o cookie no navegador: repetir o token anterior também
    // deve falhar, provando revogação no servidor sem inspecionar banco real.
    const replay = await request.get('/admin/midia', {
        headers: { Cookie: `__Host-spm_session=${cookie!.value}` },
        maxRedirects: 0,
    });
    expect([303, 307, 308]).toContain(replay.status());
    expect(replay.headers().location).toContain('/atendente');
    expect(googleRequests).toBe(0);
    expect(errors).toEqual([]);
});
